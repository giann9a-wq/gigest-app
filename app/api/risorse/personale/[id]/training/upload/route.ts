import { NextRequest, NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import {
  deleteDriveFile,
  ensurePersonTrainingFolder,
  uploadTrainingDocumentToDrive,
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

  const { id: personId } = await context.params;
  const formData = await request.formData();
  const trainingId = String(formData.get("trainingId") || "");
  const file = formData.get("file");

  if (!trainingId) {
    return NextResponse.json({ error: "trainingId mancante" }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File mancante" }, { status: 400 });
  }

  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    return NextResponse.json({ error: "Allegare un file PDF" }, { status: 400 });
  }

  const training = await prisma.training.findFirst({
    where: {
      id: trainingId,
      personId,
    },
    include: {
      person: {
        select: { fullName: true },
      },
      documents: {
        select: { id: true, driveFileId: true },
      },
    },
  });

  if (!training) {
    return NextResponse.json({ error: "Formazione non trovata" }, { status: 404 });
  }

  let uploadedDriveFileId: string | null = null;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const folderId = await ensurePersonTrainingFolder({
      personName: training.person.fullName,
      trainingDate: training.trainingDate,
    });
    const uploaded = await uploadTrainingDocumentToDrive({
      fileName: file.name,
      mimeType: file.type || "application/pdf",
      buffer,
      folderId,
    });
    uploadedDriveFileId = uploaded.driveFileId;

    const document = await prisma.$transaction(async (tx) => {
      if (training.documents.length > 0) {
        await tx.trainingDocument.deleteMany({
          where: { trainingId: training.id },
        });
      }

      return tx.trainingDocument.create({
        data: {
          trainingId: training.id,
          fileName: uploaded.fileName,
          driveFileId: uploaded.driveFileId,
          mimeType: uploaded.mimeType,
          sizeBytes: uploaded.sizeBytes,
          uploadedById: appUser.id,
        },
      });
    });

    if (training.documents.length > 0) {
      await Promise.allSettled(training.documents.map((item) => deleteDriveFile(item.driveFileId)));
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
  } catch (err) {
    if (uploadedDriveFileId) {
      await deleteDriveFile(uploadedDriveFileId).catch(() => undefined);
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore upload documento" },
      { status: 500 }
    );
  }
}
