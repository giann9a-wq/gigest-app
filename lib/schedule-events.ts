import { DeadlineOrigin, SyncSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ScheduleEventKind = "DEADLINE" | "JOB_ORDER_END" | "TRAINING_DATE";

export type ScheduleEventRow = {
  id: string;
  title: string;
  description: string | null;
  eventDate: Date;
  startTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
  recurrenceRule: string | null;
  origin: DeadlineOrigin;
  originLabel: string;
  lastSource: SyncSource;
  maintenanceId: string | null;
  trainingId: string | null;
  canEdit: boolean;
  canDelete: boolean;
  eventKind: ScheduleEventKind;
  linkedEquipment: {
    id: string;
    nameDescription: string;
  } | null;
  linkedPerson: {
    id: string;
    fullName: string;
  } | null;
  linkedJobOrder: {
    id: string;
    name: string;
    type: string;
  } | null;
};

function getDayEnd(date: Date) {
  return new Date(`${date.toISOString().slice(0, 10)}T23:59:59.999Z`);
}

function getTodayStart() {
  return new Date(new Date().toISOString().slice(0, 10));
}

function toDeadlineOriginLabel(origin: DeadlineOrigin) {
  if (origin === DeadlineOrigin.MAINTENANCE) return "Manutenzione";
  if (origin === DeadlineOrigin.TRAINING) return "Formazione";
  return "Manuale";
}

export async function getScheduleEvents({
  from,
  to,
}: {
  from?: Date;
  to?: Date;
} = {}): Promise<ScheduleEventRow[]> {
  const trainingDateFrom = from ?? getTodayStart();

  const [deadlines, jobOrders, trainings] = await Promise.all([
    prisma.deadline.findMany({
      where: {
        eventDate: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: getDayEnd(to) } : {}),
        },
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
    }),
    prisma.jobOrder.findMany({
      where: {
        endDate: {
          not: null,
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: getDayEnd(to) } : {}),
        },
      },
      select: {
        id: true,
        name: true,
        type: true,
        endDate: true,
        description: true,
      },
    }),
    prisma.training.findMany({
      where: {
        trainingDate: {
          gte: trainingDateFrom,
          ...(to ? { lte: getDayEnd(to) } : {}),
        },
      },
      include: {
        person: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    }),
  ]);

  const deadlineRows: ScheduleEventRow[] = deadlines.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    eventDate: row.eventDate,
    startTime: row.startTime,
    endTime: row.endTime,
    isAllDay: row.isAllDay,
    recurrenceRule: row.recurrenceRule,
    origin: row.origin,
    originLabel: toDeadlineOriginLabel(row.origin),
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
  }));

  const jobOrderRows: ScheduleEventRow[] = jobOrders
    .filter((jobOrder) => jobOrder.endDate)
    .map((jobOrder) => ({
      id: `job-order-end:${jobOrder.id}`,
      title: `Fine commessa: ${jobOrder.name}`,
      description: jobOrder.description ?? null,
      eventDate: jobOrder.endDate as Date,
      startTime: null,
      endTime: null,
      isAllDay: true,
      recurrenceRule: null,
      origin: DeadlineOrigin.MANUAL,
      originLabel: "Fine commessa",
      lastSource: SyncSource.GIGEST,
      maintenanceId: null,
      trainingId: null,
      canEdit: false,
      canDelete: false,
      eventKind: "JOB_ORDER_END",
      linkedEquipment: null,
      linkedPerson: null,
      linkedJobOrder: {
        id: jobOrder.id,
        name: jobOrder.name,
        type: jobOrder.type,
      },
    }));

  const trainingDateRows: ScheduleEventRow[] = trainings.map((training) => ({
    id: `training-date:${training.id}`,
    title: `Corso formazione: ${training.course}`,
    description:
      [
        training.description ? `Descrizione: ${training.description}` : null,
        training.mandatory ? "Obbligatorio: si" : "Obbligatorio: no",
        training.expiresAt ? `Scadenza: ${training.expiresAt.toLocaleDateString("it-IT")}` : null,
        training.isRecurring && training.recurrenceMonths
          ? `Ricorrente ogni ${training.recurrenceMonths} mesi`
          : null,
      ]
        .filter(Boolean)
        .join(" | ") || null,
    eventDate: training.trainingDate,
    startTime: null,
    endTime: null,
    isAllDay: true,
    recurrenceRule: null,
    origin: DeadlineOrigin.TRAINING,
    originLabel: "Data corso",
    lastSource: SyncSource.GIGEST,
    maintenanceId: null,
    trainingId: training.id,
    canEdit: false,
    canDelete: false,
    eventKind: "TRAINING_DATE",
    linkedEquipment: null,
    linkedPerson: {
      id: training.person.id,
      fullName: training.person.fullName,
    },
    linkedJobOrder: null,
  }));

  return [...deadlineRows, ...jobOrderRows, ...trainingDateRows].sort((a, b) => {
    const byDate = a.eventDate.getTime() - b.eventDate.getTime();
    if (byDate !== 0) return byDate;

    if (a.isAllDay !== b.isAllDay) {
      return a.isAllDay ? -1 : 1;
    }

    const byStartTime = (a.startTime ?? "").localeCompare(b.startTime ?? "");
    if (byStartTime !== 0) return byStartTime;

    return a.title.localeCompare(b.title, "it", { sensitivity: "base" });
  });
}
