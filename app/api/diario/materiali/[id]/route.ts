import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";

function parseDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseQuantity(value: unknown) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return new Prisma.Decimal(parsed.toFixed(3));
}

function serializeMaterial(row: {
  id: string;
  jobOrderId: string;
  description: string;
  unitOfMeasure: string;
  quantity: Prisma.Decimal;
  usageDate: Date;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    jobOrderId: row.jobOrderId,
    description: row.description,
    unitOfMeasure: row.unitOfMeasure,
    quantity: Number(row.quantity),
    usageDate: row.usageDate.toISOString().slice(0, 10),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const jobOrderId = String(body.jobOrderId ?? "").trim();
  const description = String(body.description ?? "").trim();
  const unitOfMeasure = String(body.unitOfMeasure ?? "").trim();
  const usageDateRaw = String(body.usageDate ?? "").trim();
  const quantity = parseQuantity(body.quantity);

  if (!jobOrderId) {
    return NextResponse.json({ error: "La commessa e obbligatoria" }, { status: 400 });
  }

  if (!description) {
    return NextResponse.json({ error: "La descrizione materiale e obbligatoria" }, { status: 400 });
  }

  if (!unitOfMeasure) {
    return NextResponse.json({ error: "L'unita di misura e obbligatoria" }, { status: 400 });
  }

  if (!quantity) {
    return NextResponse.json({ error: "La quantita deve essere maggiore di zero" }, { status: 400 });
  }

  const usageDate = parseDate(usageDateRaw);
  if (!usageDate) {
    return NextResponse.json({ error: "Data non valida" }, { status: 400 });
  }

  const existing = await prisma.materialUsage.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Materiale non trovato" }, { status: 404 });
  }

  const jobOrder = await prisma.jobOrder.findUnique({
    where: { id: jobOrderId },
    select: { id: true },
  });

  if (!jobOrder) {
    return NextResponse.json({ error: "Commessa non trovata" }, { status: 404 });
  }

  const row = await prisma.materialUsage.update({
    where: { id },
    data: {
      jobOrderId,
      description,
      unitOfMeasure,
      quantity,
      usageDate,
      updatedByUserId: appUser.id,
    },
  });

  return NextResponse.json({
    success: true,
    row: serializeMaterial(row),
  });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { id } = await context.params;

  const existing = await prisma.materialUsage.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Materiale non trovato" }, { status: 404 });
  }

  await prisma.materialUsage.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
