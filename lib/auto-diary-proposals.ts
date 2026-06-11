import { AutoDiaryProposalStatus, Prisma, ResourceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const TIME_ZONE = "Europe/Rome";
const DEFAULT_DAILY_HOURS = 8;

type RomeParts = {
  dateIso: string;
  year: number;
  month: number;
  day: number;
  hour: number;
};

export type AutoDiaryProposalRow = {
  id: string;
  personId: string;
  personName: string;
  dateIso: string;
  jobOrderId: string;
  jobOrderName: string;
  hours: number;
};

export type AutoDiaryProposalPersonGroup = {
  personId: string;
  fullName: string;
  rows: AutoDiaryProposalRow[];
};

export type AutoDiaryProposalStatusView = {
  shouldAlert: boolean;
  currentMonthLabel: string;
  pendingCount: number;
  groups: AutoDiaryProposalPersonGroup[];
  jobOrders: Array<{ id: string; name: string }>;
};

function getRomeParts(now: Date): RomeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
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
    hour: Number(map.hour),
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

function formatMonthLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function getDateRange(year: number, month: number) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
  };
}

function buildDayKey(personId: string, isoDate: string) {
  return `${personId}:${isoDate}`;
}

function getConfiguredHours(person: { isPartTime: boolean; partTimeHours: Prisma.Decimal | null }) {
  const partTimeHours = person.partTimeHours ? Number(person.partTimeHours) : 0;
  return person.isPartTime && partTimeHours > 0 ? partTimeHours : DEFAULT_DAILY_HOURS;
}

export function shouldShowAutoDiaryAlert(now = new Date()) {
  const rome = getRomeParts(now);
  const workingDays = getWorkingDaysInMonth(rome.year, rome.month);
  const penultimateWorkingDay = workingDays.at(-2);
  return Boolean(penultimateWorkingDay && rome.dateIso >= penultimateWorkingDay);
}

export async function ensureCurrentMonthAutoDiaryProposals(now = new Date()) {
  const rome = getRomeParts(now);
  const workingDays = getWorkingDaysInMonth(rome.year, rome.month);
  const range = getDateRange(rome.year, rome.month);

  const people = await prisma.person.findMany({
    where: {
      status: ResourceStatus.ACTIVE,
      diaryAutoFillEnabled: true,
      diaryAutoFillJobOrderId: { not: null },
      excludeFromChecks: false,
    },
    select: {
      id: true,
      isPartTime: true,
      partTimeHours: true,
      diaryAutoFillJobOrderId: true,
    },
  });

  if (people.length === 0 || workingDays.length === 0) {
    return;
  }

  const personIds = people.map((person) => person.id);
  const existingActivities = await prisma.diaryActivity.findMany({
    where: {
      personId: { in: personIds },
      referenceDate: {
        gte: range.start,
        lte: range.end,
      },
    },
    select: {
      personId: true,
      referenceDate: true,
    },
  });

  const manuallyFilledDays = new Set(
    existingActivities
      .filter((activity) => activity.personId)
      .map((activity) => buildDayKey(activity.personId!, toIsoDate(activity.referenceDate)))
  );

  const pendingToSkip = await prisma.autoDiaryEntryProposal.findMany({
    where: {
      status: AutoDiaryProposalStatus.PENDING,
      personId: { in: personIds },
      referenceDate: {
        gte: range.start,
        lte: range.end,
      },
    },
    select: {
      id: true,
      personId: true,
      referenceDate: true,
    },
  });

  const skipIds = pendingToSkip
    .filter((proposal) => manuallyFilledDays.has(buildDayKey(proposal.personId, toIsoDate(proposal.referenceDate))))
    .map((proposal) => proposal.id);

  if (skipIds.length > 0) {
    await prisma.autoDiaryEntryProposal.updateMany({
      where: { id: { in: skipIds } },
      data: {
        status: AutoDiaryProposalStatus.SKIPPED,
        skippedReason: "Giornata gia compilata manualmente",
      },
    });
  }

  for (const person of people) {
    const jobOrderId = person.diaryAutoFillJobOrderId;
    if (!jobOrderId) continue;

    for (const isoDate of workingDays) {
      if (manuallyFilledDays.has(buildDayKey(person.id, isoDate))) {
        continue;
      }

      await prisma.autoDiaryEntryProposal.upsert({
        where: {
          personId_referenceDate: {
            personId: person.id,
            referenceDate: new Date(`${isoDate}T00:00:00.000Z`),
          },
        },
        create: {
          personId: person.id,
          referenceDate: new Date(`${isoDate}T00:00:00.000Z`),
          jobOrderId,
          hours: new Prisma.Decimal(getConfiguredHours(person).toFixed(1)),
        },
        update: {},
      });
    }
  }
}

export async function getAutoDiaryProposalStatus(now = new Date()): Promise<AutoDiaryProposalStatusView> {
  await ensureCurrentMonthAutoDiaryProposals(now);
  const rome = getRomeParts(now);
  const range = getDateRange(rome.year, rome.month);

  const [rows, jobOrders] = await Promise.all([
    prisma.autoDiaryEntryProposal.findMany({
      where: {
        status: AutoDiaryProposalStatus.PENDING,
        referenceDate: {
          gte: range.start,
          lte: range.end,
        },
      },
      orderBy: [{ person: { fullName: "asc" } }, { referenceDate: "asc" }],
      include: {
        person: { select: { fullName: true } },
        jobOrder: { select: { name: true } },
      },
    }),
    prisma.jobOrder.findMany({
      where: { status: ResourceStatus.ACTIVE },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const groupMap = new Map<string, AutoDiaryProposalPersonGroup>();
  for (const row of rows) {
    if (!groupMap.has(row.personId)) {
      groupMap.set(row.personId, {
        personId: row.personId,
        fullName: row.person.fullName,
        rows: [],
      });
    }

    groupMap.get(row.personId)!.rows.push({
      id: row.id,
      personId: row.personId,
      personName: row.person.fullName,
      dateIso: toIsoDate(row.referenceDate),
      jobOrderId: row.jobOrderId,
      jobOrderName: row.jobOrder.name,
      hours: Number(row.hours),
    });
  }

  return {
    shouldAlert: shouldShowAutoDiaryAlert(now),
    currentMonthLabel: formatMonthLabel(rome.year, rome.month),
    pendingCount: rows.length,
    groups: Array.from(groupMap.values()),
    jobOrders,
  };
}

export async function updateAutoDiaryProposal(input: {
  proposalId: string;
  jobOrderId: string;
  hours: number;
}) {
  const roundedHours = Math.round(input.hours * 10) / 10;
  if (!input.proposalId || !input.jobOrderId || Number.isNaN(roundedHours) || roundedHours <= 0) {
    throw new Error("Dati proposta non validi.");
  }

  await prisma.autoDiaryEntryProposal.update({
    where: { id: input.proposalId },
    data: {
      jobOrderId: input.jobOrderId,
      hours: new Prisma.Decimal(roundedHours.toFixed(1)),
    },
  });
}

export async function validateAutoDiaryProposals(now = new Date(), proposalIds?: string[]) {
  await ensureCurrentMonthAutoDiaryProposals(now);
  const rome = getRomeParts(now);
  const range = getDateRange(rome.year, rome.month);

  const proposals = await prisma.autoDiaryEntryProposal.findMany({
    where: {
      status: AutoDiaryProposalStatus.PENDING,
      referenceDate: {
        gte: range.start,
        lte: range.end,
      },
      ...(proposalIds?.length ? { id: { in: proposalIds } } : {}),
    },
    orderBy: [{ referenceDate: "asc" }],
  });

  let applied = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const proposal of proposals) {
      const existing = await tx.diaryActivity.findFirst({
        where: {
          personId: proposal.personId,
          referenceDate: proposal.referenceDate,
        },
        select: { id: true },
      });

      if (existing) {
        await tx.autoDiaryEntryProposal.update({
          where: { id: proposal.id },
          data: {
            status: AutoDiaryProposalStatus.SKIPPED,
            skippedReason: "Giornata gia compilata manualmente",
          },
        });
        skipped += 1;
        continue;
      }

      const activity = await tx.diaryActivity.create({
        data: {
          referenceDate: proposal.referenceDate,
          resourceType: "PERSON",
          personId: proposal.personId,
          jobOrderId: proposal.jobOrderId,
          hours: proposal.hours,
          activityDescription: "Autocompilazione Diario",
          source: "AUTO",
        },
        select: { id: true },
      });

      await tx.autoDiaryEntryProposal.update({
        where: { id: proposal.id },
        data: {
          status: AutoDiaryProposalStatus.APPLIED,
          appliedActivityId: activity.id,
          skippedReason: null,
        },
      });
      applied += 1;
    }
  });

  return { applied, skipped };
}
