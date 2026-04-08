import { DeadlineOrigin, SyncSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ScheduleEventKind = "DEADLINE" | "JOB_ORDER_END";

export type ScheduleEventRow = {
  id: string;
  title: string;
  description: string | null;
  eventDate: Date;
  startTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
  origin: DeadlineOrigin;
  originLabel: string;
  lastSource: SyncSource;
  maintenanceId: string | null;
  canEdit: boolean;
  canDelete: boolean;
  eventKind: ScheduleEventKind;
  linkedEquipment: {
    id: string;
    nameDescription: string;
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

function toDeadlineOriginLabel(origin: DeadlineOrigin) {
  return origin === DeadlineOrigin.MAINTENANCE ? "Manutenzione" : "Manuale";
}

export async function getScheduleEvents({
  from,
  to,
}: {
  from?: Date;
  to?: Date;
} = {}): Promise<ScheduleEventRow[]> {
  const [deadlines, jobOrders] = await Promise.all([
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
  ]);

  const deadlineRows: ScheduleEventRow[] = deadlines.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    eventDate: row.eventDate,
    startTime: row.startTime,
    endTime: row.endTime,
    isAllDay: row.isAllDay,
    origin: row.origin,
    originLabel: toDeadlineOriginLabel(row.origin),
    lastSource: row.lastSource,
    maintenanceId: row.maintenanceId,
    canEdit: row.origin === DeadlineOrigin.MANUAL,
    canDelete: row.origin === DeadlineOrigin.MANUAL,
    eventKind: "DEADLINE",
    linkedEquipment: row.maintenance?.equipment
      ? {
          id: row.maintenance.equipment.id,
          nameDescription: row.maintenance.equipment.nameDescription,
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
      origin: DeadlineOrigin.MANUAL,
      originLabel: "Fine commessa",
      lastSource: SyncSource.GIGEST,
      maintenanceId: null,
      canEdit: false,
      canDelete: false,
      eventKind: "JOB_ORDER_END",
      linkedEquipment: null,
      linkedJobOrder: {
        id: jobOrder.id,
        name: jobOrder.name,
        type: jobOrder.type,
      },
    }));

  return [...deadlineRows, ...jobOrderRows].sort((a, b) => {
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
