import { NextRequest, NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import {
  deleteDriveFile,
  ensureEquipmentMaintenanceFolder,
  uploadMaintenanceDocumentToDrive,
} from "@/lib/google-drive-document-storage";
import { prisma } from "@/lib/prisma";

const DRIVE_FILE_PREFIX = "drive:";

function drivePath(fileId: string) {
  return `${DRIVE_FILE_PREFIX}${fileId}`;
}

function driveFileIdFromPath(filePath: string) {
  return filePath.startsWith(DRIVE_FILE_PREFIX) ? filePath.slice(DRIVE_FILE_PREFIX.length) : null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { id: equipmentId } = await context.params;
  const formData = await request.formData();
  const maintenanceId = String(formData.get("maintenanceId") || "");
  const file = formData.get("file");

  if (!maintenanceId) {
    return NextResponse.json({ error: "maintenanceId mancante" }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File mancante" }, { status: 400 });
  }

  const maintenance = await prisma.maintenance.findFirst({
    where: {
      id: maintenanceId,
      equipmentId,
    },
    include: {
      equipment: {
        select: { nameDescription: true },
      },
      documents: {
        select: { id: true, filePath: true },
      },
    },
  });

  if (!maintenance) {
    return NextResponse.json({ error: "Manutenzione non trovata" }, { status: 404 });
  }

  let uploadedDriveFileId: string | null = null;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const folderId = await ensureEquipmentMaintenanceFolder({
      equipmentName: maintenance.equipment.nameDescription,
      interventionDate: maintenance.interventionDate,
    });
    const uploaded = await uploadMaintenanceDocumentToDrive({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      buffer,
      folderId,
    });
    uploadedDriveFileId = uploaded.driveFileId;

    const document = await prisma.$transaction(async (tx) => {
      if (maintenance.documents.length > 0) {
        await tx.maintenanceDocument.deleteMany({
          where: { maintenanceId: maintenance.id },
        });
      }

      return tx.maintenanceDocument.create({
        data: {
          maintenanceId,
          fileName: uploaded.fileName,
          filePath: drivePath(uploaded.driveFileId),
          mimeType: uploaded.mimeType,
          sizeBytes: uploaded.sizeBytes,
        },
      });
    });

    const previousDriveFileIds = maintenance.documents
      .map((item) => driveFileIdFromPath(item.filePath))
      .filter((item): item is string => Boolean(item));

    if (previousDriveFileIds.length > 0) {
      await Promise.allSettled(previousDriveFileIds.map((fileId) => deleteDriveFile(fileId)));
    }

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        fileName: document.fileName,
        filePath: document.filePath,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
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
