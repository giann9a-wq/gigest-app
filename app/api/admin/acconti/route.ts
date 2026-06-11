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

function serializeAdvance(row: {
  id: string;
  jobOrderId: string;
  advanceDate: Date;
  description: string;
  amount: Prisma.Decimal;
  isActive: boolean;
  disabledReason: string | null;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  jobOrder: { name: string };
}) {
  return {
    id: row.id,
    jobOrderId: row.jobOrderId,
    jobOrderName: row.jobOrder.name,
    advanceDate: row.advanceDate.toISOString().slice(0, 10),
    description: row.description,
    amount: Number(row.amount),
    isActive: row.isActive,
    disabledReason: row.disabledReason ?? "",
    disabledAt: row.disabledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  const adminUser = await requireElevatedAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  }

  const [advances, jobOrders] = await Promise.all([
    prisma.jobOrderAdvance.findMany({
      orderBy: [{ isActive: "desc" }, { advanceDate: "desc" }, { createdAt: "desc" }],
      include: {
        jobOrder: {
          select: { name: true },
        },
      },
    }),
    prisma.jobOrder.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, status: true },
    }),
  ]);

  return NextResponse.json({
    advances: advances.map(serializeAdvance),
    jobOrders,
  });
}

export async function POST(request: NextRequest) {
  const adminUser = await requireElevatedAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  }

  const body = await request.json();
  const jobOrderId = String(body.jobOrderId ?? "").trim();
  const advanceDate = parseDate(String(body.advanceDate ?? "").trim());
  const description = String(body.description ?? "").trim();
  const amount = parseAmount(body.amount);

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

  const advance = await prisma.jobOrderAdvance.create({
    data: {
      jobOrderId,
      advanceDate,
      description,
      amount,
      isActive: body.isActive === false ? false : true,
      disabledReason: body.isActive === false ? String(body.disabledReason ?? "").trim() || null : null,
      disabledAt: body.isActive === false ? new Date() : null,
      createdByUserId: adminUser.id,
      updatedByUserId: adminUser.id,
    },
  });

  await recalculateJobOrderActualRevenue(jobOrderId);

  return NextResponse.json({ success: true, id: advance.id });
}
