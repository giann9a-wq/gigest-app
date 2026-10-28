import { NextRequest, NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { assertRecordWritable } from "@/lib/job-order-dossiers";
import { salesTransaction, SalesError } from "@/lib/property-sales";
import { salesApiError } from "@/lib/property-sales-api";
import { deleteDriveFile, ensureJobOrderDossierFolder, uploadDocumentBufferToDrive } from "@/lib/google-drive-document-storage";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getActiveAppUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  let uploadedId: string | undefined;
  try {
    const { id: jobOrderId } = await context.params;
    const form = await request.formData();
    const recordId = String(form.get("recordId") ?? "");
    const documentId = String(form.get("documentId") ?? "");
    const title = String(form.get("title") ?? "").trim().slice(0, 300);
    const note = String(form.get("note") ?? "").trim().slice(0, 2000);
    const file = form.get("file");
    await assertRecordWritable(jobOrderId, recordId);
    if (!(file instanceof File) || !file.size || file.size > 4 * 1024 * 1024) throw new SalesError("Carica un file non vuoto fino a 4 MB");
    const extension = file.name.split(".").pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", zip: "application/zip", dwg: "application/octet-stream", dxf: "application/octet-stream" };
    if (!extension || !mimeTypes[extension]) throw new SalesError("Formato supportato: PDF, immagini, DOCX, XLSX, ZIP, DWG o DXF");
    if (documentId && !await prisma.jobOrderDocument.findFirst({ where: { id: documentId, jobOrderId, links: { some: { recordId } } } })) throw new SalesError("Documento non collegato alla scheda");
    if (!documentId && !title) throw new SalesError("Il titolo del documento è obbligatorio");
    const folderId = await ensureJobOrderDossierFolder(jobOrderId);
    const uploaded = await uploadDocumentBufferToDrive({ folderId, fileName: file.name, mimeType: mimeTypes[extension], buffer: Buffer.from(await file.arrayBuffer()) });
    uploadedId = uploaded.driveFileId;
    await salesTransaction(async tx => {
      const record = await tx.jobOrderRecord.findFirst({ where: { id: recordId, jobOrderId }, include: { jobOrder: true } });
      if (!record || (record.kind === "TECHNICAL" ? !record.jobOrder.technicalBookEnabled : !record.jobOrder.clientDossierEnabled)) throw new SalesError("Scheda o modulo non disponibile");
      let doc = documentId ? await tx.jobOrderDocument.findFirst({ where: { id: documentId, jobOrderId, links: { some: { recordId } } } }) : null;
      if (documentId && !doc) throw new SalesError("Documento non disponibile");
      if (!doc) doc = await tx.jobOrderDocument.create({ data: { jobOrderId, title, links: { create: { recordId } } } });
      const last = await tx.jobOrderDocumentRevision.aggregate({ where: { documentId: doc.id }, _max: { revision: true } });
      await tx.jobOrderDocumentRevision.create({ data: { documentId: doc.id, revision: (last._max.revision ?? 0) + 1,
        driveFileId: uploaded.driveFileId, fileName: uploaded.fileName, mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes, actor: user.email, note } });
    });
    uploadedId = undefined;
    return NextResponse.json({ success: true });
  } catch (e) {
    if (uploadedId) await deleteDriveFile(uploadedId).catch(error => console.error("Dossier upload cleanup failed", error));
    return salesApiError(e);
  }
}
