import { NextRequest, NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { downloadDriveFile } from "@/lib/google-drive-document-storage";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { id } = await context.params;
  const scan = await prisma.scannedDeliveryNote.findUnique({ where: { id } });

  if (!scan) {
    return NextResponse.json({ error: "Scansione non trovata" }, { status: 404 });
  }

  const buffer = await downloadDriveFile(scan.driveFileId);
  const encodedName = encodeURIComponent(scan.fileName);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": scan.mimeType || "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
