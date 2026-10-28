import { NextRequest, NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";
import { downloadDriveFile } from "@/lib/google-drive-document-storage";
import { salesApiError } from "@/lib/property-sales-api";
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string; revisionId: string }> }) {
  if (!await getActiveAppUser()) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  try {
    const { id, revisionId } = await context.params;
    const revision = await prisma.jobOrderDocumentRevision.findFirst({ where: { id: revisionId, document: { jobOrderId: id } } });
    if (!revision) return NextResponse.json({ error: "Documento non trovato" }, { status: 404 });
    const buffer = await downloadDriveFile(revision.driveFileId);
    const inline = ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(revision.mimeType);
    return new NextResponse(buffer, { headers: { "Content-Type": revision.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(revision.fileName)}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) { return salesApiError(e); }
}
