import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readScanText } from "@/lib/scan-ocr";
import { suggestScan, type ScanSuggestions } from "@/lib/scan-suggestions";

const RETRY_AFTER_MS = 5 * 60 * 1000;
export type PreparedScanData = { suggestions: ScanSuggestions; recognizedText: string };

export function preparedScanData(value: unknown): PreparedScanData | null {
  if (!value || typeof value !== "object" || !("suggestions" in value)) return null;
  const data = value as PreparedScanData;
  if (!data.suggestions || typeof data.suggestions !== "object") return null;
  return data;
}

// Database leases coordinate serverless instances. No delivery note is created:
// the final write is conditional on the scan still being NEW.
export async function prepareScanSuggestions(id: string, readText = readScanText, database = prisma) {
  const now = new Date();
  const stale = new Date(now.getTime() - RETRY_AFTER_MS);
  const claimed = await database.scannedDeliveryNote.updateMany({
    where: {
      id, status: "NEW",
      OR: [
        { ocrStatus: "PENDING" },
        { ocrStatus: { in: ["ERROR", "PROCESSING"] }, ocrAttemptedAt: { lt: stale } },
      ],
    },
    data: { ocrStatus: "PROCESSING", ocrAttemptedAt: now, ocrError: null },
  });
  if (!claimed.count) return;
  const lease = { id, status: "NEW" as const, ocrStatus: "PROCESSING", ocrAttemptedAt: now };
  try {
    const scan = await database.scannedDeliveryNote.findUnique({ where: { id } });
    if (!scan || scan.status !== "NEW") return;
    const [text, history, suppliers, jobs] = await Promise.all([
      readText(scan.driveFileId),
      database.deliveryNoteUsage.findMany({ orderBy: { createdAt: "desc" }, take: 5000, select: { supplier: true, description: true, jobOrderId: true, sourceScan: { select: { fromEmail: true } } } }),
      database.costActualEntry.findMany({ distinct: ["supplierName"], where: { supplierName: { not: null } }, select: { supplierName: true } }),
      database.jobOrder.findMany({ select: { id: true, name: true, siteAddress: true, status: true, type: true } }),
    ]);
    const suggestions = suggestScan({ text, fromEmail: scan.fromEmail, history: history.map(h => ({ ...h, fromEmail: h.sourceScan?.fromEmail })), suppliers: [...new Set([...history.map(h => h.supplier), ...suppliers.flatMap(s => s.supplierName ? [s.supplierName] : [])])], jobs });
    await database.scannedDeliveryNote.updateMany({ where: lease, data: { ocrStatus: "READY", ocrData: { suggestions, recognizedText: text } as Prisma.InputJsonValue, ocrError: null } });
  } catch (error) {
    await database.scannedDeliveryNote.updateMany({ where: lease, data: { ocrStatus: "ERROR", ocrError: "Lettura automatica non disponibile" } });
    console.error("Preparazione OCR scansione fallita", { id, error: error instanceof Error ? error.message : String(error) });
  }
}

export async function preparePendingScanSuggestions() {
  const stale = new Date(Date.now() - RETRY_AFTER_MS);
  const rows = await prisma.scannedDeliveryNote.findMany({
    where: {
      status: "NEW",
      OR: [ { ocrStatus: "PENDING" }, { ocrStatus: { in: ["ERROR", "PROCESSING"] }, ocrAttemptedAt: { lt: stale } } ],
    },
    orderBy: { receivedAt: "asc" }, take: 6, select: { id: true },
  });
  let next = 0;
  const work = async () => { while (next < rows.length) await prepareScanSuggestions(rows[next++].id); };
  await Promise.all([work(), work()]);
}
