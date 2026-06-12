import { NextRequest, NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { downloadDriveFile } from "@/lib/google-drive-document-storage";
import { prisma } from "@/lib/prisma";

const DRIVE_FILE_PREFIX = "drive:";

function driveFileIdFromPath(filePath: string) {
  return filePath.startsWith(DRIVE_FILE_PREFIX) ? filePath.slice(DRIVE_FILE_PREFIX.length) : null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; documentId: string }> }
) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { id: equipmentId, documentId } = await context.params;

  const document = await prisma.maintenanceDocument.findFirst({
    where: {
      id: documentId,
      maintenance: {
        equipmentId,
      },
    },
    include: {
      maintenance: {
        select: {
          equipmentId: true,
        },
      },
    },
  });

  if (!document) {
    return NextResponse.json({ error: "Documento non trovato" }, { status: 404 });
  }

  const driveFileId = driveFileIdFromPath(document.filePath);

  if (driveFileId) {
    const wantsRawFile = request.nextUrl.searchParams.get("raw") === "1";
    const documentUrl = `/api/risorse/mezzi/${equipmentId}/maintenance/document/${documentId}?raw=1`;

    if (!wantsRawFile) {
      return NextResponse.json({
        url: documentUrl,
        fileName: document.fileName,
      });
    }

    const buffer = await downloadDriveFile(driveFileId);
    const encodedName = encodeURIComponent(document.fileName);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": document.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, max-age=60",
      },
    });
  }

  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!bucket || !supabaseUrl) {
    return NextResponse.json({ error: "Configurazione Supabase mancante" }, { status: 500 });
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${document.filePath}`;

  return NextResponse.json({
    url: publicUrl,
    fileName: document.fileName,
  });
}
