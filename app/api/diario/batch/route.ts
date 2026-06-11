import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, ResourceType, UserStatus } from "@prisma/client";

function getUtcDayRange(dateString: string) {
  const start = new Date(`${dateString}T00:00:00.000Z`);
  const end = new Date(`${dateString}T23:59:59.999Z`);
  return { start, end };
}

type InternalBatchRowInput = {
  resourceValue: string;
  jobOrderId: string;
  hours: number | string;
  activityDescription?: string;
};

type ExternalBatchRowInput = {
  externalResourceId: string;
  externalResourceName?: string;
  jobOrderId: string;
  days: number | string;
  activityDescription?: string;
};

type ExternalEconomyBatchRowInput = {
  externalResourceId: string;
  externalResourceName?: string;
  jobOrderId: string;
  hours: number | string;
  activityDescription?: string;
};

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

function looksLikeTechnicalId(value: string) {
  return /^c[a-z0-9]{18,}$/i.test(value.trim());
}

async function resolveExternalResourceIds(rows: Array<{ externalResourceId: string; externalResourceName: string }>) {
  const namesToCreate = new Set<string>();
  const idsToCheck = new Set<string>();
  const resolvedIdByInput = new Map<string, string>();

  for (const row of rows) {
    const input = (row.externalResourceName || row.externalResourceId).trim();
    const rawId = row.externalResourceId.trim();
    if (!input) continue;

    if (rawId && looksLikeTechnicalId(rawId)) {
      idsToCheck.add(rawId);
    }

    if (looksLikeTechnicalId(input)) {
      idsToCheck.add(input);
    } else {
      namesToCreate.add(input);
    }
  }

  if (idsToCheck.size > 0) {
    const existingById = await prisma.externalResource.findMany({
      where: { id: { in: [...idsToCheck] } },
      select: { id: true },
    });

    for (const resource of existingById) {
      resolvedIdByInput.set(resource.id, resource.id);
    }
  }

  for (const name of namesToCreate) {
    const existingResource = await prisma.externalResource.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    const resource =
      existingResource ??
      (await prisma.externalResource.create({
        data: { name },
        select: { id: true, name: true },
      }));

    resolvedIdByInput.set(name, resource.id);
  }

  return resolvedIdByInput;
}

export async function GET(request: NextRequest) {
  const authResult = await getAuthorizedUser();
  if (authResult.error) return authResult.error;

  const date = request.nextUrl.searchParams.get("date");

  if (!date) {
    return NextResponse.json({ error: "Parametro date mancante" }, { status: 400 });
  }

  const { start, end } = getUtcDayRange(date);

  const [activities, externalActivities] = await Promise.all([
    prisma.diaryActivity.findMany({
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
    }),
    prisma.externalDiaryActivity.findMany({
      where: {
        referenceDate: {
          gte: start,
          lte: end,
        },
      },
      orderBy: { createdAt: "asc" },
      include: {
        externalResource: {
          select: {
            name: true,
          },
        },
        jobOrder: {
          select: {
            name: true,
            type: true,
          },
        },
      },
    }),
  ]);

  const internalRows = activities.map((activity) => ({
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

  const externalRows = externalActivities
    .filter((activity) => activity.activityType === "SUBCONTRACT")
    .map((activity) => ({
    id: activity.id,
    externalResourceId: activity.externalResourceId,
    externalResourceLabel: activity.externalResource.name,
    jobOrderId: activity.jobOrderId,
    jobOrderLabel: activity.jobOrder.name,
    days: Number(activity.days),
    activityDescription: activity.activityDescription ?? "",
  }));

  const externalEconomyRows = externalActivities
    .filter((activity) => activity.activityType === "ECONOMY")
    .map((activity) => ({
      id: activity.id,
      externalResourceId: activity.externalResourceId,
      externalResourceLabel: activity.externalResource.name,
      jobOrderId: activity.jobOrderId,
      jobOrderLabel: activity.jobOrder.name,
      hours: Number(activity.hours ?? 0),
      activityDescription: activity.activityDescription ?? "",
    }));

  return NextResponse.json({ internalRows, externalRows, externalEconomyRows });
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthorizedUser();
  if (authResult.error) return authResult.error;

  const { appUser } = authResult;
  const body = await request.json();

  const {
    referenceDate,
    internalRows,
    externalRows,
    externalEconomyRows,
  }: {
    referenceDate?: string;
    internalRows?: InternalBatchRowInput[];
    externalRows?: ExternalBatchRowInput[];
    externalEconomyRows?: ExternalEconomyBatchRowInput[];
  } = body;

  if (!referenceDate) {
    return NextResponse.json({ error: "La data e obbligatoria" }, { status: 400 });
  }

  if (!Array.isArray(internalRows) || !Array.isArray(externalRows)) {
    return NextResponse.json(
      { error: "Le righe interne ed esterne devono essere array" },
      { status: 400 }
    );
  }

  const cleanedInternalRows = internalRows
    .map((row) => ({
      resourceValue: row.resourceValue?.trim() ?? "",
      jobOrderId: row.jobOrderId?.trim() ?? "",
      hours: row.hours,
      activityDescription: row.activityDescription?.trim() ?? "",
    }))
    .filter((row) => row.resourceValue || row.jobOrderId || row.hours || row.activityDescription);

  const cleanedExternalRows = externalRows
    .map((row) => ({
      externalResourceId: row.externalResourceId?.trim() ?? "",
      externalResourceName: row.externalResourceName?.trim() ?? "",
      jobOrderId: row.jobOrderId?.trim() ?? "",
      days: row.days,
      activityDescription: row.activityDescription?.trim() ?? "",
    }))
    .filter((row) => row.externalResourceId || row.externalResourceName || row.jobOrderId || row.days || row.activityDescription);

  const cleanedExternalEconomyRows = (Array.isArray(externalEconomyRows) ? externalEconomyRows : [])
    .map((row) => ({
      externalResourceId: row.externalResourceId?.trim() ?? "",
      externalResourceName: row.externalResourceName?.trim() ?? "",
      jobOrderId: row.jobOrderId?.trim() ?? "",
      hours: row.hours,
      activityDescription: row.activityDescription?.trim() ?? "",
    }))
    .filter((row) => row.externalResourceId || row.externalResourceName || row.jobOrderId || row.hours || row.activityDescription);

  for (const row of cleanedInternalRows) {
    if (!row.resourceValue || !row.jobOrderId || row.hours === undefined || row.hours === null || row.hours === "") {
      return NextResponse.json(
        { error: "Ogni riga interna compilata deve avere risorsa, commessa e ore" },
        { status: 400 }
      );
    }

    const parsedHours = Number(row.hours);
    if (Number.isNaN(parsedHours) || parsedHours <= 0) {
      return NextResponse.json(
        { error: "Le ore delle risorse interne devono essere maggiori di zero" },
        { status: 400 }
      );
    }

    const [resourceTypeRaw, resourceId] = row.resourceValue.split(":");
    if (!resourceTypeRaw || !resourceId) {
      return NextResponse.json({ error: "Formato risorsa interna non valido" }, { status: 400 });
    }

    if (resourceTypeRaw !== "PERSON" && resourceTypeRaw !== "EQUIPMENT") {
      return NextResponse.json({ error: "Tipo risorsa interna non valido" }, { status: 400 });
    }
  }

  for (const row of cleanedExternalRows) {
    if (!(row.externalResourceName || row.externalResourceId) || !row.jobOrderId || row.days === undefined || row.days === null || row.days === "") {
      return NextResponse.json(
        { error: "Ogni riga esterna compilata deve avere risorsa, commessa e giornate" },
        { status: 400 }
      );
    }

    const parsedDays = Number(row.days);
    if (Number.isNaN(parsedDays) || parsedDays <= 0) {
      return NextResponse.json(
        { error: "Le giornate delle risorse esterne devono essere maggiori di zero" },
        { status: 400 }
      );
    }
  }

  for (const row of cleanedExternalEconomyRows) {
    if (!(row.externalResourceName || row.externalResourceId) || !row.jobOrderId || row.hours === undefined || row.hours === null || row.hours === "") {
      return NextResponse.json(
        { error: "Ogni riga in economia compilata deve avere risorsa, commessa e ore" },
        { status: 400 }
      );
    }

    const parsedHours = Number(row.hours);
    if (Number.isNaN(parsedHours) || parsedHours <= 0) {
      return NextResponse.json(
        { error: "Le ore delle risorse in economia devono essere maggiori di zero" },
        { status: 400 }
      );
    }
  }

  const externalResourceIdByInput = await resolveExternalResourceIds([
    ...cleanedExternalRows,
    ...cleanedExternalEconomyRows,
  ]);

  const { start, end } = getUtcDayRange(referenceDate);
  const referenceDateValue = new Date(`${referenceDate}T00:00:00.000Z`);

  const internalCreateData: Prisma.DiaryActivityCreateManyInput[] = cleanedInternalRows.map((row) => {
    const parsedHours = Number(row.hours);
    const roundedHours = Math.round(parsedHours * 10) / 10;
    const [resourceTypeRaw, resourceId] = row.resourceValue.split(":");
    const resourceType = resourceTypeRaw as ResourceType;

    return {
      referenceDate: referenceDateValue,
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

  const externalCreateData: Prisma.ExternalDiaryActivityCreateManyInput[] = cleanedExternalRows.map((row) => {
    const parsedDays = Number(row.days);
    const roundedDays = Math.round(parsedDays * 10) / 10;

    return {
      referenceDate: referenceDateValue,
      externalResourceId:
        externalResourceIdByInput.get(row.externalResourceName || row.externalResourceId) ??
        externalResourceIdByInput.get(row.externalResourceId) ??
        row.externalResourceId,
      jobOrderId: row.jobOrderId,
      activityType: "SUBCONTRACT",
      days: new Prisma.Decimal(roundedDays),
      hours: null,
      activityDescription: row.activityDescription || null,
      createdByUserId: appUser.id,
      updatedByUserId: appUser.id,
    };
  });

  const externalEconomyCreateData: Prisma.ExternalDiaryActivityCreateManyInput[] = cleanedExternalEconomyRows.map((row) => {
    const parsedHours = Number(row.hours);
    const roundedHours = Math.round(parsedHours * 10) / 10;

    return {
      referenceDate: referenceDateValue,
      externalResourceId:
        externalResourceIdByInput.get(row.externalResourceName || row.externalResourceId) ??
        externalResourceIdByInput.get(row.externalResourceId) ??
        row.externalResourceId,
      jobOrderId: row.jobOrderId,
      activityType: "ECONOMY",
      days: new Prisma.Decimal(0),
      hours: new Prisma.Decimal(roundedHours),
      activityDescription: row.activityDescription || null,
      createdByUserId: appUser.id,
      updatedByUserId: appUser.id,
    };
  });

  await prisma.$transaction(async (tx) => {
    await tx.diaryActivity.deleteMany({
      where: {
        source: "MANUAL",
        referenceDate: {
            gte: start,
            lte: end,
        },
      },
    });

    const manualPersonIds = internalCreateData
      .map((row) => row.personId)
      .filter((personId): personId is string => Boolean(personId));

    if (manualPersonIds.length > 0) {
      await tx.diaryActivity.deleteMany({
        where: {
          source: "AUTO",
          personId: { in: manualPersonIds },
          referenceDate: {
            gte: start,
            lte: end,
          },
        },
      });
    }

    await tx.externalDiaryActivity.deleteMany({
      where: {
        referenceDate: {
          gte: start,
          lte: end,
        },
      },
    });

    if (internalCreateData.length > 0) {
      await tx.diaryActivity.createMany({
        data: internalCreateData,
      });
    }

    if (externalCreateData.length > 0) {
      await tx.externalDiaryActivity.createMany({
        data: externalCreateData,
      });
    }

    if (externalEconomyCreateData.length > 0) {
      await tx.externalDiaryActivity.createMany({
        data: externalEconomyCreateData,
      });
    }
  });

  return NextResponse.json({
    success: true,
    savedInternalRows: internalCreateData.length,
    savedExternalRows: externalCreateData.length,
    savedExternalEconomyRows: externalEconomyCreateData.length,
  });
}
