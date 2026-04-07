import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, ResourceType, UserStatus } from "@prisma/client";

function getUtcDayRange(dateString: string) {
  const start = new Date(`${dateString}T00:00:00.000Z`);
  const end = new Date(`${dateString}T23:59:59.999Z`);
  return { start, end };
}

type BatchRowInput = {
  resourceValue: string;
  jobOrderId: string;
  hours: number | string;
  activityDescription?: string;
};

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
          type: true,
        },
      },
    },
  });

  const rows = activities.map((activity) => ({
    id: activity.id,
    resourceValue:
      activity.resourceType === "PERSON" && activity.personId
        ? `PERSON:${activity.personId}`
        : activity.resourceType === "EQUIPMENT" && activity.equipmentId
        ? `EQUIPMENT:${activity.equipmentId}`
        : "",
    resourceLabel:
      activity.resourceType === "PERSON"
        ? activity.person?.fullName ?? "-"
        : activity.equipment?.nameDescription ?? "-",
    jobOrderId: activity.jobOrderId,
    jobOrderLabel: activity.jobOrder.name,
    hours: Number(activity.hours),
    activityDescription: activity.activityDescription ?? "",
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
    select: { id: true, status: true },
  });

  if (!appUser || appUser.status !== UserStatus.ACTIVE) {
    return NextResponse.json({ error: "Utente non autorizzato" }, { status: 403 });
  }

  const body = await request.json();

  const {
    referenceDate,
    rows,
  }: {
    referenceDate?: string;
    rows?: BatchRowInput[];
  } = body;

  if (!referenceDate) {
    return NextResponse.json({ error: "La data è obbligatoria" }, { status: 400 });
  }

  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "Le righe devono essere un array" }, { status: 400 });
  }

  const cleanedRows = rows
    .map((row) => ({
      resourceValue: row.resourceValue?.trim() ?? "",
      jobOrderId: row.jobOrderId?.trim() ?? "",
      hours: row.hours,
      activityDescription: row.activityDescription?.trim() ?? "",
    }))
    .filter((row) => {
      return row.resourceValue || row.jobOrderId || row.hours || row.activityDescription;
    });

  for (const row of cleanedRows) {
    if (!row.resourceValue || !row.jobOrderId || row.hours === undefined || row.hours === null || row.hours === "") {
      return NextResponse.json(
        { error: "Ogni riga compilata deve avere risorsa, commessa e ore" },
        { status: 400 }
      );
    }

    const parsedHours = Number(row.hours);
    if (Number.isNaN(parsedHours) || parsedHours <= 0) {
      return NextResponse.json(
        { error: "Le ore devono essere maggiori di zero" },
        { status: 400 }
      );
    }

    const [resourceTypeRaw, resourceId] = row.resourceValue.split(":");
    if (!resourceTypeRaw || !resourceId) {
      return NextResponse.json({ error: "Formato risorsa non valido" }, { status: 400 });
    }

    if (resourceTypeRaw !== "PERSON" && resourceTypeRaw !== "EQUIPMENT") {
      return NextResponse.json({ error: "Tipo risorsa non valido" }, { status: 400 });
    }
  }

  const { start, end } = getUtcDayRange(referenceDate);

  const createData: Prisma.DiaryActivityCreateManyInput[] = cleanedRows.map((row) => {
    const parsedHours = Number(row.hours);
    const roundedHours = Math.round(parsedHours * 10) / 10;
    const [resourceTypeRaw, resourceId] = row.resourceValue.split(":");
    const resourceType = resourceTypeRaw as ResourceType;

    return {
      referenceDate: new Date(`${referenceDate}T00:00:00.000Z`),
      resourceType,
      personId: resourceType === "PERSON" ? resourceId : null,
      equipmentId: resourceType === "EQUIPMENT" ? resourceId : null,
      jobOrderId: row.jobOrderId,
      hours: new Prisma.Decimal(roundedHours),
      activityDescription: row.activityDescription || null,
      createdByUserId: appUser.id,
      updatedByUserId: appUser.id,
    };
  });

  await prisma.$transaction(async (tx) => {
    await tx.diaryActivity.deleteMany({
      where: {
        referenceDate: {
          gte: start,
          lte: end,
        },
      },
    });

    if (createData.length > 0) {
      await tx.diaryActivity.createMany({
        data: createData,
      });
    }
  });

  return NextResponse.json({
    success: true,
    savedRows: createData.length,
  });
}