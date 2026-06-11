import { prisma } from "@/lib/prisma";
import { getEffectiveResourceHourlyCost } from "@/lib/resource-economics";

export type LoadingDashboardResourceType = "PERSON" | "EQUIPMENT";
export type LoadingDashboardTypeFilter = "ALL" | LoadingDashboardResourceType;

export type LoadingDashboardFilters = {
  year: number;
  resourceType?: LoadingDashboardTypeFilter;
  resourceValue?: string;
  jobOrderId?: string;
  includeEmpty?: boolean;
};

type DashboardResource = {
  id: string;
  type: LoadingDashboardResourceType;
  label: string;
};

const MONTH_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

function roundHours(value: number) {
  return Number(value.toFixed(1));
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function percentage(part: number, total: number) {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

function parseResourceValue(value?: string) {
  if (!value) return null;
  const [type, id] = value.split(":");
  if ((type !== "PERSON" && type !== "EQUIPMENT") || !id) return null;
  return { type, id } as { type: LoadingDashboardResourceType; id: string };
}

export function validateLoadingDashboardFilters(filters: LoadingDashboardFilters) {
  const year = Number(filters.year);
  const resourceType = filters.resourceType || "ALL";
  const resourceValue = filters.resourceValue?.trim() ?? "";
  const selectedResource = parseResourceValue(resourceValue);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false as const, status: 400, error: "Anno non valido" };
  }

  if (resourceType !== "ALL" && resourceType !== "PERSON" && resourceType !== "EQUIPMENT") {
    return { ok: false as const, status: 400, error: "Tipo risorsa non valido" };
  }

  if (resourceValue && !selectedResource) {
    return { ok: false as const, status: 400, error: "Risorsa non valida" };
  }

  if (selectedResource && resourceType !== "ALL" && selectedResource.type !== resourceType) {
    return { ok: false as const, status: 400, error: "La risorsa selezionata non corrisponde al tipo risorsa" };
  }

  return {
    ok: true as const,
    value: {
      year,
      resourceType,
      selectedResource,
      jobOrderId: filters.jobOrderId?.trim() ?? "",
      includeEmpty: Boolean(filters.includeEmpty),
    },
  };
}

export async function getLoadingDashboardOptions() {
  const [people, vehicles, jobOrders] = await Promise.all([
    prisma.person.findMany({
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, status: true },
    }),
    prisma.equipment.findMany({
      where: { type: "VEHICLE", status: "ACTIVE", isVisibleInDiary: true },
      orderBy: { nameDescription: "asc" },
      select: { id: true, nameDescription: true, status: true },
    }),
    prisma.jobOrder.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
  ]);

  return {
    resources: [
      ...people.map((person) => ({
        value: `PERSON:${person.id}`,
        label: person.fullName,
        type: "PERSON" as const,
        status: person.status,
      })),
      ...vehicles.map((vehicle) => ({
        value: `EQUIPMENT:${vehicle.id}`,
        label: vehicle.nameDescription,
        type: "EQUIPMENT" as const,
        status: vehicle.status,
      })),
    ],
    jobOrders: jobOrders.map((jobOrder) => ({
      id: jobOrder.id,
      name: jobOrder.name,
      type: jobOrder.type,
      status: jobOrder.status,
    })),
  };
}

export async function getLoadingDashboard(filters: LoadingDashboardFilters) {
  const validation = validateLoadingDashboardFilters(filters);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const { year, resourceType, selectedResource, jobOrderId, includeEmpty } = validation.value;
  const from = new Date(`${year}-01-01T00:00:00.000Z`);
  const to = new Date(`${year}-12-31T23:59:59.999Z`);
  const shouldLoadPeople = resourceType === "ALL" || resourceType === "PERSON";
  const shouldLoadEquipment = resourceType === "ALL" || resourceType === "EQUIPMENT";

  const [people, vehicles, activities] = await Promise.all([
    shouldLoadPeople
      ? prisma.person.findMany({
          where: selectedResource?.type === "PERSON" ? { id: selectedResource.id } : undefined,
          orderBy: { fullName: "asc" },
          select: { id: true, fullName: true },
        })
      : [],
    shouldLoadEquipment
      ? prisma.equipment.findMany({
          where: {
            type: "VEHICLE",
            status: "ACTIVE",
            isVisibleInDiary: true,
            ...(selectedResource?.type === "EQUIPMENT" ? { id: selectedResource.id } : {}),
          },
          orderBy: { nameDescription: "asc" },
          select: { id: true, nameDescription: true },
        })
      : [],
    prisma.diaryActivity.findMany({
      where: {
        referenceDate: { gte: from, lte: to },
        jobOrderId: jobOrderId || undefined,
        ...(selectedResource?.type === "PERSON" ? { resourceType: "PERSON", personId: selectedResource.id } : {}),
        ...(selectedResource?.type === "EQUIPMENT"
          ? { resourceType: "EQUIPMENT", equipmentId: selectedResource.id }
          : {}),
        ...(resourceType !== "ALL" && !selectedResource ? { resourceType } : {}),
      },
      orderBy: [{ referenceDate: "asc" }, { createdAt: "asc" }],
      include: {
        person: {
          select: {
            id: true,
            fullName: true,
            costHistory: {
              orderBy: { validFrom: "desc" },
              select: { hourlyCost: true, validFrom: true, validTo: true },
            },
          },
        },
        equipment: {
          select: {
            id: true,
            nameDescription: true,
            type: true,
            costHistory: {
              orderBy: { validFrom: "desc" },
              select: { hourlyCost: true, validFrom: true, validTo: true },
            },
          },
        },
        jobOrder: {
          select: { id: true, name: true, type: true },
        },
      },
    }),
  ]);

  const resourceMap = new Map<string, DashboardResource>();

  for (const person of people) {
    resourceMap.set(`PERSON:${person.id}`, { id: person.id, type: "PERSON", label: person.fullName });
  }

  for (const vehicle of vehicles) {
    resourceMap.set(`EQUIPMENT:${vehicle.id}`, {
      id: vehicle.id,
      type: "EQUIPMENT",
      label: vehicle.nameDescription,
    });
  }

  type ResourceBucket = DashboardResource & {
    totalHours: number;
    totalCost: number;
    lastLoading: string;
    jobOrders: Map<string, { jobOrderId: string; jobOrderName: string; hours: number; cost: number }>;
    months: Map<string, { monthIndex: number; monthLabel: string; jobOrderId: string; jobOrderName: string; hours: number; cost: number }>;
  };

  const buckets = new Map<string, ResourceBucket>();

  function getBucket(resource: DashboardResource) {
    const key = `${resource.type}:${resource.id}`;
    const existing = buckets.get(key);
    if (existing) return existing;
    const created: ResourceBucket = {
      ...resource,
      totalHours: 0,
      totalCost: 0,
      lastLoading: "",
      jobOrders: new Map(),
      months: new Map(),
    };
    buckets.set(key, created);
    return created;
  }

  if (includeEmpty) {
    for (const resource of resourceMap.values()) {
      getBucket(resource);
    }
  }

  for (const activity of activities) {
    if (activity.resourceType === "EQUIPMENT" && activity.equipment?.type !== "VEHICLE") {
      continue;
    }

    const resource =
      activity.resourceType === "PERSON"
        ? activity.personId
          ? { id: activity.personId, type: "PERSON" as const, label: activity.person?.fullName ?? "Risorsa personale" }
          : null
        : activity.equipmentId
          ? {
              id: activity.equipmentId,
              type: "EQUIPMENT" as const,
              label: activity.equipment?.nameDescription ?? "Mezzo",
            }
          : null;

    if (!resource) continue;

    const bucket = getBucket(resource);
    const hours = Number(activity.hours);
    const hourlyCost = getEffectiveResourceHourlyCost({
      resourceType: activity.resourceType,
      jobType: activity.jobOrder.type,
      costHistory:
        activity.resourceType === "PERSON"
          ? activity.person?.costHistory ?? []
          : activity.equipment?.costHistory ?? [],
      referenceDate: activity.referenceDate,
    });
    const cost = roundCurrency(hours * hourlyCost);
    const jobKey = activity.jobOrderId;
    const monthIndex = activity.referenceDate.getUTCMonth();
    const monthKey = `${monthIndex}:${jobKey}`;
    const referenceDate = activity.referenceDate.toISOString().slice(0, 10);

    bucket.totalHours = roundHours(bucket.totalHours + hours);
    bucket.totalCost = roundCurrency(bucket.totalCost + cost);
    bucket.lastLoading = !bucket.lastLoading || referenceDate > bucket.lastLoading ? referenceDate : bucket.lastLoading;

    const jobBucket = bucket.jobOrders.get(jobKey) ?? {
      jobOrderId: jobKey,
      jobOrderName: activity.jobOrder.name,
      hours: 0,
      cost: 0,
    };
    jobBucket.hours = roundHours(jobBucket.hours + hours);
    jobBucket.cost = roundCurrency(jobBucket.cost + cost);
    bucket.jobOrders.set(jobKey, jobBucket);

    const monthBucket = bucket.months.get(monthKey) ?? {
      monthIndex,
      monthLabel: MONTH_LABELS[monthIndex],
      jobOrderId: jobKey,
      jobOrderName: activity.jobOrder.name,
      hours: 0,
      cost: 0,
    };
    monthBucket.hours = roundHours(monthBucket.hours + hours);
    monthBucket.cost = roundCurrency(monthBucket.cost + cost);
    bucket.months.set(monthKey, monthBucket);
  }

  const rows = [...buckets.values()]
    .filter((bucket) => includeEmpty || bucket.totalHours > 0)
    .map((bucket) => {
      const jobOrderRows = [...bucket.jobOrders.values()].sort((a, b) => b.hours - a.hours);
      const prevalent = jobOrderRows[0] ?? null;
      const monthTotals = new Map<number, number>();

      for (const item of bucket.months.values()) {
        monthTotals.set(item.monthIndex, roundHours((monthTotals.get(item.monthIndex) ?? 0) + item.hours));
      }

      const monthlyRows = [...bucket.months.values()]
        .sort((a, b) => a.monthIndex - b.monthIndex || a.jobOrderName.localeCompare(b.jobOrderName, "it"))
        .map((item) => ({
          ...item,
          percentage: percentage(item.hours, monthTotals.get(item.monthIndex) ?? 0),
        }));

      const busiestMonth = [...monthTotals.entries()].sort((a, b) => b[1] - a[1])[0];

      return {
        resourceValue: `${bucket.type}:${bucket.id}`,
        resourceId: bucket.id,
        resourceLabel: bucket.label,
        resourceType: bucket.type,
        resourceTypeLabel: bucket.type === "PERSON" ? "Personale" : "Mezzo",
        totalHours: roundHours(bucket.totalHours),
        totalCost: roundCurrency(bucket.totalCost),
        prevalentJobOrder: prevalent?.jobOrderName ?? "-",
        prevalentJobOrderPercentage: prevalent ? percentage(prevalent.hours, bucket.totalHours) : 0,
        jobOrderCount: jobOrderRows.length,
        lastLoading: bucket.lastLoading,
        detail: {
          kpi: {
            totalHours: roundHours(bucket.totalHours),
            totalCost: roundCurrency(bucket.totalCost),
            jobOrderCount: jobOrderRows.length,
            busiestMonth: busiestMonth ? MONTH_LABELS[busiestMonth[0]] : "-",
            prevalentJobOrder: prevalent?.jobOrderName ?? "-",
          },
          jobOrders: jobOrderRows.map((item) => ({
            ...item,
            percentage: percentage(item.hours, bucket.totalHours),
          })),
          months: MONTH_LABELS.map((label, index) => ({
            monthIndex: index,
            monthLabel: label,
            totalHours: roundHours(monthTotals.get(index) ?? 0),
            rows: monthlyRows.filter((item) => item.monthIndex === index),
          })),
          monthlyRows,
        },
      };
    })
    .sort((a, b) => a.resourceLabel.localeCompare(b.resourceLabel, "it", { sensitivity: "base" }));

  return {
    appliedFilters: {
      year,
      resourceType,
      resourceValue: selectedResource ? `${selectedResource.type}:${selectedResource.id}` : "",
      jobOrderId,
      includeEmpty,
    },
    rows,
  };
}
