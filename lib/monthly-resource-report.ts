import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const REPORT_GROUPS = [
  { key: "WORK", label: "Ore lavorate" },
  { key: "RAIN", label: "Pioggia" },
  { key: "LEAVE", label: "Ferie" },
  { key: "NATIONAL_HOLIDAY", label: "Festivita" },
  { key: "SICKNESS", label: "Malattia" },
] as const;

type ReportGroupKey = (typeof REPORT_GROUPS)[number]["key"];

export type MonthlyReportDay = {
  iso: string;
  dayNumber: number;
  weekdayShort: string;
  isWeekend: boolean;
};

export type MonthlyReportGroup = {
  key: ReportGroupKey;
  label: string;
  values: number[];
  total: number;
};

export type MonthlyReportWorkDetail = {
  jobOrderId: string;
  jobOrderName: string;
  values: number[];
  total: number;
};

export type MonthlyReportResource = {
  id: string;
  fullName: string;
  roleDescription: string;
  expectedDailyHours: number;
  groups: MonthlyReportGroup[];
  workDetails: MonthlyReportWorkDetail[];
  total: number;
  hasHours: boolean;
  isAlwaysSelectable: boolean;
  isWorker: boolean;
};

export type MonthlyResourceReport = {
  month: number;
  year: number;
  days: MonthlyReportDay[];
  resources: MonthlyReportResource[];
};

function getMonthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

function getGroupKey(jobType: string): ReportGroupKey {
  if (jobType === "LEAVE") return "LEAVE";
  if (jobType === "SICKNESS") return "SICKNESS";
  if (jobType === "RAIN") return "RAIN";
  if (jobType === "NATIONAL_HOLIDAY") return "NATIONAL_HOLIDAY";
  return "WORK";
}

function isOfficeRole(roleDescription: string | null) {
  return roleDescription?.trim().toLocaleLowerCase("it-IT").startsWith("impiegat") ?? false;
}

function isWorkerRole(roleDescription: string | null) {
  return roleDescription?.trim().toLocaleLowerCase("it-IT").startsWith("operai") ?? false;
}

function getExpectedDailyHours(person: { isPartTime: boolean; partTimeHours: Prisma.Decimal | null }) {
  const partTimeHours = person.partTimeHours ? person.partTimeHours.toNumber() : 0;
  return person.isPartTime && partTimeHours > 0 ? partTimeHours : 8;
}

export function getDaysInMonth(year: number, month: number): MonthlyReportDay[] {
  const totalDays = new Date(year, month, 0).getDate();

  return Array.from({ length: totalDays }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, index + 1));
    const weekdayIndex = date.getUTCDay();
    const mondayBased = weekdayIndex === 0 ? 6 : weekdayIndex - 1;
    const weekdayShort = ["LUN", "MAR", "MER", "GIO", "VEN", "SAB", "DOM"][mondayBased];

    return {
      iso: date.toISOString().slice(0, 10),
      dayNumber: index + 1,
      weekdayShort,
      isWeekend: weekdayIndex === 0 || weekdayIndex === 6,
    };
  });
}

export async function buildMonthlyResourceReport(
  year: number,
  month: number,
  options?: { personIds?: string[] }
): Promise<MonthlyResourceReport> {
  const { start, end } = getMonthRange(year, month);
  const days = getDaysInMonth(year, month);

  const [people, activities] = await Promise.all([
    prisma.person.findMany({
      where: {
        status: "ACTIVE",
        ...(options?.personIds?.length ? { id: { in: options.personIds } } : {}),
      },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        roleDescription: true,
        isPartTime: true,
        partTimeHours: true,
      },
    }),
    prisma.diaryActivity.findMany({
      where: {
        resourceType: "PERSON",
        referenceDate: {
          gte: start,
          lte: end,
        },
      },
      orderBy: [{ referenceDate: "asc" }, { createdAt: "asc" }],
      select: {
        personId: true,
        referenceDate: true,
        hours: true,
        jobOrder: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    }),
  ]);

  const activityIndex = new Map<string, number>();
  const workDetailIndex = new Map<string, number>();
  const workJobOrdersByPersonId = new Map<string, Map<string, string>>();

  for (const activity of activities) {
    if (!activity.personId) continue;

    const dayIso = activity.referenceDate.toISOString().slice(0, 10);
    const groupKey = getGroupKey(activity.jobOrder.type);
    const indexKey = `${activity.personId}:${groupKey}:${dayIso}`;
    const currentValue = activityIndex.get(indexKey) ?? 0;

    activityIndex.set(indexKey, currentValue + Number(activity.hours));

    if (groupKey === "WORK") {
      const detailKey = `${activity.personId}:${activity.jobOrder.id}:${dayIso}`;
      const currentDetailValue = workDetailIndex.get(detailKey) ?? 0;
      workDetailIndex.set(detailKey, currentDetailValue + Number(activity.hours));

      if (!workJobOrdersByPersonId.has(activity.personId)) {
        workJobOrdersByPersonId.set(activity.personId, new Map());
      }
      workJobOrdersByPersonId.get(activity.personId)!.set(activity.jobOrder.id, activity.jobOrder.name);
    }
  }

  const resources = people.map((person) => {
    const expectedDailyHours = getExpectedDailyHours(person);
    const groups = REPORT_GROUPS.map((group) => {
      const values = days.map((day) => {
        const value = activityIndex.get(`${person.id}:${group.key}:${day.iso}`) ?? 0;
        return Number(value.toFixed(1));
      });

      return {
        key: group.key,
        label: group.label,
        values,
        total: Number(values.reduce((sum, value) => sum + value, 0).toFixed(1)),
      };
    });

    const workDetails = [...(workJobOrdersByPersonId.get(person.id)?.entries() ?? [])]
      .map(([jobOrderId, jobOrderName]) => {
        const values = days.map((day) => {
          const value = workDetailIndex.get(`${person.id}:${jobOrderId}:${day.iso}`) ?? 0;
          return Number(value.toFixed(1));
        });

        return {
          jobOrderId,
          jobOrderName,
          values,
          total: Number(values.reduce((sum, value) => sum + value, 0).toFixed(1)),
        };
      })
      .filter((detail) => detail.total > 0)
      .sort((a, b) => a.jobOrderName.localeCompare(b.jobOrderName, "it", { sensitivity: "base" }));
    const hasHours = groups.some((group) => group.total > 0);
    const isWorker = isWorkerRole(person.roleDescription);

    return {
      id: person.id,
      fullName: person.fullName,
      roleDescription: person.roleDescription ?? "",
      expectedDailyHours,
      groups,
      workDetails,
      total: Number(groups.reduce((sum, group) => sum + group.total, 0).toFixed(1)),
      hasHours,
      isAlwaysSelectable: isOfficeRole(person.roleDescription),
      isWorker,
    };
  });

  return {
    month,
    year,
    days,
    resources,
  };
}
