import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getScheduleEvents } from "@/lib/schedule-events";
import { DeadlineOrigin, SyncSource, UserStatus } from "@prisma/client";
import { randomUUID } from "crypto";

function toInputDate(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function parseOptionalDate(value?: string | null) {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

function normalizeOptionalString(value: unknown) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

function normalizeBoolean(value: unknown) {
  return value === true || value === "true";
}

function isValidTime(value: string | null) {
  if (!value) return true;
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function addWeeks(date: Date, weeks: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + weeks * 7);
  return next;
}

function buildRecurrenceDates(startDate: Date, intervalWeeks: number, untilDate: Date) {
  const dates: Date[] = [];
  for (let current = new Date(startDate); current <= untilDate; current = addWeeks(current, intervalWeeks)) {
    dates.push(new Date(current));
  }
  return dates;
}

function buildRecurrenceRule(input: { seriesId: string; intervalWeeks: number; untilDate: Date }) {
  return JSON.stringify({
    kind: "WEEKLY",
    seriesId: input.seriesId,
    intervalWeeks: input.intervalWeeks,
    until: toInputDate(input.untilDate),
  });
}

function buildResponseRow(row: {
  id: string;
  title: string;
  description: string | null;
  eventDate: Date;
  startTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
  recurrenceRule?: string | null;
  origin: DeadlineOrigin;
  lastSource: SyncSource;
  maintenanceId: string | null;
  trainingId: string | null;
  linkedEquipment: {
    id: string;
    nameDescription: string;
  } | null;
  linkedPerson: {
    id: string;
    fullName: string;
  } | null;
  originLabel: string;
  canEdit: boolean;
  canDelete: boolean;
  eventKind: "DEADLINE" | "JOB_ORDER_END";
  linkedJobOrder: {
    id: string;
    name: string;
    type: string;
  } | null;
}) {
  const recurrence = parseRecurrenceRule(row.recurrenceRule);
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    eventDate: toInputDate(row.eventDate),
    startTime: row.startTime ?? "",
    endTime: row.endTime ?? "",
    isAllDay: row.isAllDay,
    recurrenceSeriesId: recurrence?.seriesId ?? null,
    recurrenceLabel: recurrence
      ? `Ogni ${recurrence.intervalWeeks} settiman${recurrence.intervalWeeks === 1 ? "a" : "e"} fino al ${recurrence.until.split("-").reverse().join("/")}`
      : "",
    origin: row.origin,
    originLabel: row.originLabel,
    lastSource: row.lastSource,
    maintenanceId: row.maintenanceId,
    trainingId: row.trainingId,
    canEdit: row.canEdit,
    canDelete: row.canDelete,
    eventKind: row.eventKind,
    linkedEquipment: row.linkedEquipment,
    linkedPerson: row.linkedPerson,
    linkedJobOrder: row.linkedJobOrder,
  };
}

function parseRecurrenceRule(value: string | null | undefined): {
  kind: "WEEKLY";
  seriesId: string;
  intervalWeeks: number;
  until: string;
} | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (
      parsed?.kind === "WEEKLY" &&
      typeof parsed.seriesId === "string" &&
      Number.isFinite(Number(parsed.intervalWeeks)) &&
      typeof parsed.until === "string"
    ) {
      return {
        kind: "WEEKLY",
        seriesId: parsed.seriesId,
        intervalWeeks: Number(parsed.intervalWeeks),
        until: parsed.until,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function buildRow(row: Awaited<ReturnType<typeof getScheduleEvents>>[number]) {
  return buildResponseRow(row);
}

function buildDeadlineRow(row: {
  id: string;
  title: string;
  description: string | null;
  eventDate: Date;
  startTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
  recurrenceRule: string | null;
  origin: DeadlineOrigin;
  lastSource: SyncSource;
  maintenanceId: string | null;
  trainingId: string | null;
  maintenance: {
    equipment: {
      id: string;
      nameDescription: string;
    };
  } | null;
  training: {
    person: {
      id: string;
      fullName: string;
    };
  } | null;
}) {
  return buildResponseRow({
    id: row.id,
    title: row.title,
    description: row.description,
    eventDate: row.eventDate,
    startTime: row.startTime,
    endTime: row.endTime,
    isAllDay: row.isAllDay,
    recurrenceRule: row.recurrenceRule,
    origin: row.origin,
    originLabel:
      row.origin === DeadlineOrigin.MAINTENANCE
        ? "Manutenzione"
        : row.origin === DeadlineOrigin.TRAINING
        ? "Formazione"
        : "Manuale",
    lastSource: row.lastSource,
    maintenanceId: row.maintenanceId,
    trainingId: row.trainingId,
    canEdit: row.origin === DeadlineOrigin.MANUAL,
    canDelete: row.origin === DeadlineOrigin.MANUAL,
    eventKind: "DEADLINE",
    linkedEquipment: row.maintenance?.equipment
      ? {
          id: row.maintenance.equipment.id,
          nameDescription: row.maintenance.equipment.nameDescription,
        }
      : null,
    linkedPerson: row.training?.person
      ? {
          id: row.training.person.id,
          fullName: row.training.person.fullName,
        }
      : null,
    linkedJobOrder: null,
  });
}

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

export async function GET() {
  const authResult = await getAuthorizedUser();
  if (authResult.error) return authResult.error;

  const rows = await getScheduleEvents();

  return NextResponse.json({
    rows: rows.map(buildRow),
  });
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthorizedUser();
  if (authResult.error) return authResult.error;

  const { appUser } = authResult;
  const body = await request.json();

  const title = String(body.title || "").trim();
  const description = normalizeOptionalString(body.description);
  const eventDateRaw = String(body.eventDate || "").trim();
  const isAllDay = normalizeBoolean(body.isAllDay);
  const startTime = isAllDay ? null : normalizeOptionalString(body.startTime);
  const endTime = isAllDay ? null : normalizeOptionalString(body.endTime);
  const recurrenceEnabled = normalizeBoolean(body.recurrenceEnabled);
  const recurrenceIntervalWeeks = Math.max(1, Math.min(52, Number(body.recurrenceIntervalWeeks || 1)));
  const recurrenceUntilRaw = String(body.recurrenceUntil || "").trim();

  if (!title) {
    return NextResponse.json({ error: "Il titolo è obbligatorio" }, { status: 400 });
  }

  if (!eventDateRaw) {
    return NextResponse.json({ error: "La data evento è obbligatoria" }, { status: 400 });
  }

  const eventDate = parseOptionalDate(eventDateRaw);

  if (!eventDate || Number.isNaN(eventDate.getTime())) {
    return NextResponse.json({ error: "Data evento non valida" }, { status: 400 });
  }

  if (!isAllDay && !startTime) {
    return NextResponse.json(
      { error: "Se non è tutto il giorno, l'ora di inizio è obbligatoria" },
      { status: 400 }
    );
  }

  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return NextResponse.json(
      { error: "Le ore devono essere nel formato HH:MM" },
      { status: 400 }
    );
  }

  if (startTime && endTime && endTime < startTime) {
    return NextResponse.json(
      { error: "L'ora di fine deve essere successiva all'ora di inizio" },
      { status: 400 }
    );
  }

  const recurrenceUntil = recurrenceEnabled ? parseOptionalDate(recurrenceUntilRaw) : null;

  if (recurrenceEnabled) {
    if (!Number.isFinite(recurrenceIntervalWeeks) || recurrenceIntervalWeeks < 1) {
      return NextResponse.json({ error: "Intervallo ricorrenza non valido" }, { status: 400 });
    }

    if (!recurrenceUntil || Number.isNaN(recurrenceUntil.getTime())) {
      return NextResponse.json({ error: "Inserisci una data fine ricorrenza valida" }, { status: 400 });
    }

    if (recurrenceUntil < eventDate) {
      return NextResponse.json({ error: "La fine ricorrenza deve essere successiva alla data evento" }, { status: 400 });
    }
  }

  const seriesId = recurrenceEnabled ? randomUUID() : null;
  const recurrenceRule =
    recurrenceEnabled && seriesId && recurrenceUntil
      ? buildRecurrenceRule({ seriesId, intervalWeeks: recurrenceIntervalWeeks, untilDate: recurrenceUntil })
      : null;
  const dates = recurrenceEnabled && recurrenceUntil ? buildRecurrenceDates(eventDate, recurrenceIntervalWeeks, recurrenceUntil) : [eventDate];

  const createdRows = await prisma.$transaction(
    dates.map((date) =>
      prisma.deadline.create({
        data: {
          title,
          description,
          eventDate: date,
          startTime,
          endTime,
          isAllDay,
          recurrenceRule,
          origin: DeadlineOrigin.MANUAL,
          createdByUserId: appUser.id,
          updatedByUserId: appUser.id,
          lastSource: SyncSource.GIGEST,
          lastModifiedAt: new Date(),
        },
        include: {
          maintenance: {
            include: {
              equipment: {
                select: {
                  id: true,
                  nameDescription: true,
                },
              },
            },
          },
          training: {
            include: {
              person: {
                select: {
                  id: true,
                  fullName: true,
                },
              },
            },
          },
        },
      })
    )
  );

  return NextResponse.json({
    success: true,
    row: buildDeadlineRow(createdRows[0]),
    createdCount: createdRows.length,
  });
}
