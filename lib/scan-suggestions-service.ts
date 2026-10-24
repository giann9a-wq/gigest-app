import { prisma } from "@/lib/prisma";
import { readScanText } from "@/lib/scan-ocr";
import { suggestScan } from "@/lib/scan-suggestions";

const pending = new Map<string, Promise<string>>();
const cache = new Map<string, { text: string; expires: number }>();
async function scanText(id: string) {
  const cached = cache.get(id);
  if (cached && cached.expires > Date.now()) return cached.text;
  if (pending.has(id)) return pending.get(id)!;
  const work = readScanText(id).then(text => {
    for (const [key, entry] of cache) if (entry.expires < Date.now()) cache.delete(key);
    if (cache.size >= 50) cache.delete(cache.keys().next().value!);
    cache.set(id, { text, expires: Date.now()+15*60*1000 });
    return text;
  }).finally(() => pending.delete(id));
  pending.set(id, work);
  return work;
}
export async function getScanSuggestions(scan: { driveFileId: string; fromEmail: string }) {
  const [history, suppliers, jobs] = await Promise.all([
    prisma.deliveryNoteUsage.findMany({ orderBy: { createdAt: "desc" }, take: 5000, select: { supplier: true, description: true, jobOrderId: true, sourceScan: { select: { fromEmail: true } } } }),
    prisma.costActualEntry.findMany({ distinct: ["supplierName"], where: { supplierName: { not: null } }, select: { supplierName: true } }),
    prisma.jobOrder.findMany({ select: { id: true, name: true, siteAddress: true, status: true, type: true } }),
  ]);
  let text = "", warning: string | null = null;
  try { text = await scanText(scan.driveFileId); }
  catch { warning = "Lettura automatica del PDF non disponibile. Puoi compilare i campi manualmente; eventuali suggerimenti dal mittente restano da verificare."; }
  return { suggestions: suggestScan({ text, fromEmail: scan.fromEmail, history: history.map(h => ({ ...h, fromEmail: h.sourceScan?.fromEmail })), suppliers: [...new Set([...history.map(h => h.supplier), ...suppliers.flatMap(s => s.supplierName ? [s.supplierName] : [])])], jobs }), warning, recognizedText: text };
}
