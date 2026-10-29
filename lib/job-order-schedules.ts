import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { scheduleChangeSchema, type SchedulePlan, type ScheduleSection, type ScheduleJob } from "@/lib/job-order-schedule-data";

export class ScheduleError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
const serialize = (jobOrderId: string, plan: { sections: Prisma.JsonValue; version: number; updatedAt: Date; updatedBy: string } | null): SchedulePlan => ({
  jobOrderId, version: plan?.version ?? 0, sections: (plan?.sections ?? []) as ScheduleSection[],
  updatedAt: plan?.updatedAt.toISOString() ?? null, updatedBy: plan?.updatedBy ?? null,
});
export async function getJobOrderSchedule(jobOrderId: string) {
  const job = await prisma.jobOrder.findUnique({ where: { id: jobOrderId }, select: { id: true, schedule: true } });
  if (!job) throw new ScheduleError("Commessa non trovata", 404);
  return serialize(jobOrderId, job.schedule);
}
export async function saveJobOrderSchedule(jobOrderId: string, input: unknown, actor: string) {
  const change = scheduleChangeSchema.parse(input);
  if (!await prisma.jobOrder.findUnique({ where: { id: jobOrderId }, select: { id: true } })) throw new ScheduleError("Commessa non trovata", 404);
  const sections = change.sections as unknown as Prisma.InputJsonValue;
  try {
    const plan = change.version === 0
      ? await prisma.jobOrderSchedule.create({ data: { jobOrderId, sections, updatedBy: actor } })
      : await prisma.jobOrderSchedule.update({ where: { jobOrderId, version: change.version }, data: { sections, updatedBy: actor, version: { increment: 1 } } });
    return serialize(jobOrderId, plan);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2025"].includes(e.code)) throw new ScheduleError("La pianificazione è stata modificata da un altro utente. Ricarica il piano prima di salvare.");
    throw e;
  }
}
export async function getDashboardSchedules(): Promise<ScheduleJob[]> {
  const jobs = await prisma.jobOrder.findMany({ where: { type: { in: ["SITE", "OTHER"] } }, orderBy: [{ name: "asc" }],
    select: { id: true, name: true, status: true, schedule: { select: { sections: true } } } });
  return jobs.map(job => ({ id: job.id, name: job.name, status: job.status, sections: (job.schedule?.sections ?? []) as ScheduleSection[] }));
}
