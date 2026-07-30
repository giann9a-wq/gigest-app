import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getJobOrderDashboard } from "@/lib/job-order-dashboard";
import { prisma } from "@/lib/prisma";
import { JobType, Prisma, ResourceStatus, UserStatus } from "@prisma/client";

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

function parseOptionalDecimal(value: string | number | null | undefined) {
  if (value == null) return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return new Prisma.Decimal(value.toFixed(2));
  }

  const trimmed = value.trim();
  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");
  let normalized = trimmed;

  if (lastComma >= 0 && lastDot >= 0) {
    normalized =
      lastComma > lastDot
        ? trimmed.replace(/\./g, "").replace(",", ".")
        : trimmed.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = trimmed.replace(",", ".");
  }

  if (!normalized) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return new Prisma.Decimal(parsed.toFixed(2));
}

async function getAuthorizedUser() {
  const session = await auth();

  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: "Non autorizzato" }, { status: 401 }) };
  }

  const appUser = await prisma.user.findUnique({
    where: { email: session.user.email.toLowerCase() },
    select: { id: true, status: true },
  });

  if (!appUser || appUser.status !== UserStatus.ACTIVE) {
    return { error: NextResponse.json({ error: "Utente non autorizzato" }, { status: 403 }) };
  }

  return { appUser };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthorizedUser();
  if (authResult.error) return authResult.error;

  const { id } = await context.params;
  const dashboard = await getJobOrderDashboard(id);

  if (!dashboard) {
    return NextResponse.json({ error: "Commessa non trovata" }, { status: 404 });
  }

  return NextResponse.json(dashboard);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthorizedUser();
  if (authResult.error) return authResult.error;

  const { id } = await context.params;
  const body = await request.json();

  const name = String(body.name ?? "").trim();
  const type = String(body.type ?? "") as JobType;
  const startDate = String(body.startDate ?? "").trim();
  const status = String(body.status ?? "") as ResourceStatus;
  const endDate = String(body.endDate ?? "").trim();
  const description = String(body.description ?? "").trim();
  const isOwnAccountSite = body.isOwnAccountSite === true;
  const budget = {
    personnel: body.budget?.personnel ?? "",
    equipment: body.budget?.equipment ?? "",
    materials: body.budget?.materials ?? "",
    professionalServices: body.budget?.professionalServices ?? "",
    thirdPartyServices: body.budget?.thirdPartyServices ?? "",
    misc: body.budget?.misc ?? "",
    revenue: body.budget?.revenue ?? "",
  };

  if (!name) {
    return NextResponse.json({ error: "Il nome commessa è obbligatorio" }, { status: 400 });
  }

  if (!allowedTypes.includes(type)) {
    return NextResponse.json({ error: "Tipologia commessa non valida" }, { status: 400 });
  }

  if (!allowedStatuses.includes(status)) {
    return NextResponse.json({ error: "Stato commessa non valido" }, { status: 400 });
  }

  const parsedStartDate = parseOptionalDate(startDate);
  const parsedEndDate = parseOptionalDate(endDate);

  if (startDate && (!parsedStartDate || Number.isNaN(parsedStartDate.getTime()))) {
    return NextResponse.json({ error: "Data inizio non valida" }, { status: 400 });
  }

  if (endDate && (!parsedEndDate || Number.isNaN(parsedEndDate.getTime()))) {
    return NextResponse.json({ error: "Data fine non valida" }, { status: 400 });
  }

  for (const value of Object.values(budget)) {
    if (value === "") continue;
    if (parseOptionalDecimal(value) === null) {
      return NextResponse.json(
        { error: "I campi budget devono contenere importi validi" },
        { status: 400 }
      );
    }
  }

  const existing = await prisma.jobOrder.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Commessa non trovata" }, { status: 404 });
  }

  await prisma.jobOrder.update({
    where: { id },
    data: {
      name,
      type,
      startDate: parsedStartDate,
      status,
      endDate: parsedEndDate,
      description: description || null,
      isOwnAccountSite,
      budgetPersonnelCost: parseOptionalDecimal(budget.personnel),
      budgetEquipmentCost: parseOptionalDecimal(budget.equipment),
      budgetMaterialsCost: parseOptionalDecimal(budget.materials),
      budgetProfessionalServicesCost: parseOptionalDecimal(budget.professionalServices),
      budgetThirdPartyServicesCost: parseOptionalDecimal(budget.thirdPartyServices),
      budgetMiscCost: parseOptionalDecimal(budget.misc),
      budgetExpectedRevenue: parseOptionalDecimal(budget.revenue),
    },
  });

  const dashboard = await getJobOrderDashboard(id);

  return NextResponse.json({
    success: true,
    ...dashboard,
  });
}
