import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { JobType, ResourceStatus, UserStatus } from "@prisma/client";

const allowedTypes: JobType[] = ["SITE", "TRAINING", "LEAVE", "SICKNESS", "OTHER"];
const allowedStatuses: ResourceStatus[] = ["ACTIVE", "SUSPENDED", "ENDED"];

function parseOptionalDate(value?: string | null) {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

function toInputDate(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
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

  const jobOrder = await prisma.jobOrder.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          diaryActivities: true,
        },
      },
    },
  });

  if (!jobOrder) {
    return NextResponse.json({ error: "Commessa non trovata" }, { status: 404 });
  }

  return NextResponse.json({
    jobOrder: {
      id: jobOrder.id,
      name: jobOrder.name,
      type: jobOrder.type,
      startDate: toInputDate(jobOrder.startDate),
      status: jobOrder.status,
      endDate: toInputDate(jobOrder.endDate),
      description: jobOrder.description ?? "",
      activityCount: jobOrder._count.diaryActivities,
      createdAt: jobOrder.createdAt.toISOString(),
      updatedAt: jobOrder.updatedAt.toISOString(),
    },
  });
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

  const existing = await prisma.jobOrder.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Commessa non trovata" }, { status: 404 });
  }

  const updated = await prisma.jobOrder.update({
    where: { id },
    data: {
      name,
      type,
      startDate: parsedStartDate,
      status,
      endDate: parsedEndDate,
      description: description || null,
    },
  });

  return NextResponse.json({
    success: true,
    jobOrder: {
      id: updated.id,
      name: updated.name,
      type: updated.type,
      startDate: toInputDate(updated.startDate),
      status: updated.status,
      endDate: toInputDate(updated.endDate),
      description: updated.description ?? "",
    },
  });
}
