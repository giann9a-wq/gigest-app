import { ResourceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureCurrentMonthAutoDiaryProposals } from "@/lib/auto-diary-proposals";
import { sendGmailTextEmail } from "@/lib/gmail-mailer";
import { getDiaryReminderControlsStatus } from "@/lib/diary-reminder-job";
import { getMonthlyResourceReportSettings } from "@/lib/monthly-automation-settings";
import { buildMonthlyResourceReport } from "@/lib/monthly-resource-report";
import {
  buildMonthlyResourceReportFileName,
  buildMonthlyResourceReportPdf,
} from "@/lib/monthly-resource-report-pdf";

const TIME_ZONE = "Europe/Rome";
const MONTHLY_REPORT_AUTOMATION = "monthly-resource-report";
const END_MONTH_REMINDER_AUTOMATION = "end-month-diary-reminder";

type AutomationResult = {
  skipped: boolean;
  reason?: string;
  runKey: string;
  sent: number;
  errors: number;
};

function getRomeParts(now: Date) {
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

function isWeekendIsoDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function getLastWorkingDayIso(year: number, month: number) {
  const date = new Date(Date.UTC(year, month, 0));
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10);
}

function getPreviousMonth(year: number, month: number) {
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }
  return { year, month: month - 1 };
}

function formatItalianDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

function formatMonthLabel(month: number, year: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function buildMissingLoadingsSection(peopleWithMissing: Awaited<ReturnType<typeof getDiaryReminderControlsStatus>>["peopleWithMissing"]) {
  if (peopleWithMissing.length === 0) {
    return "Non risultano mancati caricamenti nella finestra di controllo attuale.";
  }

  return [
    "Mancati caricamenti rilevati nella finestra di controllo attuale:",
    "",
    ...peopleWithMissing.flatMap((person) => [
      `${person.fullName}: ${person.missingDates.map(formatItalianDate).join(", ")}`,
    ]),
  ].join("\n");
}

async function alreadySent(automationKey: string, runKey: string) {
  const log = await prisma.automationEmailLog.findUnique({
    where: {
      automationKey_runKey: {
        automationKey,
        runKey,
      },
    },
    select: { status: true },
  });

  return log?.status === "SENT";
}

async function writeAutomationLog(input: {
  automationKey: string;
  runKey: string;
  status: string;
  recipients: string[];
  subject: string;
  sentAt?: Date | null;
  errorMessage?: string | null;
}) {
  await prisma.automationEmailLog.upsert({
    where: {
      automationKey_runKey: {
        automationKey: input.automationKey,
        runKey: input.runKey,
      },
    },
    create: input,
    update: {
      status: input.status,
      recipients: input.recipients,
      subject: input.subject,
      sentAt: input.sentAt ?? null,
      errorMessage: input.errorMessage ?? null,
    },
  });
}

export async function runMonthlyResourceReportAutomation(now = new Date()): Promise<AutomationResult> {
  const rome = getRomeParts(now);
  const reportMonth = getPreviousMonth(rome.year, rome.month);
  const runKey = `${reportMonth.year}-${String(reportMonth.month).padStart(2, "0")}`;

  if (rome.day !== 1 || rome.hour !== 9) {
    return { skipped: true, reason: "Non e' il primo del mese alle 09:00 Europe/Rome", runKey, sent: 0, errors: 0 };
  }

  const settings = await getMonthlyResourceReportSettings();
  const recipients = settings.recipients;
  if (recipients.length === 0) {
    return { skipped: true, reason: "Nessun destinatario configurato", runKey, sent: 0, errors: 0 };
  }

  if (await alreadySent(MONTHLY_REPORT_AUTOMATION, runKey)) {
    return { skipped: true, reason: "Report mensile gia' inviato", runKey, sent: 0, errors: 0 };
  }

  const report = await buildMonthlyResourceReport(reportMonth.year, reportMonth.month, {
    personIds: settings.includedResourceIds,
  });
  const missingStatus = await getDiaryReminderControlsStatus(now);
  const subject = `Stampa risorse ore - ${formatMonthLabel(reportMonth.month, reportMonth.year)}`;
  const body = [
    "Buongiorno,",
    "",
    `in allegato trovi la stampa risorse ore del mese di ${formatMonthLabel(reportMonth.month, reportMonth.year)}.`,
    "",
    buildMissingLoadingsSection(missingStatus.peopleWithMissing),
    "",
    "Ti chiediamo di non rispondere a questa comunicazione.",
    "",
  ].join("\n");

  try {
    await sendGmailTextEmail({
      to: recipients,
      subject,
      body,
      attachments: [
        {
          fileName: buildMonthlyResourceReportFileName(reportMonth.month, reportMonth.year),
          contentType: "application/pdf",
          content: buildMonthlyResourceReportPdf(report),
        },
      ],
    });
    await writeAutomationLog({
      automationKey: MONTHLY_REPORT_AUTOMATION,
      runKey,
      status: "SENT",
      recipients,
      subject,
      sentAt: new Date(),
    });
    return { skipped: false, runKey, sent: 1, errors: 0 };
  } catch (error) {
    await writeAutomationLog({
      automationKey: MONTHLY_REPORT_AUTOMATION,
      runKey,
      status: "ERROR",
      recipients,
      subject,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return { skipped: false, runKey, sent: 0, errors: 1 };
  }
}

export async function runEndMonthDiaryReminderAutomation(now = new Date()): Promise<AutomationResult> {
  const rome = getRomeParts(now);
  const runKey = rome.dateIso;

  await ensureCurrentMonthAutoDiaryProposals(now);

  if (rome.hour !== 9 || isWeekendIsoDate(rome.dateIso) || rome.dateIso !== getLastWorkingDayIso(rome.year, rome.month)) {
    return { skipped: true, reason: "Non e' l'ultimo giorno lavorativo del mese alle 09:00 Europe/Rome", runKey, sent: 0, errors: 0 };
  }

  const people = await prisma.person.findMany({
    where: { status: ResourceStatus.ACTIVE },
    select: {
      id: true,
      fullName: true,
      diaryReminderRecipients: true,
    },
    orderBy: { fullName: "asc" },
  });

  let sent = 0;
  let errors = 0;
  for (const person of people) {
    const personRunKey = `${runKey}:${person.id}`;
    const recipients = (person.diaryReminderRecipients ?? []).filter(Boolean);
    if (recipients.length === 0 || (await alreadySent(END_MONTH_REMINDER_AUTOMATION, personRunKey))) {
      continue;
    }

    const subject = `Reminder fine mese Diario Cantiere - ${person.fullName}`;
    const body = [
      "Buongiorno,",
      "",
      `Reminder di fine mese per la risorsa ${person.fullName}. Compilare entro la giornata di oggi tutte le ore mancanti del mese in corso.`,
      "",
      "Ti chiediamo di non rispondere a questa comunicazione.",
      "",
    ].join("\n");

    try {
      await sendGmailTextEmail({ to: recipients, subject, body });
      await writeAutomationLog({
        automationKey: END_MONTH_REMINDER_AUTOMATION,
        runKey: personRunKey,
        status: "SENT",
        recipients,
        subject,
        sentAt: new Date(),
      });
      sent += 1;
    } catch (error) {
      await writeAutomationLog({
        automationKey: END_MONTH_REMINDER_AUTOMATION,
        runKey: personRunKey,
        status: "ERROR",
        recipients,
        subject,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      errors += 1;
    }
  }

  return { skipped: false, runKey, sent, errors };
}

export async function runMonthlyEmailAutomations(now = new Date()) {
  const [monthlyResourceReport, endMonthDiaryReminder] = await Promise.all([
    runMonthlyResourceReportAutomation(now),
    runEndMonthDiaryReminderAutomation(now),
  ]);

  return {
    monthlyResourceReport,
    endMonthDiaryReminder,
  };
}
