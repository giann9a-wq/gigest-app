import { NextRequest, NextResponse } from "next/server";
import { DeadlineOrigin, SyncSource } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { deleteDriveFile } from "@/lib/google-drive-document-storage";
import { syncDeadlinesToSharedGoogleCalendar } from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma";

function toInputDate(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function parseOptionalDate(value?: string | null) {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

type TrainingRowInput = {
  clientLocalId?: string;
  id?: string;
  course?: string;
  description?: string;
  trainingDate?: string;
  mandatory?: boolean;
  expiresAt?: string;
  isRecurring?: boolean;
  recurrenceMonths?: string | number | null;
};

async function syncCalendarWithTimeout(timeoutMs = 8000) {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      syncDeadlinesToSharedGoogleCalendar(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error("Sincronizzazione calendario ancora in corso, riprova dallo scadenziario se necessario")
            ),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { id } = await context.params;

  const rows = await prisma.training.findMany({
    where: { personId: id },
    orderBy: { trainingDate: "asc" },
    include: {
      documents: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json({
    rows: rows.map((row) => ({
      id: row.id,
      course: row.course,
      description: row.description ?? "",
      trainingDate: toInputDate(row.trainingDate),
      mandatory: row.mandatory,
      expiresAt: toInputDate(row.expiresAt),
      isRecurring: row.isRecurring,
      recurrenceMonths: row.recurrenceMonths ?? "",
      documents: row.documents.map((doc) => ({
        id: doc.id,
        fileName: doc.fileName,
      })),
    })),
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const rows = Array.isArray(body.rows) ? (body.rows as TrainingRowInput[]) : [];

  const cleanedRows = rows
    .map((row) => ({
      clientLocalId: row.clientLocalId?.trim() || undefined,
      id: row.id?.trim() || undefined,
      course: row.course?.trim() || "",
      description: row.description?.trim() || "",
      trainingDate: row.trainingDate || "",
      mandatory: row.mandatory === true,
      expiresAt: row.expiresAt || "",
      isRecurring: row.isRecurring === true,
      recurrenceMonths:
        row.recurrenceMonths === "" || row.recurrenceMonths === null || row.recurrenceMonths === undefined
          ? ""
          : String(row.recurrenceMonths),
    }))
    .filter(
      (row) =>
        row.course ||
        row.description ||
        row.trainingDate ||
        row.mandatory ||
        row.expiresAt ||
        row.isRecurring ||
        row.recurrenceMonths
    );

  for (const row of cleanedRows) {
    if (!row.course) {
      return NextResponse.json(
        { error: "Ogni riga formazione compilata deve avere il corso" },
        { status: 400 }
      );
    }

    if (!row.trainingDate) {
      return NextResponse.json(
        { error: "Ogni riga formazione compilata deve avere la data" },
        { status: 400 }
      );
    }

    const trainingDate = parseOptionalDate(row.trainingDate);
    const expiresAt = parseOptionalDate(row.expiresAt);

    if (!trainingDate || Number.isNaN(trainingDate.getTime())) {
      return NextResponse.json({ error: "Data formazione non valida" }, { status: 400 });
    }

    if (expiresAt && expiresAt < trainingDate) {
      return NextResponse.json(
        { error: `La scadenza del corso "${row.course}" non puo essere precedente alla data del corso` },
        { status: 400 }
      );
    }

    if (row.isRecurring) {
      const parsedMonths = Number(row.recurrenceMonths);
      if (!Number.isInteger(parsedMonths) || parsedMonths <= 0) {
        return NextResponse.json(
          { error: "Le formazioni ricorrenti devono avere un numero di mesi maggiore di zero" },
          { status: 400 }
        );
      }

      if (!row.expiresAt) {
        return NextResponse.json(
          { error: "Le formazioni ricorrenti devono avere una scadenza pianificata" },
          { status: 400 }
        );
      }
    }
  }

  const driveFileIdsToDelete: string[] = [];
  const savedRows: Array<{ clientLocalId?: string; id: string }> = [];
  let hasCalendarDeadline = false;

  try {
    await prisma.$transaction(async (tx) => {
      const person = await tx.person.findUnique({
        where: { id },
        select: { id: true, fullName: true },
      });

      if (!person) {
        throw new Error("Risorsa non trovata");
      }

      const existing = await tx.training.findMany({
        where: { personId: id },
        select: {
          id: true,
          documents: {
            select: { driveFileId: true },
          },
        },
      });

      const existingIds = new Set(existing.map((row) => row.id));
      const incomingIds = new Set(cleanedRows.filter((row) => row.id).map((row) => row.id!));
      const idsToDelete = existing.map((row) => row.id).filter((existingId) => !incomingIds.has(existingId));

      const invalidIncomingId = [...incomingIds].find((incomingId) => !existingIds.has(incomingId));
      if (invalidIncomingId) {
        throw new Error("Riga formazione non valida per questa risorsa");
      }

      if (idsToDelete.length > 0) {
        driveFileIdsToDelete.push(
          ...existing
            .filter((row) => idsToDelete.includes(row.id))
            .flatMap((row) => row.documents.map((doc) => doc.driveFileId))
        );

        await tx.training.deleteMany({
          where: { id: { in: idsToDelete } },
        });
      }

      for (const row of cleanedRows) {
        const data = {
          personId: id,
          course: row.course,
          description: row.description || null,
          trainingDate: parseOptionalDate(row.trainingDate)!,
          mandatory: row.mandatory,
          expiresAt: parseOptionalDate(row.expiresAt),
          isRecurring: row.isRecurring,
          recurrenceMonths: row.isRecurring ? Number(row.recurrenceMonths) : null,
          createdByUserId: appUser.id,
        };

        const savedTraining = row.id
          ? await tx.training.update({
              where: { id: row.id },
              data,
            })
          : await tx.training.create({
              data,
            });

        savedRows.push({
          clientLocalId: row.clientLocalId,
          id: savedTraining.id,
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

          await tx.deadline.upsert({
            where: { trainingId: savedTraining.id },
            update: {
              title: `Scadenza formazione: ${savedTraining.course}`,
              description: deadlineDescription,
              eventDate: savedTraining.expiresAt,
              startTime: null,
              endTime: null,
              isAllDay: true,
              origin: DeadlineOrigin.TRAINING,
              updatedByUserId: appUser.id,
              lastSource: SyncSource.GIGEST,
              lastModifiedAt: new Date(),
            },
            create: {
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
        } else {
          await tx.deadline.deleteMany({
            where: { trainingId: savedTraining.id },
          });
        }
      }
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore salvataggio formazione" },
      { status: 400 }
    );
  }

  if (driveFileIdsToDelete.length > 0) {
    await Promise.allSettled(driveFileIdsToDelete.map((driveFileId) => deleteDriveFile(driveFileId)));
  }

  let calendarSyncError: string | null = null;

  if (hasCalendarDeadline) {
    try {
      await syncCalendarWithTimeout();
    } catch (err) {
      calendarSyncError =
        err instanceof Error ? err.message : "Sincronizzazione calendario non completata";
    }
  }

  return NextResponse.json({
    success: true,
    savedRows,
    calendarSyncError,
  });
}
