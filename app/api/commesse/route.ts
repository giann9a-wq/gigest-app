import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { JobType, Prisma, ResourceStatus, UserStatus } from "@prisma/client";

type JobOrderRowInput = {
  id?: string;
  name?: string;
  type?: JobType | string;
  startDate?: string;
  status?: ResourceStatus | string;
  endDate?: string;
  description?: string;
};

const allowedTypes: JobType[] = [
  "SITE",
  "TRAINING",
  "LEAVE",
  "SICKNESS",
  "RAIN",
  "NATIONAL_HOLIDAY",
  "OTHER",
];
const allowedStatuses: ResourceStatus[] = ["ACTIVE", "SUSPENDED", "ENDED", "COMPLETED"];

function parseOptionalDate(value?: string | null) {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

function toInputDate(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function toNumber(value: Prisma.Decimal | null | undefined) {
  if (value == null) return 0;
  return Number(value);
}

function serializeBudget(row: {
  budgetPersonnelCost: Prisma.Decimal | null;
  budgetEquipmentCost: Prisma.Decimal | null;
  budgetMaterialsCost: Prisma.Decimal | null;
  budgetProfessionalServicesCost: Prisma.Decimal | null;
  budgetThirdPartyServicesCost: Prisma.Decimal | null;
  budgetMiscCost: Prisma.Decimal | null;
  budgetExpectedRevenue: Prisma.Decimal | null;
}) {
  return {
    personnel: toNumber(row.budgetPersonnelCost),
    equipment: toNumber(row.budgetEquipmentCost),
    materials: toNumber(row.budgetMaterialsCost),
    professionalServices: toNumber(row.budgetProfessionalServicesCost),
    thirdPartyServices: toNumber(row.budgetThirdPartyServicesCost),
    misc: toNumber(row.budgetMiscCost),
    revenue: toNumber(row.budgetExpectedRevenue),
  };
}

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const dashboardOnly = request.nextUrl.searchParams.get("dashboardOnly") === "true";

  const rows = await prisma.jobOrder.findMany({
    where: dashboardOnly
      ? {
          type: { in: ["SITE", "OTHER"] },
          status: { in: [ResourceStatus.ACTIVE, ResourceStatus.COMPLETED] },
        }
      : undefined,
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      startDate: toInputDate(row.startDate),
      status: row.status,
      endDate: toInputDate(row.endDate),
      description: row.description ?? "",
      budget: serializeBudget(row),
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const appUser = await prisma.user.findUnique({
    where: { email: session.user.email.toLowerCase() },
    select: { id: true, status: true, role: true },
  });

  if (!appUser || appUser.status !== UserStatus.ACTIVE) {
    return NextResponse.json({ error: "Utente non autorizzato" }, { status: 403 });
  }

  const body = await request.json();
  const rows = body.rows as JobOrderRowInput[] | undefined;

  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "Le righe devono essere un array" }, { status: 400 });
  }

  const cleanedRows = rows
    .map((row) => ({
      id: row.id?.trim() || undefined,
      name: row.name?.trim() || "",
      type: (row.type || "") as JobType | "",
      startDate: row.startDate || "",
      status: (row.status || "") as ResourceStatus | "",
      endDate: row.endDate || "",
      description: row.description?.trim() || "",
    }))
    .filter((row) => {
      return (
        row.name ||
        row.type ||
        row.startDate ||
        row.status ||
        row.endDate ||
        row.description
      );
    });

  for (const row of cleanedRows) {
    if (!row.name) {
      return NextResponse.json({ error: "Il campo Commessa è obbligatorio" }, { status: 400 });
    }

    if (!allowedTypes.includes(row.type as JobType)) {
      return NextResponse.json({ error: "Tipologia commessa non valida" }, { status: 400 });
    }

    if (!allowedStatuses.includes(row.status as ResourceStatus)) {
      return NextResponse.json({ error: "Stato commessa non valido" }, { status: 400 });
    }

    if (row.startDate && Number.isNaN(new Date(`${row.startDate}T00:00:00.000Z`).getTime())) {
      return NextResponse.json({ error: "Data inizio non valida" }, { status: 400 });
    }

    if (row.endDate && Number.isNaN(new Date(`${row.endDate}T00:00:00.000Z`).getTime())) {
      return NextResponse.json({ error: "Data fine non valida" }, { status: 400 });
    }
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.jobOrder.findMany({
      select: { id: true },
    });

    const incomingIds = new Set(cleanedRows.filter((r) => r.id).map((r) => r.id!));
    const idsToDelete = existing.map((x) => x.id).filter((id) => !incomingIds.has(id));

    if (idsToDelete.length > 0) {
      const linkedActivitiesCount = await tx.diaryActivity.count({
        where: { jobOrderId: { in: idsToDelete } },
      });

      if (linkedActivitiesCount > 0) {
        throw new Error(
          "Non è possibile eliminare commesse già utilizzate nel Diario. Impostale come ENDED invece di rimuoverle."
        );
      }

      await tx.jobOrder.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    for (const row of cleanedRows) {
      const data = {
        name: row.name,
        type: row.type as JobType,
        startDate: parseOptionalDate(row.startDate),
        status: row.status as ResourceStatus,
        endDate: parseOptionalDate(row.endDate),
        description: row.description || null,
      } satisfies Prisma.JobOrderUncheckedCreateInput;

      if (row.id) {
        await tx.jobOrder.update({
          where: { id: row.id },
          data,
        });
      } else {
        await tx.jobOrder.create({
          data,
        });
      }
    }
  });

  return NextResponse.json({
    success: true,
    savedRows: cleanedRows.length,
  });
}
