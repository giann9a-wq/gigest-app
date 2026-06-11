import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DeadlineOrigin, SyncSource, UserStatus } from "@prisma/client";

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
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const appUser = await prisma.user.findUnique({
    where: { email: session.user.email.toLowerCase() },
    select: { id: true, status: true },
  });

  if (!appUser || appUser.status !== UserStatus.ACTIVE) {
    return NextResponse.json({ error: "Utente non autorizzato" }, { status: 403 });
  }

  const { id } = await context.params;
  const today = toDateOnly(new Date());

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.maintenance.findUnique({
        where: { id },
        include: {
          equipment: { select: { id: true, nameDescription: true } },
        },
      });

      if (!current) {
        throw new Error("Manutenzione non trovata");
      }

      if (!current.isRecurring || !current.recurrenceMonths || current.recurrenceMonths <= 0) {
        throw new Error("Questa manutenzione non e ricorrente");
      }

      const nextIntervention = addMonths(today, current.recurrenceMonths);

      await tx.deadline.deleteMany({
        where: { maintenanceId: current.id },
      });

      await tx.maintenance.update({
        where: { id: current.id },
        data: {
          nextIntervention: null,
          isRecurring: false,
          recurrenceMonths: null,
        },
      });

      const created = await tx.maintenance.create({
        data: {
          equipmentId: current.equipmentId,
          interventionType: current.interventionType,
          interventionDate: today,
          nextIntervention,
          isRecurring: true,
          recurrenceMonths: current.recurrenceMonths,
          cost: null,
          notes: `Intervento confermato da dashboard il ${toInputDate(today)}. Scadenza precedente: ${
            current.nextIntervention ? toInputDate(current.nextIntervention) : "-"
          }.`,
          createdByUserId: appUser.id,
        },
      });

      const deadlineTitle = `Manutenzione ${current.equipment.nameDescription}`;
      const deadlineDescription = [
        `Tipo intervento: ${created.interventionType}`,
        `Ricorrente ogni ${created.recurrenceMonths} mesi`,
        created.notes ? `Note: ${created.notes}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      await tx.deadline.create({
        data: {
          title: deadlineTitle,
          description: deadlineDescription,
          eventDate: nextIntervention,
          startTime: null,
          endTime: null,
          isAllDay: true,
          origin: DeadlineOrigin.MAINTENANCE,
          maintenanceId: created.id,
          createdByUserId: appUser.id,
          updatedByUserId: appUser.id,
          lastSource: SyncSource.GIGEST,
          lastModifiedAt: new Date(),
        },
      });

      return {
        equipmentName: current.equipment.nameDescription,
        nextIntervention: toInputDate(nextIntervention),
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore conferma manutenzione" },
      { status: 400 }
    );
  }
}
