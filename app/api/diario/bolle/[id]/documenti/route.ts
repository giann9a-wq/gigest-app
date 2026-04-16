import { NextRequest, NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import {
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

  const document = await prisma.deliveryNoteDocument.create({
    data: {
      deliveryNoteId: deliveryNote.id,
      fileName: uploaded.fileName,
      driveFileId: uploaded.driveFileId,
      mimeType: uploaded.mimeType,
      sizeBytes: uploaded.sizeBytes,
      uploadedById: appUser.id,
    },
  });

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
