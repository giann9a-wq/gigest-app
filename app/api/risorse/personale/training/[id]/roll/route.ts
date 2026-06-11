import { NextRequest, NextResponse } from "next/server";
import { DeadlineOrigin, SyncSource } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";

function toDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addMonths(value: Date, months: number) {
  const next = new Date(value.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function toInputDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { id } = await context.params;
  const today = toDateOnly(new Date());

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.training.findUnique({
        where: { id },
        include: {
          person: { select: { id: true, fullName: true } },
        },
      });

      if (!current) {
        throw new Error("Formazione non trovata");
      }

      if (!current.isRecurring || !current.recurrenceMonths || current.recurrenceMonths <= 0) {
        throw new Error("Questa formazione non e ricorrente");
      }

      const nextExpiresAt = addMonths(today, current.recurrenceMonths);

      await tx.deadline.deleteMany({
        where: { trainingId: current.id },
      });

      await tx.training.update({
        where: { id: current.id },
        data: {
          expiresAt: null,
          isRecurring: false,
          recurrenceMonths: null,
        },
      });

      const created = await tx.training.create({
        data: {
          personId: current.personId,
          course: current.course,
          description: current.description,
          trainingDate: today,
          mandatory: current.mandatory,
          expiresAt: nextExpiresAt,
          isRecurring: true,
          recurrenceMonths: current.recurrenceMonths,
          createdByUserId: appUser.id,
        },
      });

      const deadlineDescription =
        [
          `Risorsa: ${current.person.fullName}`,
          created.description ? `Descrizione: ${created.description}` : null,
          created.mandatory ? "Obbligatorio: si" : "Obbligatorio: no",
          `Ricorrente ogni ${created.recurrenceMonths} mesi`,
        ]
          .filter(Boolean)
          .join(" | ") || null;

      await tx.deadline.create({
        data: {
          title: `Scadenza formazione: ${created.course}`,
          description: deadlineDescription,
          eventDate: nextExpiresAt,
          startTime: null,
          endTime: null,
          isAllDay: true,
          origin: DeadlineOrigin.TRAINING,
          trainingId: created.id,
          createdByUserId: appUser.id,
          updatedByUserId: appUser.id,
          lastSource: SyncSource.GIGEST,
          lastModifiedAt: new Date(),
        },
      });

      return {
        personName: current.person.fullName,
        nextExpiresAt: toInputDate(nextExpiresAt),
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore conferma formazione" },
      { status: 400 }
    );
  }
}
