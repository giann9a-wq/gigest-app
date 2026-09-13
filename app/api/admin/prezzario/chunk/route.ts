import { NextRequest, NextResponse } from "next/server";
import { PriceListVersionStatus, Prisma } from "@prisma/client";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const user = await requireElevatedAdminUser();
  if (!user) return NextResponse.json({ error: "Accesso admin richiesto" }, { status: 403 });
  try {
    const body = await request.json();
    if (body.action === "start") {
      const version = await prisma.priceListVersion.create({ data: { name: String(body.name ?? "").trim() || "Nuovo prezzario", sourceLabel: "Upload area Admin GiGEST", createdById: user.id } });
      return NextResponse.json({ versionId: version.id });
    }
    const versionId = String(body.versionId ?? "");
    const version = await prisma.priceListVersion.findUnique({ where: { id: versionId } });
    if (!version || version.status !== PriceListVersionStatus.IMPORTING) throw new Error("Sessione di import non valida o già conclusa.");
    if (body.action === "batch") {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      await prisma.priceListItem.createMany({ data: rows.map((row: Record<string, unknown>) => ({
        versionId, code: String(row.code ?? "").trim(), description: String(row.description ?? "").trim(),
        regionalDescription: String(row.regionalDescription ?? "").trim() || null,
        detailDescription: String(row.detailDescription ?? "").trim() || null,
        unit: String(row.unit ?? "").trim() || null, price: new Prisma.Decimal(Number(row.price ?? 0).toFixed(4)),
        sourceFile: String(row.sourceFile ?? "upload.xlsx"), category: String(row.category ?? "").trim() || null,
      })).filter((row: { code: string; description: string }) => row.code && row.description), skipDuplicates: true });
      return NextResponse.json({ accepted: rows.length });
    }
    if (body.action === "finish") {
      const itemCount = await prisma.priceListItem.count({ where: { versionId } });
      if (!itemCount) throw new Error("Nessuna voce valida importata.");
      await prisma.$transaction([
        prisma.priceListVersion.updateMany({ where: { id: { not: versionId }, status: PriceListVersionStatus.ACTIVE }, data: { status: PriceListVersionStatus.ARCHIVED } }),
        prisma.priceListVersion.update({ where: { id: versionId }, data: { status: PriceListVersionStatus.ACTIVE, itemCount, importedAt: new Date() } }),
      ]);
      return NextResponse.json({ success: true, itemCount });
    }
    throw new Error("Azione import non valida.");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import non riuscito" }, { status: 400 });
  }
}
