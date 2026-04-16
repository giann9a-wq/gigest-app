import { NextRequest, NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { downloadDriveFile } from "@/lib/google-drive-document-storage";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ documentId: string }> }
) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { documentId } = await context.params;
  const document = await prisma.deliveryNoteDocument.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    return NextResponse.json({ error: "Documento non trovato" }, { status: 404 });
  }

  const buffer = await downloadDriveFile(document.driveFileId);
  const encodedName = encodeURIComponent(document.fileName);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": document.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
