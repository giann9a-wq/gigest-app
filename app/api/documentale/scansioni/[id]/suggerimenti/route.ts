import { NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";
import { getScanSuggestions } from "@/lib/scan-suggestions-service";

export const maxDuration = 120;
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getActiveAppUser()) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const { id } = await context.params;
  const scan = await prisma.scannedDeliveryNote.findUnique({ where: { id } });
  if (!scan) return NextResponse.json({ error: "Scansione non trovata" }, { status: 404 });
  if (scan.status !== "NEW" && scan.status !== "INSERTED") return NextResponse.json({ error: "Scansione non elaborabile" }, { status: 409 });
  return NextResponse.json(await getScanSuggestions(scan), { headers: { "Cache-Control": "no-store" } });
}
