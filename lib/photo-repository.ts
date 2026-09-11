import { PhotoUploadSource, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  deleteDriveFile,
  ensurePhotoRepositoryFolder,
  uploadDocumentBufferToDrive,
} from "@/lib/google-drive-document-storage";
import { activePhotoJobOrderById } from "@/lib/job-order-access";

export const PHOTO_MAX_FILES = 20;
export const PHOTO_MAX_SIZE_BYTES = 15 * 1024 * 1024;
export const PHOTO_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export type PhotoMediaInput = {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  whatsappMediaId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export function normalizePhaseName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("it-IT");
}

export function normalizeWhatsappPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

export async function ensurePhotoPhase(input: {
  jobOrderId: string;
  phaseId?: string | null;
  phaseName?: string | null;
  createdByUserId?: string | null;
}) {
  if (input.phaseId) {
    const phase = await prisma.photoPhase.findFirst({
      where: { id: input.phaseId, jobOrderId: input.jobOrderId },
    });
    if (!phase) throw new Error("Fase non valida per la commessa selezionata");
    return phase;
  }

  const name = input.phaseName?.trim().replace(/\s+/g, " ") ?? "";
  if (!name) throw new Error("Seleziona o crea una fase");
  if (name.length > 100) throw new Error("Il nome della fase non può superare 100 caratteri");

  const normalizedName = normalizePhaseName(name);
  return prisma.photoPhase.upsert({
    where: {
      jobOrderId_normalizedName: {
        jobOrderId: input.jobOrderId,
        normalizedName,
      },
    },
    update: {},
    create: {
      jobOrderId: input.jobOrderId,
      name,
      normalizedName,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
}

function storageFileName(filename: string) {
  const extension = filename.includes(".") ? `.${filename.split(".").pop()}` : "";
  const base = filename
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "foto";
  return `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${base}${extension.toLowerCase()}`;
}

export async function createPhotoUpload(input: {
  jobOrderId: string;
  phaseId?: string | null;
  phaseName?: string | null;
  userId: string;
  note?: string | null;
  source: PhotoUploadSource;
  whatsappSessionId?: string | null;
  whatsappPhone?: string | null;
  media: PhotoMediaInput[];
}) {
  if (input.media.length === 0) throw new Error("Aggiungi almeno una fotografia");
  if (input.media.length > PHOTO_MAX_FILES) {
    throw new Error(`Puoi caricare al massimo ${PHOTO_MAX_FILES} fotografie per batch`);
  }

  for (const item of input.media) {
    if (!PHOTO_ALLOWED_MIME_TYPES.has(item.mimeType)) {
      throw new Error(`Formato non supportato per ${item.filename}`);
    }
    if (item.buffer.length > PHOTO_MAX_SIZE_BYTES) {
      throw new Error(`${item.filename} supera il limite di 15 MB`);
    }
  }

  const jobOrder = await prisma.jobOrder.findFirst({
    where: activePhotoJobOrderById(input.jobOrderId),
    select: { id: true, name: true },
  });
  if (!jobOrder) throw new Error("Commessa non trovata o non più attiva");

  const phase = await ensurePhotoPhase({
    jobOrderId: input.jobOrderId,
    phaseId: input.phaseId,
    phaseName: input.phaseName,
    createdByUserId: input.userId,
  });
  const folderId = await ensurePhotoRepositoryFolder({
    jobOrderName: jobOrder.name,
    phaseName: phase.name,
  });

  const stored: Array<{
    driveFileId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    original: PhotoMediaInput;
  }> = [];

  try {
    for (const item of input.media) {
      const uploaded = await uploadDocumentBufferToDrive({
        fileName: storageFileName(item.filename),
        mimeType: item.mimeType,
        buffer: item.buffer,
        folderId,
      });
      stored.push({ ...uploaded, original: item });
    }

    return await prisma.$transaction(async (tx) => {
      const upload = await tx.photoUpload.create({
        data: {
          jobOrderId: jobOrder.id,
          phaseId: phase.id,
          userId: input.userId,
          note: input.note?.trim() || null,
          source: input.source,
          whatsappSessionId: input.whatsappSessionId ?? null,
          mediaCount: stored.length,
          photos: {
            create: stored.map((item) => ({
              storagePath: `google-drive://${item.driveFileId}`,
              driveFileId: item.driveFileId,
              filename: item.original.filename,
              mimeType: item.mimeType,
              sizeBytes: item.sizeBytes,
              whatsappMediaId: item.original.whatsappMediaId ?? null,
              metadata: item.original.metadata,
            })),
          },
        },
        include: { photos: true, phase: true, jobOrder: true },
      });

      await tx.photoAuditEvent.create({
        data: {
          action: "UPLOAD_CREATED",
          actorUserId: input.userId,
          whatsappPhone: input.whatsappPhone ?? null,
          jobOrderId: jobOrder.id,
          phaseId: phase.id,
          uploadId: upload.id,
          details: {
            source: input.source,
            mediaCount: stored.length,
            note: input.note?.trim() || null,
          },
        },
      });

      return upload;
    });
  } catch (error) {
    await Promise.allSettled(stored.map((item) => deleteDriveFile(item.driveFileId)));
    throw error;
  }
}
