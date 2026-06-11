import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, DeadlineOrigin, SyncSource, UserStatus } from "@prisma/client";

function toInputDate(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function parseOptionalDate(value?: string | null) {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

type MaintenanceRowInput = {
  id?: string;
  interventionType?: string;
  interventionDate?: string;
  nextIntervention?: string;
  isRecurring?: boolean;
  recurrenceMonths?: string | number | null;
  cost?: string | number | null;
  notes?: string;
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { id } = await context.params;

  const rows = await prisma.maintenance.findMany({
    where: { equipmentId: id },
    orderBy: { interventionDate: "asc" },
    include: {
      documents: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json({
    rows: rows.map((row) => ({
      id: row.id,
      interventionType: row.interventionType,
      interventionDate: toInputDate(row.interventionDate),
      nextIntervention: toInputDate(row.nextIntervention),
      isRecurring: row.isRecurring,
      recurrenceMonths: row.recurrenceMonths ?? "",
      cost: row.cost !== null ? Number(row.cost) : "",
      notes: row.notes ?? "",
      documents: row.documents.map((doc) => ({
        id: doc.id,
        fileName: doc.fileName,
        filePath: doc.filePath,
      })),
    })),
  });
}

export async function POST(
  request: NextRequest,
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
  const body = await request.json();
  const rows = Array.isArray(body.rows) ? (body.rows as MaintenanceRowInput[]) : [];

  const cleanedRows = rows
    .map((row) => ({
      id: row.id?.trim() || undefined,
      interventionType: row.interventionType?.trim() || "",
      interventionDate: row.interventionDate || "",
      nextIntervention: row.nextIntervention || "",
      isRecurring: row.isRecurring ?? false,
      recurrenceMonths:
        row.recurrenceMonths === "" || row.recurrenceMonths === null || row.recurrenceMonths === undefined
          ? ""
          : String(row.recurrenceMonths),
      cost:
        row.cost === "" || row.cost === null || row.cost === undefined
          ? ""
          : String(row.cost),
      notes: row.notes?.trim() || "",
    }))
    .filter((row) => {
      return (
        row.interventionType ||
        row.interventionDate ||
        row.nextIntervention ||
        row.isRecurring ||
        row.recurrenceMonths ||
        row.cost ||
        row.notes
      );
    });

  for (const row of cleanedRows) {
    if (!row.interventionType) {
      return NextResponse.json(
        { error: "Ogni riga manutenzione compilata deve avere il tipo intervento" },
        { status: 400 }
      );
    }

    if (!row.interventionDate) {
      return NextResponse.json(
        { error: "Ogni riga manutenzione compilata deve avere la data intervento" },
        { status: 400 }
      );
    }

    if (row.cost !== "") {
      const parsed = Number(row.cost);
      if (Number.isNaN(parsed) || parsed < 0) {
        return NextResponse.json(
          { error: "Il costo intervento deve essere un numero maggiore o uguale a zero" },
          { status: 400 }
        );
      }
    }

    if (row.isRecurring) {
      const parsedMonths = Number(row.recurrenceMonths);
      if (!Number.isInteger(parsedMonths) || parsedMonths <= 0) {
        return NextResponse.json(
          { error: "Le manutenzioni ricorrenti devono avere un numero di mesi maggiore di zero" },
          { status: 400 }
        );
      }

      if (!row.nextIntervention) {
        return NextResponse.json(
          { error: "Le manutenzioni ricorrenti devono avere una prossima scadenza pianificata" },
          { status: 400 }
        );
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    const equipment = await tx.equipment.findUnique({
      where: { id },
      select: { id: true, nameDescription: true },
    });

    if (!equipment) {
      throw new Error("Mezzo non trovato");
    }

    const existing = await tx.maintenance.findMany({
      where: { equipmentId: id },
      select: { id: true },
    });

    const incomingIds = new Set(cleanedRows.filter((r) => r.id).map((r) => r.id!));
    const idsToDelete = existing
      .map((x) => x.id)
      .filter((existingId) => !incomingIds.has(existingId));

    if (idsToDelete.length > 0) {
      await tx.maintenanceDocument.deleteMany({
        where: { maintenanceId: { in: idsToDelete } },
      });

      await tx.deadline.deleteMany({
        where: { maintenanceId: { in: idsToDelete } },
      });

      await tx.maintenance.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    for (const row of cleanedRows) {
      const data = {
        equipmentId: id,
        interventionType: row.interventionType,
        interventionDate: parseOptionalDate(row.interventionDate)!,
        nextIntervention: parseOptionalDate(row.nextIntervention),
        isRecurring: row.isRecurring,
        recurrenceMonths: row.isRecurring ? Number(row.recurrenceMonths) : null,
        cost: row.cost !== "" ? new Prisma.Decimal(Number(row.cost).toFixed(2)) : null,
        notes: row.notes || null,
        createdByUserId: appUser.id,
      };

      let savedMaintenance;

      if (row.id) {
        savedMaintenance = await tx.maintenance.update({
          where: { id: row.id },
          data,
        });
      } else {
        savedMaintenance = await tx.maintenance.create({
          data,
        });
      }

      if (savedMaintenance.nextIntervention) {
        const deadlineTitle = `Manutenzione ${equipment.nameDescription}`;
        const deadlineDescription = [
          `Tipo intervento: ${savedMaintenance.interventionType}`,
          savedMaintenance.isRecurring && savedMaintenance.recurrenceMonths
            ? `Ricorrente ogni ${savedMaintenance.recurrenceMonths} mesi`
            : null,
          savedMaintenance.notes ? `Note: ${savedMaintenance.notes}` : null,
        ]
          .filter(Boolean)
          .join(" | ") || null;

        await tx.deadline.upsert({
          where: { maintenanceId: savedMaintenance.id },
          update: {
            title: deadlineTitle,
            description: deadlineDescription,
            eventDate: savedMaintenance.nextIntervention,
            startTime: null,
            endTime: null,
            isAllDay: true,
            origin: DeadlineOrigin.MAINTENANCE,
            updatedByUserId: appUser.id,
            lastSource: SyncSource.GIGEST,
            lastModifiedAt: new Date(),
          },
          create: {
            title: deadlineTitle,
            description: deadlineDescription,
            eventDate: savedMaintenance.nextIntervention,
            startTime: null,
            endTime: null,
            isAllDay: true,
            origin: DeadlineOrigin.MAINTENANCE,
            maintenanceId: savedMaintenance.id,
            createdByUserId: appUser.id,
            updatedByUserId: appUser.id,
            lastSource: SyncSource.GIGEST,
            lastModifiedAt: new Date(),
          },
        });
      } else {
        await tx.deadline.deleteMany({
          where: { maintenanceId: savedMaintenance.id },
        });
      }
    }
  });

  return NextResponse.json({ success: true, savedRows: cleanedRows.length });
}
