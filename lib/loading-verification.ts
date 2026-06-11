import { Prisma, ResourceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const TIME_ZONE = "Europe/Rome";
const DEFAULT_DAILY_HOURS = 8;
const EXCESS_HOURS_LIMIT = 10;

export type LoadingVerificationDayStatus = "LOW" | "OVERTIME" | "EXCESS";

export type LoadingVerificationDay = {
  isoDate: string;
  label: string;
  hours: number;
  expectedHours: number;
  status: LoadingVerificationDayStatus;
};

export type LoadingVerificationPersonGroup = {
  personId: string;
  fullName: string;
  expectedHours: number;
  days: LoadingVerificationDay[];
};

export type LoadingVerificationStatus = {
  shouldAlert: boolean;
  monthLabel: string;
  month: number;
  year: number;
  issueCount: number;
  personCount: number;
  groups: LoadingVerificationPersonGroup[];
};

function getRomeParts(now: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  return {
    dateIso: `${map.year}-${map.month}-${map.day}`,
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

function formatMonthLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function getMonthRange(year: number, month: number) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
  };
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isWeekend(date: Date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function getWorkingDaysInMonth(year: number, month: number) {
  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days: string[] = [];

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (!isWeekend(date)) {
      days.push(toIsoDate(date));
    }
  }

  return days;
}

function addDaysToIsoDate(isoDate: string, days: number) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getExpectedHours(person: { isPartTime: boolean; partTimeHours: Prisma.Decimal | null }) {
  const partTimeHours = person.partTimeHours ? Number(person.partTimeHours) : 0;
  return person.isPartTime && partTimeHours > 0 ? partTimeHours : DEFAULT_DAILY_HOURS;
}

function formatItalianDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function buildKey(personId: string, isoDate: string) {
  return `${personId}:${isoDate}`;
}

export function shouldShowLoadingVerificationAlert(now = new Date()) {
  const rome = getRomeParts(now);
  const lastDayOfMonth = new Date(Date.UTC(rome.year, rome.month, 0)).getUTCDate();
  return rome.day === lastDayOfMonth;
}

export async function getLoadingVerificationStatus(now = new Date()): Promise<LoadingVerificationStatus> {
  const rome = getRomeParts(now);
  const range = getMonthRange(rome.year, rome.month);
  const lastCompleteDayIso = addDaysToIsoDate(rome.dateIso, -1);
  const workingDays = getWorkingDaysInMonth(rome.year, rome.month).filter((isoDate) => isoDate <= lastCompleteDayIso);

  const people = await prisma.person.findMany({
    where: { status: ResourceStatus.ACTIVE, excludeFromChecks: false },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      isPartTime: true,
      partTimeHours: true,
    },
  });

  const personIds = people.map((person) => person.id);
  const aggregated =
    personIds.length === 0
      ? []
      : await prisma.diaryActivity.groupBy({
          by: ["personId", "referenceDate"],
          where: {
            personId: { in: personIds },
            referenceDate: {
              gte: range.start,
              lte: range.end,
            },
          },
          _sum: { hours: true },
        });

  const hoursByPersonAndDay = new Map<string, number>();
  for (const row of aggregated) {
    if (!row.personId) continue;
    const hours = row._sum.hours ? row._sum.hours.toNumber() : 0;
    hoursByPersonAndDay.set(buildKey(row.personId, toIsoDate(row.referenceDate)), Number(hours.toFixed(1)));
  }

  const groups = people
    .map((person) => {
      const expectedHours = getExpectedHours(person);
      const days = workingDays
        .map((isoDate) => {
          const hours = hoursByPersonAndDay.get(buildKey(person.id, isoDate)) ?? 0;
          const roundedHours = Number(hours.toFixed(1));
          const status: LoadingVerificationDayStatus | null =
            roundedHours < expectedHours ? "LOW" : roundedHours > EXCESS_HOURS_LIMIT ? "EXCESS" : roundedHours > expectedHours ? "OVERTIME" : null;

          if (!status) return null;

          return {
            isoDate,
            label: formatItalianDate(isoDate),
            hours: roundedHours,
            expectedHours,
            status,
          };
        })
        .filter((day): day is LoadingVerificationDay => Boolean(day));

      return {
        personId: person.id,
        fullName: person.fullName,
        expectedHours,
        days,
      };
    })
    .filter((group) => group.days.length > 0);

  return {
    shouldAlert: shouldShowLoadingVerificationAlert(now),
    monthLabel: formatMonthLabel(rome.year, rome.month),
    month: rome.month,
    year: rome.year,
    issueCount: groups.reduce((sum, group) => sum + group.days.length, 0),
    personCount: groups.length,
    groups,
  };
}
