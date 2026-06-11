import { NextRequest, NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { downloadDriveFile } from "@/lib/google-drive-document-storage";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; documentId: string }> }
) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { id: personId, documentId } = await context.params;
  const document = await prisma.trainingDocument.findFirst({
    where: {
      id: documentId,
      training: {
        personId,
      },
    },
  });

  if (!document) {
    return NextResponse.json({ error: "Documento non trovato" }, { status: 404 });
  }

  const buffer = await downloadDriveFile(document.driveFileId);
  const encodedName = encodeURIComponent(document.fileName);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": document.mimeType || "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
