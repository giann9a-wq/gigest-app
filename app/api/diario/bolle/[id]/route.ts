import { NextRequest, NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";

function parseDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function serializeDeliveryNote(row: {
  id: string;
  jobOrderId: string;
  supplier: string;
  description: string;
  usageDate: Date;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    jobOrderId: row.jobOrderId,
    supplier: row.supplier,
    description: row.description,
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
  const supplier = String(body.supplier ?? "").trim();
  const description = String(body.description ?? "").trim();
  const usageDateRaw = String(body.usageDate ?? "").trim();

  if (!jobOrderId) {
    return NextResponse.json({ error: "La commessa e obbligatoria" }, { status: 400 });
  }

  if (!supplier) {
    return NextResponse.json({ error: "Il fornitore e obbligatorio" }, { status: 400 });
  }

  if (!description) {
    return NextResponse.json({ error: "La descrizione e obbligatoria" }, { status: 400 });
  }

  const usageDate = parseDate(usageDateRaw);
  if (!usageDate) {
    return NextResponse.json({ error: "Data non valida" }, { status: 400 });
  }

  const existing = await prisma.deliveryNoteUsage.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Bolla non trovata" }, { status: 404 });
  }

  const jobOrder = await prisma.jobOrder.findUnique({
    where: { id: jobOrderId },
    select: { id: true },
  });

  if (!jobOrder) {
    return NextResponse.json({ error: "Commessa non trovata" }, { status: 404 });
  }

  const row = await prisma.deliveryNoteUsage.update({
    where: { id },
    data: {
      jobOrderId,
      supplier,
      description,
      usageDate,
      updatedByUserId: appUser.id,
    },
  });

  return NextResponse.json({
    success: true,
    row: serializeDeliveryNote(row),
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

  const existing = await prisma.deliveryNoteUsage.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Bolla non trovata" }, { status: 404 });
  }

  await prisma.deliveryNoteUsage.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
