import { ResourceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendGmailTextEmail } from "@/lib/gmail-mailer";

const TIME_ZONE = "Europe/Rome";
const THEORETICAL_HOURS_PER_DAY = 8;

type ReminderJobResult = {
  skipped: boolean;
  reason?: string;
  runDateIso: string;
  checkedDateStartIso: string;
  checkedDateEndIso: string;
  targetPeople: number;
  sent: number;
  skippedAlreadySent: number;
  skippedNoRecipients: number;
  skippedNoMissingDays: number;
  errors: number;
};

export type DiaryReminderControlsPersonRow = {
  personId: string;
  fullName: string;
  recipients: string[];
  missingDates: string[];
  todayLogStatus: "SENT" | "ERROR" | null;
  todayLogError: string | null;
  todaySentAtIso: string | null;
};

export type DiaryReminderControlsStatus = {
  runDateIso: string;
  checkedDateStartIso: string;
  checkedDateEndIso: string;
  peopleWithMissing: DiaryReminderControlsPersonRow[];
};

function getRomeParts(now: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
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
    weekday: map.weekday,
    hour: Number(map.hour),
  };
}

function addDaysToIsoDate(isoDate: string, days: number) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isWeekendIsoDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay(); // 0 Sun, 6 Sat
  return day === 0 || day === 6;
}

function formatItalianDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

function buildEmailSubject(personName: string) {
  return `Promemoria compilazione Diario Cantiere - ${personName}`;
}

function buildEmailBody(personName: string, missingDatesIso: string[]) {
  const dateLines = missingDatesIso.map(formatItalianDate).join("\n");
  return [
    "Buongiorno,",
    "",
    `da un nostro controllo risulta che, nel Diario del Cantiere, alcune azioni non siano complete per la risorsa ${personName}.`,
    "",
    "Si chiede cortesemente di provvedere alla compilazione delle giornate sotto indicate.",
    "",
    "Le seguenti giornate non coprono l'orario teorico:",
    "",
    dateLines,
    "",
    "Ti chiediamo di non rispondere a questa comunicazione.",
    "",
  ].join("\n");
}

function buildDateWindow(now: Date) {
  const rome = getRomeParts(now);
  const runDateIso = rome.dateIso;
  const checkedDateStartIso = addDaysToIsoDate(runDateIso, -15);
  const checkedDateEndIso = addDaysToIsoDate(runDateIso, -1);

  const datesToCheck: string[] = [];
  for (
    let current = checkedDateStartIso;
    current <= checkedDateEndIso;
    current = addDaysToIsoDate(current, 1)
  ) {
    if (!isWeekendIsoDate(current)) {
      datesToCheck.push(current);
    }
  }

  return {
    rome,
    runDateIso,
    checkedDateStartIso,
    checkedDateEndIso,
    datesToCheck,
  };
}

async function loadAggregatedHours(input: {
  personIds: string[];
  checkedDateStartIso: string;
  checkedDateEndIso: string;
}) {
  const rangeStart = new Date(`${input.checkedDateStartIso}T00:00:00.000Z`);
  const rangeEnd = new Date(`${input.checkedDateEndIso}T23:59:59.999Z`);

  const aggregated = await prisma.diaryActivity.groupBy({
    by: ["personId", "referenceDate"],
    where: {
      personId: { in: input.personIds },
      referenceDate: {
        gte: rangeStart,
        lte: rangeEnd,
      },
    },
    _sum: {
      hours: true,
    },
  });

  const hoursByPersonId = new Map<string, Map<string, number>>();
  for (const row of aggregated) {
    const personId = row.personId ?? "";
    const isoDate = row.referenceDate.toISOString().slice(0, 10);
    const sum = row._sum.hours ? row._sum.hours.toNumber() : 0;
    if (!hoursByPersonId.has(personId)) {
      hoursByPersonId.set(personId, new Map());
    }
    hoursByPersonId.get(personId)!.set(isoDate, sum);
  }

  return hoursByPersonId;
}

export async function getDiaryReminderControlsStatus(now = new Date()): Promise<DiaryReminderControlsStatus> {
  const window = buildDateWindow(now);

  const people = await prisma.person.findMany({
    where: {
      status: ResourceStatus.ACTIVE,
      diaryAutoFillEnabled: false,
      excludeFromChecks: false,
    },
    select: {
      id: true,
      fullName: true,
      diaryReminderRecipients: true,
    },
    orderBy: { fullName: "asc" },
  });

  const personIds = people.map((person) => person.id);
  const hoursByPersonId =
    personIds.length === 0
      ? new Map<string, Map<string, number>>()
      : await loadAggregatedHours({
          personIds,
          checkedDateStartIso: window.checkedDateStartIso,
          checkedDateEndIso: window.checkedDateEndIso,
        });

  const runDateValue = new Date(`${window.runDateIso}T00:00:00.000Z`);
  const logsToday = await prisma.diaryReminderEmailLog.findMany({
    where: {
      runDate: runDateValue,
      personId: { in: personIds },
    },
    select: {
      personId: true,
      status: true,
      errorMessage: true,
      sentAt: true,
    },
  });
  const todayLogByPersonId = new Map(
    logsToday.map((log) => [
      log.personId,
      {
        status: log.status,
        errorMessage: log.errorMessage ?? null,
        sentAt: log.sentAt ? log.sentAt.toISOString() : null,
      },
    ])
  );

  const peopleWithMissing: DiaryReminderControlsPersonRow[] = people
    .map((person) => {
      const dayHours = hoursByPersonId.get(person.id) ?? new Map<string, number>();
      const missingDates = window.datesToCheck.filter((isoDate) => {
        const hours = dayHours.get(isoDate) ?? 0;
        return hours < THEORETICAL_HOURS_PER_DAY;
      });
      const todayLog = todayLogByPersonId.get(person.id) ?? null;

      return {
        personId: person.id,
        fullName: person.fullName,
        recipients: (person.diaryReminderRecipients ?? []).filter(Boolean),
        missingDates,
        todayLogStatus: todayLog ? (todayLog.status as "SENT" | "ERROR") : null,
        todayLogError: todayLog?.errorMessage ?? null,
        todaySentAtIso: todayLog?.sentAt ?? null,
      };
    })
    .filter((row) => row.missingDates.length > 0);

  return {
    runDateIso: window.runDateIso,
    checkedDateStartIso: window.checkedDateStartIso,
    checkedDateEndIso: window.checkedDateEndIso,
    peopleWithMissing,
  };
}

export async function runDiaryReminderJob(
  now = new Date(),
  options?: { ignoreHour?: boolean; personIds?: string[] }
): Promise<ReminderJobResult> {
  const rome = getRomeParts(now);
  const runDateIso = rome.dateIso;

  if (isWeekendIsoDate(runDateIso)) {
    return {
      skipped: true,
      reason: "Weekend",
      runDateIso,
      checkedDateStartIso: addDaysToIsoDate(runDateIso, -15),
      checkedDateEndIso: addDaysToIsoDate(runDateIso, -1),
      targetPeople: 0,
      sent: 0,
      skippedAlreadySent: 0,
      skippedNoRecipients: 0,
      skippedNoMissingDays: 0,
      errors: 0,
    };
  }

  if (!options?.ignoreHour && rome.hour !== 9) {
    return {
      skipped: true,
      reason: `Not 09:00 in ${TIME_ZONE}`,
      runDateIso,
      checkedDateStartIso: addDaysToIsoDate(runDateIso, -15),
      checkedDateEndIso: addDaysToIsoDate(runDateIso, -1),
      targetPeople: 0,
      sent: 0,
      skippedAlreadySent: 0,
      skippedNoRecipients: 0,
      skippedNoMissingDays: 0,
      errors: 0,
    };
  }

  const window = buildDateWindow(now);
  const checkedDateStartIso = window.checkedDateStartIso;
  const checkedDateEndIso = window.checkedDateEndIso;
  const datesToCheck = window.datesToCheck;

  const people = await prisma.person.findMany({
    where: {
      status: ResourceStatus.ACTIVE,
      diaryAutoFillEnabled: false,
      excludeFromChecks: false,
      ...(options?.personIds?.length ? { id: { in: options.personIds } } : {}),
    },
    select: {
      id: true,
      fullName: true,
      diaryReminderRecipients: true,
    },
    orderBy: { fullName: "asc" },
  });

  const targets = people.filter((person) => (person.diaryReminderRecipients ?? []).length > 0);
  const personIds = targets.map((person) => person.id);

  if (personIds.length === 0) {
    return {
      skipped: false,
      runDateIso,
      checkedDateStartIso,
      checkedDateEndIso,
      targetPeople: 0,
      sent: 0,
      skippedAlreadySent: 0,
      skippedNoRecipients: people.length,
      skippedNoMissingDays: 0,
      errors: 0,
    };
  }

  const hoursByPersonId = await loadAggregatedHours({
    personIds,
    checkedDateStartIso,
    checkedDateEndIso,
  });

  const runDateValue = new Date(`${runDateIso}T00:00:00.000Z`);
  let sent = 0;
  let skippedAlreadySent = 0;
  let skippedNoMissingDays = 0;
  let errors = 0;

  for (const person of targets) {
    const recipients = (person.diaryReminderRecipients ?? []).filter(Boolean);
    if (recipients.length === 0) {
      continue;
    }

    const existingLog = await prisma.diaryReminderEmailLog.findUnique({
      where: {
        personId_runDate: {
          personId: person.id,
          runDate: runDateValue,
        },
      },
      select: { id: true, status: true },
    });

    if (existingLog?.status === "SENT") {
      skippedAlreadySent += 1;
      continue;
    }

    const dayHours = hoursByPersonId.get(person.id) ?? new Map<string, number>();
    const missingDates = datesToCheck.filter((isoDate) => {
      const hours = dayHours.get(isoDate) ?? 0;
      return hours < THEORETICAL_HOURS_PER_DAY;
    });

    if (missingDates.length === 0) {
      skippedNoMissingDays += 1;
      continue;
    }

    try {
      await sendGmailTextEmail({
        to: recipients,
        subject: buildEmailSubject(person.fullName),
        body: buildEmailBody(person.fullName, missingDates),
      });

      if (existingLog) {
        await prisma.diaryReminderEmailLog.update({
          where: { id: existingLog.id },
          data: {
            status: "SENT",
            recipients,
            missingDates,
            sentAt: new Date(),
            errorMessage: null,
          },
        });
      } else {
        await prisma.diaryReminderEmailLog.create({
          data: {
            personId: person.id,
            runDate: runDateValue,
            status: "SENT",
            recipients,
            missingDates,
            sentAt: new Date(),
          },
        });
      }
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (existingLog) {
        await prisma.diaryReminderEmailLog.update({
          where: { id: existingLog.id },
          data: {
            status: "ERROR",
            recipients,
            missingDates,
            sentAt: null,
            errorMessage: message,
          },
        });
      } else {
        await prisma.diaryReminderEmailLog.create({
          data: {
            personId: person.id,
            runDate: runDateValue,
            status: "ERROR",
            recipients,
            missingDates,
            errorMessage: message,
          },
        });
      }
      errors += 1;
    }
  }

  return {
    skipped: false,
    runDateIso,
    checkedDateStartIso,
    checkedDateEndIso,
    targetPeople: targets.length,
    sent,
    skippedAlreadySent,
    skippedNoRecipients: people.length - targets.length,
    skippedNoMissingDays,
    errors,
  };
}
