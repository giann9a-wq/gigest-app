import { after, NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";
import { preparedScanData, prepareScanSuggestions } from "@/lib/scan-suggestions-service";

export const maxDuration = 120;
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getActiveAppUser()) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const { id } = await context.params;
  const scan = await prisma.scannedDeliveryNote.findUnique({ where: { id } });
  if (!scan) return NextResponse.json({ error: "Scansione non trovata" }, { status: 404 });
  if (scan.status !== "NEW") return NextResponse.json({ error: "Bolla già elaborata: i valori salvati non vengono ricalcolati" }, { status: 409 });
  const data = scan.ocrStatus === "READY" ? preparedScanData(scan.ocrData) : null;
  if (data) return NextResponse.json({ suggestions: data.suggestions, ocrStatus: "READY" }, { headers: { "Cache-Control": "no-store" } });
  after(() => prepareScanSuggestions(id));
  return NextResponse.json({ suggestions: {}, ocrStatus: scan.ocrStatus, warning: scan.ocrStatus === "ERROR" ? "Compilazione manuale" : null }, { status: scan.ocrStatus === "ERROR" ? 200 : 202, headers: { "Cache-Control": "no-store" } });
}
