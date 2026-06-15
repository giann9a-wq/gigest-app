import { NextRequest, NextResponse } from "next/server";
import { DeadlineOrigin, Prisma, SyncSource } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";

type MaintenanceCreateInput = {
  equipmentId?: string;
  interventionType?: string;
  interventionDate?: string;
  nextIntervention?: string;
  isRecurring?: boolean;
  recurrenceMonths?: string | number | null;
  cost?: string | number | null;
  notes?: string;
};

function toInputDate(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function parseOptionalDate(value?: string | null) {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

export async function GET() {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const [equipment, rows] = await Promise.all([
    prisma.equipment.findMany({
      orderBy: { nameDescription: "asc" },
      select: { id: true, nameDescription: true, type: true, status: true },
    }),
    prisma.maintenance.findMany({
      orderBy: [{ interventionDate: "desc" }, { createdAt: "desc" }],
      include: {
        equipment: { select: { id: true, nameDescription: true, type: true } },
        documents: { orderBy: { createdAt: "desc" }, select: { id: true, fileName: true } },
      },
    }),
  ]);

  return NextResponse.json({
    equipment,
    rows: rows.map((row) => ({
      id: row.id,
      equipmentId: row.equipmentId,
      equipmentName: row.equipment.nameDescription,
      equipmentType: row.equipment.type,
      interventionType: row.interventionType,
      interventionDate: toInputDate(row.interventionDate),
      nextIntervention: toInputDate(row.nextIntervention),
      isRecurring: row.isRecurring,
      recurrenceMonths: row.recurrenceMonths ?? "",
      cost: row.cost !== null ? Number(row.cost) : "",
      notes: row.notes ?? "",
      documents: row.documents,
    })),
  });
}

export async function POST(request: NextRequest) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const body = (await request.json()) as MaintenanceCreateInput;
  const equipmentId = body.equipmentId?.trim() || "";
  const interventionType = body.interventionType?.trim() || "";
  const interventionDate = body.interventionDate || "";
  const nextIntervention = body.nextIntervention || "";
  const isRecurring = body.isRecurring === true;
  const recurrenceMonths =
    body.recurrenceMonths === "" || body.recurrenceMonths === null || body.recurrenceMonths === undefined
      ? ""
      : String(body.recurrenceMonths);
  const cost =
    body.cost === "" || body.cost === null || body.cost === undefined ? "" : String(body.cost);
  const notes = body.notes?.trim() || "";

  if (!equipmentId) return NextResponse.json({ error: "Seleziona un mezzo o attrezzatura" }, { status: 400 });
  if (!interventionType) return NextResponse.json({ error: "Il tipo intervento e obbligatorio" }, { status: 400 });
  if (!interventionDate) return NextResponse.json({ error: "La data intervento e obbligatoria" }, { status: 400 });

  const parsedInterventionDate = parseOptionalDate(interventionDate);
  const parsedNextIntervention = parseOptionalDate(nextIntervention);

  if (!parsedInterventionDate || Number.isNaN(parsedInterventionDate.getTime())) {
    return NextResponse.json({ error: "Data intervento non valida" }, { status: 400 });
  }

  if (cost !== "") {
    const parsedCost = Number(cost);
    if (Number.isNaN(parsedCost) || parsedCost < 0) {
      return NextResponse.json({ error: "Il costo deve essere maggiore o uguale a zero" }, { status: 400 });
    }
  }

  if (isRecurring) {
    const parsedMonths = Number(recurrenceMonths);
    if (!Number.isInteger(parsedMonths) || parsedMonths <= 0) {
      return NextResponse.json({ error: "Indica i mesi di ricorrenza" }, { status: 400 });
    }
    if (!nextIntervention) {
      return NextResponse.json({ error: "Le manutenzioni ricorrenti devono avere una prossima scadenza" }, { status: 400 });
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const equipment = await tx.equipment.findUnique({
      where: { id: equipmentId },
      select: { id: true, nameDescription: true },
    });

    if (!equipment) {
      throw new Error("Mezzo non trovato");
    }

    const savedMaintenance = await tx.maintenance.create({
      data: {
        equipmentId,
        interventionType,
        interventionDate: parsedInterventionDate,
        nextIntervention: parsedNextIntervention,
        isRecurring,
        recurrenceMonths: isRecurring ? Number(recurrenceMonths) : null,
        cost: cost !== "" ? new Prisma.Decimal(Number(cost).toFixed(2)) : null,
        notes: notes || null,
        createdByUserId: appUser.id,
      },
    });

    if (savedMaintenance.nextIntervention) {
      const deadlineDescription =
        [
          `Tipo intervento: ${savedMaintenance.interventionType}`,
          savedMaintenance.isRecurring && savedMaintenance.recurrenceMonths
            ? `Ricorrente ogni ${savedMaintenance.recurrenceMonths} mesi`
            : null,
          savedMaintenance.notes ? `Note: ${savedMaintenance.notes}` : null,
        ]
          .filter(Boolean)
          .join(" | ") || null;

      await tx.deadline.create({
        data: {
          title: `Manutenzione ${equipment.nameDescription}`,
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
    }

    return savedMaintenance;
  });

  return NextResponse.json({ success: true, id: created.id });
}
