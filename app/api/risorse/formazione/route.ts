import { NextRequest, NextResponse } from "next/server";
import { DeadlineOrigin, SyncSource } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { syncDeadlinesToSharedGoogleCalendar } from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma";

type TrainingCreateInput = {
  personId?: string;
  course?: string;
  description?: string;
  trainingDate?: string;
  mandatory?: boolean;
  expiresAt?: string;
  isRecurring?: boolean;
  recurrenceMonths?: string | number | null;
};

function toInputDate(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function parseOptionalDate(value?: string | null) {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

async function syncCalendarWithTimeout(timeoutMs = 8000) {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      syncDeadlinesToSharedGoogleCalendar(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Sincronizzazione calendario ancora in corso")),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function GET() {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const [people, rows] = await Promise.all([
    prisma.person.findMany({
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, roleDescription: true, status: true },
    }),
    prisma.training.findMany({
      orderBy: [{ trainingDate: "desc" }, { createdAt: "desc" }],
      include: {
        person: { select: { id: true, fullName: true, roleDescription: true } },
        documents: { orderBy: { createdAt: "desc" }, select: { id: true, fileName: true } },
      },
    }),
  ]);

  return NextResponse.json({
    people,
    rows: rows.map((row) => ({
      id: row.id,
      personId: row.personId,
      personName: row.person.fullName,
      roleDescription: row.person.roleDescription ?? "",
      course: row.course,
      description: row.description ?? "",
      trainingDate: toInputDate(row.trainingDate),
      mandatory: row.mandatory,
      expiresAt: toInputDate(row.expiresAt),
      isRecurring: row.isRecurring,
      recurrenceMonths: row.recurrenceMonths ?? "",
      documents: row.documents,
    })),
  });
}

export async function POST(request: NextRequest) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const body = (await request.json()) as TrainingCreateInput;
  const personId = body.personId?.trim() || "";
  const course = body.course?.trim() || "";
  const description = body.description?.trim() || "";
  const trainingDate = body.trainingDate || "";
  const expiresAt = body.expiresAt || "";
  const isRecurring = body.isRecurring === true;
  const recurrenceMonths =
    body.recurrenceMonths === "" || body.recurrenceMonths === null || body.recurrenceMonths === undefined
      ? ""
      : String(body.recurrenceMonths);

  if (!personId) return NextResponse.json({ error: "Seleziona una risorsa" }, { status: 400 });
  if (!course) return NextResponse.json({ error: "Il corso e obbligatorio" }, { status: 400 });
  if (!trainingDate) return NextResponse.json({ error: "La data formazione e obbligatoria" }, { status: 400 });

  const parsedTrainingDate = parseOptionalDate(trainingDate);
  const parsedExpiresAt = parseOptionalDate(expiresAt);

  if (!parsedTrainingDate || Number.isNaN(parsedTrainingDate.getTime())) {
    return NextResponse.json({ error: "Data formazione non valida" }, { status: 400 });
  }

  if (parsedExpiresAt && parsedExpiresAt < parsedTrainingDate) {
    return NextResponse.json({ error: "La scadenza non puo essere precedente alla data corso" }, { status: 400 });
  }

  if (isRecurring) {
    const parsedMonths = Number(recurrenceMonths);
    if (!Number.isInteger(parsedMonths) || parsedMonths <= 0) {
      return NextResponse.json({ error: "Indica i mesi di ricorrenza" }, { status: 400 });
    }
    if (!expiresAt) {
      return NextResponse.json({ error: "Le formazioni ricorrenti devono avere una scadenza" }, { status: 400 });
    }
  }

  let hasCalendarDeadline = false;

  const created = await prisma.$transaction(async (tx) => {
    const person = await tx.person.findUnique({
      where: { id: personId },
      select: { id: true, fullName: true },
    });

    if (!person) {
      throw new Error("Risorsa non trovata");
    }

    const savedTraining = await tx.training.create({
      data: {
        personId,
        course,
        description: description || null,
        trainingDate: parsedTrainingDate,
        mandatory: body.mandatory === true,
        expiresAt: parsedExpiresAt,
        isRecurring,
        recurrenceMonths: isRecurring ? Number(recurrenceMonths) : null,
        createdByUserId: appUser.id,
      },
    });

    if (savedTraining.expiresAt) {
      hasCalendarDeadline = true;
      const deadlineDescription =
        [
          `Risorsa: ${person.fullName}`,
          savedTraining.description ? `Descrizione: ${savedTraining.description}` : null,
          savedTraining.mandatory ? "Obbligatorio: si" : "Obbligatorio: no",
          savedTraining.isRecurring && savedTraining.recurrenceMonths
            ? `Ricorrente ogni ${savedTraining.recurrenceMonths} mesi`
            : null,
        ]
          .filter(Boolean)
          .join(" | ") || null;

      await tx.deadline.create({
        data: {
          title: `Scadenza formazione: ${savedTraining.course}`,
          description: deadlineDescription,
          eventDate: savedTraining.expiresAt,
          startTime: null,
          endTime: null,
          isAllDay: true,
          origin: DeadlineOrigin.TRAINING,
          trainingId: savedTraining.id,
          createdByUserId: appUser.id,
          updatedByUserId: appUser.id,
          lastSource: SyncSource.GIGEST,
          lastModifiedAt: new Date(),
        },
      });
    }

    return savedTraining;
  });

  let calendarSyncError: string | null = null;

  if (hasCalendarDeadline) {
    try {
      await syncCalendarWithTimeout();
    } catch (err) {
      calendarSyncError = err instanceof Error ? err.message : "Sincronizzazione calendario non completata";
    }
  }

  return NextResponse.json({ success: true, id: created.id, calendarSyncError });
}
