import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ExternalDiaryActivityType, Prisma, ResourceType, UserStatus } from "@prisma/client";

function getUtcDayRange(dateString: string) {
  const start = new Date(`${dateString}T00:00:00.000Z`);
  const end = new Date(`${dateString}T23:59:59.999Z`);
  return { start, end };
}

type InternalBatchRowInput = {
  id?: string;
  resourceValue: string;
  jobOrderId: string;
  hours: number | string;
  activityDescription?: string;
};

type ExternalBatchRowInput = {
  id?: string;
  externalResourceId: string;
  externalResourceName?: string;
  jobOrderId: string;
  days: number | string;
  activityDescription?: string;
};

type ExternalEconomyBatchRowInput = {
  id?: string;
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

function formatUserName(user: { firstName: string | null; lastName: string | null; email: string } | null | undefined) {
  if (!user) return "";
  const fullName = [user.firstName, user.lastName].map((part) => part?.trim()).filter(Boolean).join(" ");
  return fullName || user.email;
}

function serializeHistory(changes: Array<{
  id: string;
  changedFields: Prisma.JsonValue;
  createdAt: Date;
  changedBy: { firstName: string | null; lastName: string | null; email: string } | null;
}>) {
  return changes.map((change) => ({
    id: change.id,
    changedAt: change.createdAt.toISOString(),
    changedByName: formatUserName(change.changedBy),
    changedFields: Array.isArray(change.changedFields) ? change.changedFields : [],
  }));
}

function auditChange(field: string, before: unknown, after: unknown) {
  const beforeValue = before === undefined || before === null || before === "" ? null : String(before);
  const afterValue = after === undefined || after === null || after === "" ? null : String(after);
  if (beforeValue === afterValue) return null;
  return { field, before: beforeValue, after: afterValue };
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
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        updatedBy: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        changes: {
          orderBy: { createdAt: "desc" },
          include: {
            changedBy: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
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
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        updatedBy: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        changes: {
          orderBy: { createdAt: "desc" },
          include: {
            changedBy: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
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
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
    createdByName: formatUserName(activity.createdBy),
    updatedByName: formatUserName(activity.updatedBy),
    history: serializeHistory(activity.changes),
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
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
    createdByName: formatUserName(activity.createdBy),
    updatedByName: formatUserName(activity.updatedBy),
    history: serializeHistory(activity.changes),
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
      createdAt: activity.createdAt.toISOString(),
      updatedAt: activity.updatedAt.toISOString(),
      createdByName: formatUserName(activity.createdBy),
      updatedByName: formatUserName(activity.updatedBy),
      history: serializeHistory(activity.changes),
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
      id: row.id?.trim() ?? "",
      resourceValue: row.resourceValue?.trim() ?? "",
      jobOrderId: row.jobOrderId?.trim() ?? "",
      hours: row.hours,
      activityDescription: row.activityDescription?.trim() ?? "",
    }))
    .filter((row) => row.resourceValue || row.jobOrderId || row.hours || row.activityDescription);

  const cleanedExternalRows = externalRows
    .map((row) => ({
      id: row.id?.trim() ?? "",
      externalResourceId: row.externalResourceId?.trim() ?? "",
      externalResourceName: row.externalResourceName?.trim() ?? "",
      jobOrderId: row.jobOrderId?.trim() ?? "",
      days: row.days,
      activityDescription: row.activityDescription?.trim() ?? "",
    }))
    .filter((row) => row.externalResourceId || row.externalResourceName || row.jobOrderId || row.days || row.activityDescription);

  const cleanedExternalEconomyRows = (Array.isArray(externalEconomyRows) ? externalEconomyRows : [])
    .map((row) => ({
      id: row.id?.trim() ?? "",
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

  const internalPayloads = cleanedInternalRows.map((row) => {
    const parsedHours = Number(row.hours);
    const roundedHours = Math.round(parsedHours * 10) / 10;
    const [resourceTypeRaw, resourceId] = row.resourceValue.split(":");
    const resourceType = resourceTypeRaw as ResourceType;

    return {
      id: row.id,
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

  const externalPayloads = cleanedExternalRows.map((row) => {
    const parsedDays = Number(row.days);
    const roundedDays = Math.round(parsedDays * 10) / 10;

    return {
      id: row.id,
      referenceDate: referenceDateValue,
      externalResourceId:
        externalResourceIdByInput.get(row.externalResourceName || row.externalResourceId) ??
        externalResourceIdByInput.get(row.externalResourceId) ??
        row.externalResourceId,
      jobOrderId: row.jobOrderId,
      activityType: ExternalDiaryActivityType.SUBCONTRACT,
      days: new Prisma.Decimal(roundedDays),
      hours: null,
      activityDescription: row.activityDescription || null,
      createdByUserId: appUser.id,
      updatedByUserId: appUser.id,
    };
  });

  const externalEconomyPayloads = cleanedExternalEconomyRows.map((row) => {
    const parsedHours = Number(row.hours);
    const roundedHours = Math.round(parsedHours * 10) / 10;

    return {
      id: row.id,
      referenceDate: referenceDateValue,
      externalResourceId:
        externalResourceIdByInput.get(row.externalResourceName || row.externalResourceId) ??
        externalResourceIdByInput.get(row.externalResourceId) ??
        row.externalResourceId,
      jobOrderId: row.jobOrderId,
      activityType: ExternalDiaryActivityType.ECONOMY,
      days: new Prisma.Decimal(0),
      hours: new Prisma.Decimal(roundedHours),
      activityDescription: row.activityDescription || null,
      createdByUserId: appUser.id,
      updatedByUserId: appUser.id,
    };
  });

  await prisma.$transaction(async (tx) => {
    const [existingInternalRows, existingExternalRows] = await Promise.all([
      tx.diaryActivity.findMany({
        where: {
          source: "MANUAL",
          referenceDate: {
            gte: start,
            lte: end,
          },
        },
      }),
      tx.externalDiaryActivity.findMany({
        where: {
          referenceDate: {
            gte: start,
            lte: end,
          },
        },
      }),
    ]);

    const existingInternalById = new Map(existingInternalRows.map((row) => [row.id, row]));
    const existingExternalById = new Map(existingExternalRows.map((row) => [row.id, row]));
    const keptInternalIds = internalPayloads.map((row) => row.id).filter((id) => id && existingInternalById.has(id));
    const keptExternalIds = [...externalPayloads, ...externalEconomyPayloads]
      .map((row) => row.id)
      .filter((id) => id && existingExternalById.has(id));

    await tx.diaryActivity.deleteMany({
      where: {
        source: "MANUAL",
        referenceDate: {
          gte: start,
          lte: end,
        },
        ...(keptInternalIds.length > 0 ? { id: { notIn: keptInternalIds } } : {}),
      },
    });

    const manualPersonIds = internalPayloads
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
        ...(keptExternalIds.length > 0 ? { id: { notIn: keptExternalIds } } : {}),
      },
    });

    for (const row of internalPayloads) {
      const existing = row.id ? existingInternalById.get(row.id) : null;
      const data = {
        referenceDate: row.referenceDate,
        resourceType: row.resourceType,
        personId: row.personId,
        equipmentId: row.equipmentId,
        jobOrderId: row.jobOrderId,
        hours: row.hours,
        activityDescription: row.activityDescription,
        updatedByUserId: appUser.id,
      };

      if (!existing) {
        await tx.diaryActivity.create({
          data: {
            ...data,
            createdByUserId: appUser.id,
          },
        });
        continue;
      }

      const changes = [
        auditChange("resourceType", existing.resourceType, row.resourceType),
        auditChange("personId", existing.personId, row.personId),
        auditChange("equipmentId", existing.equipmentId, row.equipmentId),
        auditChange("jobOrderId", existing.jobOrderId, row.jobOrderId),
        auditChange("hours", Number(existing.hours), Number(row.hours)),
        auditChange("activityDescription", existing.activityDescription, row.activityDescription),
      ].filter((change): change is { field: string; before: string | null; after: string | null } => Boolean(change));

      if (changes.length === 0) continue;

      await tx.diaryActivity.update({
        where: { id: existing.id },
        data,
      });
      await tx.diaryRecordChange.create({
        data: {
          diaryActivityId: existing.id,
          changedByUserId: appUser.id,
          changedFields: changes,
        },
      });
    }

    for (const row of [...externalPayloads, ...externalEconomyPayloads]) {
      const existing = row.id ? existingExternalById.get(row.id) : null;
      const data = {
        referenceDate: row.referenceDate,
        externalResourceId: row.externalResourceId,
        jobOrderId: row.jobOrderId,
        activityType: row.activityType,
        days: row.days,
        hours: row.hours,
        activityDescription: row.activityDescription,
        updatedByUserId: appUser.id,
      };

      if (!existing) {
        await tx.externalDiaryActivity.create({
          data: {
            ...data,
            createdByUserId: appUser.id,
          },
        });
        continue;
      }

      const changes = [
        auditChange("externalResourceId", existing.externalResourceId, row.externalResourceId),
        auditChange("jobOrderId", existing.jobOrderId, row.jobOrderId),
        auditChange("activityType", existing.activityType, row.activityType),
        auditChange("days", Number(existing.days), Number(row.days)),
        auditChange("hours", existing.hours === null ? null : Number(existing.hours), row.hours === null ? null : Number(row.hours)),
        auditChange("activityDescription", existing.activityDescription, row.activityDescription),
      ].filter((change): change is { field: string; before: string | null; after: string | null } => Boolean(change));

      if (changes.length === 0) continue;

      await tx.externalDiaryActivity.update({
        where: { id: existing.id },
        data,
      });
      await tx.diaryRecordChange.create({
        data: {
          externalDiaryActivityId: existing.id,
          changedByUserId: appUser.id,
          changedFields: changes,
        },
      });
    }
  });

  return NextResponse.json({
    success: true,
    savedInternalRows: internalPayloads.length,
    savedExternalRows: externalPayloads.length,
    savedExternalEconomyRows: externalEconomyPayloads.length,
  });
}
