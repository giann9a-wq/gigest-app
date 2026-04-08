import { prisma } from "@/lib/prisma";

export type CaricamentiFilters = {
  resourceValue: string;
  jobOrderId?: string;
  from?: string;
  to?: string;
};

export type CaricamentoRow = {
  id: string;
  referenceDate: string;
  resourceType: "PERSON" | "EQUIPMENT";
  personId: string | null;
  equipmentId: string | null;
  personLabel: string;
  equipmentLabel: string;
  resourceLabel: string;
  jobOrderId: string;
  jobOrderLabel: string;
  jobOrderType: string;
  hours: number;
  activityDescription: string;
  createdAt: string;
  updatedAt: string;
};

function parseOptionalDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function getDayEnd(date: Date) {
  return new Date(`${date.toISOString().slice(0, 10)}T23:59:59.999Z`);
}

export function validateCaricamentiFilters(filters: CaricamentiFilters) {
  const resourceValue = filters.resourceValue.trim();
  const jobOrderId = filters.jobOrderId?.trim() ?? "";
  const from = parseOptionalDate(filters.from);
  const to = parseOptionalDate(filters.to);

  if (!resourceValue) {
    return {
      ok: false as const,
      status: 400,
      error: "Risorsa obbligatoria",
    };
  }

  const [resourceType, resourceId] = resourceValue.split(":");

  if (!resourceType || !resourceId || (resourceType !== "PERSON" && resourceType !== "EQUIPMENT")) {
    return {
      ok: false as const,
      status: 400,
      error: "Risorsa non valida",
    };
  }

  if ((filters.from && !from) || (filters.to && !to)) {
    return {
      ok: false as const,
      status: 400,
      error: "Intervallo date non valido",
    };
  }

  if (from && to && from > to) {
    return {
      ok: false as const,
      status: 400,
      error: "La data iniziale deve essere precedente alla data finale",
    };
  }

  return {
    ok: true as const,
    value: {
      resourceType: resourceType as "PERSON" | "EQUIPMENT",
      resourceId,
      jobOrderId,
      from,
      to,
    },
  };
}

export async function getCaricamentiRows(filters: CaricamentiFilters): Promise<CaricamentoRow[]> {
  const validation = validateCaricamentiFilters(filters);

  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const { resourceType, resourceId, jobOrderId, from, to } = validation.value;

  const rows = await prisma.diaryActivity.findMany({
    where: {
      resourceType,
      personId: resourceType === "PERSON" ? resourceId : undefined,
      equipmentId: resourceType === "EQUIPMENT" ? resourceId : undefined,
      jobOrderId: jobOrderId || undefined,
      referenceDate: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: getDayEnd(to) } : {}),
      },
    },
    orderBy: [{ referenceDate: "desc" }, { createdAt: "desc" }],
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
          id: true,
          name: true,
          type: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    referenceDate: row.referenceDate.toISOString().slice(0, 10),
    resourceType: row.resourceType,
    personId: row.personId,
    equipmentId: row.equipmentId,
    personLabel: row.person?.fullName ?? "",
    equipmentLabel: row.equipment?.nameDescription ?? "",
    resourceLabel:
      row.resourceType === "PERSON" ? row.person?.fullName ?? "" : row.equipment?.nameDescription ?? "",
    jobOrderId: row.jobOrderId,
    jobOrderLabel: row.jobOrder.name,
    jobOrderType: row.jobOrder.type,
    hours: Number(row.hours),
    activityDescription: row.activityDescription ?? "",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}
