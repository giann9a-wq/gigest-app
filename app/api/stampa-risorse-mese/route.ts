import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const REPORT_GROUPS = [
  { key: "WORK", label: "Ore lavorate" },
  { key: "LEAVE", label: "Ferie" },
  { key: "SICKNESS", label: "Malattia" },
] as const;

type ReportGroupKey = (typeof REPORT_GROUPS)[number]["key"];

function getMonthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

function getGroupKey(jobType: string): ReportGroupKey {
  if (jobType === "LEAVE") return "LEAVE";
  if (jobType === "SICKNESS") return "SICKNESS";
  return "WORK";
}

function getDaysInMonth(year: number, month: number) {
  const totalDays = new Date(year, month, 0).getDate();

  return Array.from({ length: totalDays }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, index + 1));
    const weekdayIndex = date.getUTCDay();
    const mondayBased = weekdayIndex === 0 ? 6 : weekdayIndex - 1;
    const weekdayShort = ["LUN", "MAR", "MER", "GIO", "VEN", "SAB", "DOM"][mondayBased];
    const iso = date.toISOString().slice(0, 10);

    return {
      iso,
      dayNumber: index + 1,
      weekdayShort,
      isWeekend: weekdayIndex === 0 || weekdayIndex === 6,
    };
  });
}

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const now = new Date();
  const year = Number(request.nextUrl.searchParams.get("year") || now.getUTCFullYear());
  const month = Number(request.nextUrl.searchParams.get("month") || now.getUTCMonth() + 1);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Anno non valido" }, { status: 400 });
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Mese non valido" }, { status: 400 });
  }

  const { start, end } = getMonthRange(year, month);
  const days = getDaysInMonth(year, month);

  const [people, activities] = await Promise.all([
    prisma.person.findMany({
      where: { status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
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
            type: true,
          },
        },
      },
    }),
  ]);

  const activityIndex = new Map<string, number>();

  for (const activity of activities) {
    if (!activity.personId) continue;

    const dayIso = activity.referenceDate.toISOString().slice(0, 10);
    const groupKey = getGroupKey(activity.jobOrder.type);
    const indexKey = `${activity.personId}:${groupKey}:${dayIso}`;
    const currentValue = activityIndex.get(indexKey) ?? 0;

    activityIndex.set(indexKey, currentValue + Number(activity.hours));
  }

  const resources = people.map((person) => {
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

    const hasHours = groups.some((group) => group.total > 0);

    return {
      id: person.id,
      fullName: person.fullName,
      groups,
      total: Number(groups.reduce((sum, group) => sum + group.total, 0).toFixed(1)),
      hasHours,
    };
  });

  return NextResponse.json({
    month,
    year,
    days,
    resources,
  });
}
