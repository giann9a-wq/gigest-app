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

export async function GET(request: NextRequest) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const jobOrderId = request.nextUrl.searchParams.get("jobOrderId")?.trim() || "";

  const [rows, deliveryNoteSuppliers, costSuppliers, descriptionSuggestions] = await Promise.all([
    jobOrderId
      ? prisma.deliveryNoteUsage.findMany({
          where: { jobOrderId },
          orderBy: [{ usageDate: "desc" }, { createdAt: "desc" }],
        })
      : Promise.resolve([]),
    prisma.deliveryNoteUsage.findMany({
      distinct: ["supplier"],
      orderBy: { supplier: "asc" },
      select: { supplier: true },
    }),
    prisma.costActualEntry.findMany({
      distinct: ["supplierName"],
      where: {
        supplierName: {
          not: null,
        },
      },
      orderBy: { supplierName: "asc" },
      select: { supplierName: true },
    }),
    prisma.deliveryNoteUsage.findMany({
      distinct: ["description"],
      orderBy: { description: "asc" },
      select: { description: true },
    }),
  ]);
  const supplierSuggestions = [
    ...new Set(
      [
        ...costSuppliers.map((item) => item.supplierName ?? ""),
        ...deliveryNoteSuppliers.map((item) => item.supplier),
      ]
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));

  return NextResponse.json({
    rows: rows.map(serializeDeliveryNote),
    supplierSuggestions,
    descriptionSuggestions: descriptionSuggestions.map((item) => item.description).filter(Boolean),
  });
}

export async function POST(request: NextRequest) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

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

  const jobOrder = await prisma.jobOrder.findUnique({
    where: { id: jobOrderId },
    select: { id: true },
  });

  if (!jobOrder) {
    return NextResponse.json({ error: "Commessa non trovata" }, { status: 404 });
  }

  const row = await prisma.deliveryNoteUsage.create({
    data: {
      jobOrderId,
      supplier,
      description,
      usageDate,
      createdByUserId: appUser.id,
      updatedByUserId: appUser.id,
    },
  });

  return NextResponse.json({
    success: true,
    row: serializeDeliveryNote(row),
  });
}
