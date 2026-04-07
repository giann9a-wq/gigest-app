import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, ResourceType } from "@prisma/client";

function getUtcDayRange(dateString: string) {
  const start = new Date(`${dateString}T00:00:00.000Z`);
  const end = new Date(`${dateString}T23:59:59.999Z`);
  return { start, end };
}

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const date = request.nextUrl.searchParams.get("date");

  if (!date) {
    return NextResponse.json({ error: "Parametro date mancante" }, { status: 400 });
  }

  const { start, end } = getUtcDayRange(date);

  const activities = await prisma.diaryActivity.findMany({
    where: {
      referenceDate: {
        gte: start,
        lte: end,
      },
    },
    orderBy: { createdAt: "asc" },
    include: {
      person: {
        select: {
          fullName: true,
        },
      },
      equipment: {
        select: {
          nameDescription: true,
        },
      },
      jobOrder: {
        select: {
          name: true,
        },
      },
      createdBy: {
        select: {
          email: true,
        },
      },
    },
  });

  const rows = activities.map((activity) => ({
    id: activity.id,
    referenceDate: activity.referenceDate,
    resourceType: activity.resourceType,
    resourceName:
      activity.resourceType === "PERSON"
        ? activity.person?.fullName ?? "-"
        : activity.equipment?.nameDescription ?? "-",
    jobOrderName: activity.jobOrder.name,
    hours: Number(activity.hours),
    activityDescription: activity.activityDescription ?? "",
    createdByEmail: activity.createdBy?.email ?? "",
  }));

  return NextResponse.json({ rows });
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const appUser = await prisma.user.findUnique({
    where: { email: session.user.email.toLowerCase() },
    select: { id: true },
  });

  if (!appUser) {
    return NextResponse.json({ error: "Utente non trovato nel database" }, { status: 403 });
  }

  const body = await request.json();

  const {
    referenceDate,
    resourceValue,
    jobOrderId,
    hours,
    activityDescription,
  }: {
    referenceDate?: string;
    resourceValue?: string;
    jobOrderId?: string;
    hours?: number | string;
    activityDescription?: string;
  } = body;

  if (!referenceDate || !resourceValue || !jobOrderId || hours === undefined || hours === null) {
    return NextResponse.json(
      { error: "Data, risorsa, commessa e ore sono obbligatorie" },
      { status: 400 }
    );
  }

  const parsedHours = Number(hours);

  if (Number.isNaN(parsedHours) || parsedHours <= 0) {
    return NextResponse.json({ error: "Le ore devono essere maggiori di zero" }, { status: 400 });
  }

  const roundedHours = Math.round(parsedHours * 10) / 10;

  const [resourceTypeRaw, resourceId] = resourceValue.split(":");

  if (!resourceTypeRaw || !resourceId) {
    return NextResponse.json({ error: "Risorsa non valida" }, { status: 400 });
  }

  if (resourceTypeRaw !== "PERSON" && resourceTypeRaw !== "EQUIPMENT") {
    return NextResponse.json({ error: "Tipo risorsa non valido" }, { status: 400 });
  }

  const resourceType = resourceTypeRaw as ResourceType;

  const diaryData: Prisma.DiaryActivityCreateInput = {
    referenceDate: new Date(`${referenceDate}T00:00:00.000Z`),
    resourceType,
    jobOrder: {
      connect: { id: jobOrderId },
    },
    hours: new Prisma.Decimal(roundedHours),
    activityDescription: activityDescription?.trim() || null,
    createdBy: {
      connect: { id: appUser.id },
    },
    updatedBy: {
      connect: { id: appUser.id },
    },
  };

  if (resourceType === "PERSON") {
    diaryData.person = {
      connect: { id: resourceId },
    };
  }

  if (resourceType === "EQUIPMENT") {
    diaryData.equipment = {
      connect: { id: resourceId },
    };
  }

  const created = await prisma.diaryActivity.create({
    data: diaryData,
  });

  return NextResponse.json({ success: true, id: created.id });
}