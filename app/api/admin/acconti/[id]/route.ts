import { NextRequest, NextResponse } from "next/server";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import { recalculateJobOrderActualRevenue } from "@/lib/job-order-revenue";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

function parseDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseAmount(value: unknown) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const normalized =
    lastComma >= 0 && lastDot >= 0
      ? lastComma > lastDot
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.replace(/,/g, "")
      : lastComma >= 0
        ? raw.replace(",", ".")
        : raw;
  const parsed = typeof value === "number" ? value : Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return new Prisma.Decimal(parsed.toFixed(2));
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const adminUser = await requireElevatedAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  }

  const { id } = await context.params;
  const existing = await prisma.jobOrderAdvance.findUnique({
    where: { id },
    select: { id: true, jobOrderId: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Acconto non trovato" }, { status: 404 });
  }

  const body = await request.json();
  const jobOrderId = String(body.jobOrderId ?? "").trim();
  const advanceDate = parseDate(String(body.advanceDate ?? "").trim());
  const description = String(body.description ?? "").trim();
  const amount = parseAmount(body.amount);
  const isActive = body.isActive !== false;
  const disabledReason = String(body.disabledReason ?? "").trim();

  if (!jobOrderId) {
    return NextResponse.json({ error: "Commessa obbligatoria" }, { status: 400 });
  }

  if (!advanceDate) {
    return NextResponse.json({ error: "Data acconto non valida" }, { status: 400 });
  }

  if (!description) {
    return NextResponse.json({ error: "Descrizione obbligatoria" }, { status: 400 });
  }

  if (!amount || amount.lte(0)) {
    return NextResponse.json({ error: "Importo acconto non valido" }, { status: 400 });
  }

  const jobOrder = await prisma.jobOrder.findUnique({
    where: { id: jobOrderId },
    select: { id: true },
  });

  if (!jobOrder) {
    return NextResponse.json({ error: "Commessa non trovata" }, { status: 404 });
  }

  await prisma.jobOrderAdvance.update({
    where: { id },
    data: {
      jobOrderId,
      advanceDate,
      description,
      amount,
      isActive,
      disabledReason: isActive ? null : disabledReason || "Spento manualmente",
      disabledAt: isActive ? null : new Date(),
      updatedByUserId: adminUser.id,
    },
  });

  await Promise.all(
    [...new Set([existing.jobOrderId, jobOrderId])].map((affectedJobOrderId) =>
      recalculateJobOrderActualRevenue(affectedJobOrderId)
    )
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const adminUser = await requireElevatedAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  }

  const { id } = await context.params;
  const existing = await prisma.jobOrderAdvance.findUnique({
    where: { id },
    select: { id: true, jobOrderId: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Acconto non trovato" }, { status: 404 });
  }

  await prisma.jobOrderAdvance.delete({
    where: { id },
  });

  await recalculateJobOrderActualRevenue(existing.jobOrderId);

  return NextResponse.json({ success: true });
}
