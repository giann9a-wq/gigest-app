import { NextRequest, NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import {
  deleteDriveFile,
  ensureDeliveryNoteFolder,
  uploadDeliveryNoteDocumentToDrive,
} from "@/lib/google-drive-document-storage";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { id } = await context.params;
  const formData = await request.formData();
  const file = formData.get("file");
  const replaceExisting = formData.get("replace") === "true";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File mancante" }, { status: 400 });
  }

  const deliveryNote = await prisma.deliveryNoteUsage.findUnique({
    where: { id },
    include: {
      jobOrder: {
        select: { name: true },
      },
    },
  });

  if (!deliveryNote) {
    return NextResponse.json({ error: "Bolla non trovata" }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const folderId = await ensureDeliveryNoteFolder({
    jobOrderName: deliveryNote.jobOrder.name,
    supplier: deliveryNote.supplier,
    usageDate: deliveryNote.usageDate,
  });
  const uploaded = await uploadDeliveryNoteDocumentToDrive({
    fileName: file.name,
    mimeType: file.type || "application/pdf",
    buffer,
    folderId,
  });

  const existingDocuments = replaceExisting
    ? await prisma.deliveryNoteDocument.findMany({
        where: { deliveryNoteId: deliveryNote.id },
        select: { id: true, driveFileId: true },
      })
    : [];

  const document = await prisma.$transaction(async (tx) => {
    if (replaceExisting && existingDocuments.length > 0) {
      await tx.deliveryNoteDocument.deleteMany({
        where: { deliveryNoteId: deliveryNote.id },
      });
    }

    return tx.deliveryNoteDocument.create({
      data: {
        deliveryNoteId: deliveryNote.id,
        fileName: uploaded.fileName,
        driveFileId: uploaded.driveFileId,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        uploadedById: appUser.id,
      },
    });
  });

  if (replaceExisting && existingDocuments.length > 0) {
    await Promise.allSettled(existingDocuments.map((item) => deleteDriveFile(item.driveFileId)));
  }

  return NextResponse.json({
    success: true,
    document: {
      id: document.id,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      createdAt: document.createdAt.toISOString(),
    },
  });
}
