import { NextRequest, NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { deleteDriveFile, downloadDriveFile } from "@/lib/google-drive-document-storage";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ photoId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const appUser = await getActiveAppUser();
  if (!appUser) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { photoId } = await context.params;
  const photo = await prisma.photo.findFirst({
    where: { id: photoId, deletedAt: null },
    select: { driveFileId: true, filename: true, mimeType: true },
  });
  if (!photo) return NextResponse.json({ error: "Fotografia non trovata" }, { status: 404 });

  try {
    const buffer = await downloadDriveFile(photo.driveFileId);
    const encodedName = encodeURIComponent(photo.filename);
    const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": photo.mimeType,
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("Photo download failed", error);
    return NextResponse.json({ error: "Impossibile aprire la fotografia" }, { status: 502 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const appUser = await getActiveAppUser();
  if (!appUser) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { photoId } = await context.params;
  const photo = await prisma.photo.findFirst({
    where: { id: photoId, deletedAt: null },
    include: {
      upload: { select: { id: true, userId: true, jobOrderId: true, phaseId: true } },
    },
  });
  if (!photo) return NextResponse.json({ error: "Fotografia non trovata" }, { status: 404 });
  if (appUser.role !== "ADMIN" && photo.upload.userId !== appUser.id) {
    return NextResponse.json({ error: "Non hai i permessi per eliminare questa fotografia" }, { status: 403 });
  }

  try {
    await deleteDriveFile(photo.driveFileId);
    await prisma.$transaction(async (tx) => {
      await tx.photo.update({
        where: { id: photo.id },
        data: { deletedAt: new Date(), deletedByUserId: appUser.id },
      });
      const remaining = await tx.photo.count({ where: { uploadId: photo.uploadId, deletedAt: null } });
      await tx.photoUpload.update({ where: { id: photo.uploadId }, data: { mediaCount: remaining } });
      await tx.photoAuditEvent.create({
        data: {
          action: remaining === 0 ? "UPLOAD_DELETED" : "PHOTO_DELETED",
          actorUserId: appUser.id,
          jobOrderId: photo.upload.jobOrderId,
          phaseId: photo.upload.phaseId,
          uploadId: photo.upload.id,
          photoId: photo.id,
          details: { filename: photo.filename, remainingMediaCount: remaining },
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Photo deletion failed", error);
    return NextResponse.json({ error: "Eliminazione fotografia fallita" }, { status: 500 });
  }
}
