import { z } from "zod";

export const scheduleTypes = { ACTIVITY: "Attività", MILESTONE: "Milestone", INTERMEDIATE_MILESTONE: "Milestone intermedia" } as const;
export const scheduleStatuses = { PLANNED: "Pianificata", IN_PROGRESS: "In corso", DONE: "Completata" } as const;
const daySchema = z.string().refine(value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Inserisci una data valida");
const idSchema = z.string().min(1).max(100);
export const scheduleEntrySchema = z.object({
  id: idSchema,
  type: z.enum(["ACTIVITY", "MILESTONE", "INTERMEDIATE_MILESTONE"]),
  title: z.string().trim().min(1, "Il titolo di ogni attività o milestone è obbligatorio").max(200),
  description: z.string().trim().max(4000).default(""),
  startDate: daySchema, endDate: daySchema,
  status: z.enum(["PLANNED", "IN_PROGRESS", "DONE"]).default("PLANNED"),
}).superRefine((entry, ctx) => {
  if (entry.endDate < entry.startDate) ctx.addIssue({ code: "custom", message: `La fine di “${entry.title}” precede l'inizio` });
  if (entry.type !== "ACTIVITY" && entry.endDate !== entry.startDate) ctx.addIssue({ code: "custom", message: "Le milestone devono avere una sola data" });
});
export const scheduleSectionSchema = z.object({
  id: idSchema, title: z.string().trim().min(1, "Il titolo della sezione è obbligatorio").max(200),
  description: z.string().trim().max(4000).default(""), entries: z.array(scheduleEntrySchema).max(500),
});
export const scheduleChangeSchema = z.object({
  version: z.number().int().min(0), sections: z.array(scheduleSectionSchema).max(50),
}).superRefine((plan, ctx) => {
  const ids = plan.sections.flatMap(section => [section.id, ...section.entries.map(entry => entry.id)]);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "La pianificazione contiene identificativi duplicati" });
  if (plan.sections.reduce((count, section) => count + section.entries.length, 0) > 500) ctx.addIssue({ code: "custom", message: "Puoi pianificare al massimo 500 attività e milestone per commessa" });
});
export type ScheduleEntry = z.infer<typeof scheduleEntrySchema>;
export type ScheduleSection = z.infer<typeof scheduleSectionSchema>;
export type SchedulePlan = { jobOrderId: string; version: number; sections: ScheduleSection[]; updatedAt: string | null; updatedBy: string | null };
export type ScheduleJob = { id: string; name: string; status: string; sections: ScheduleSection[] };
export type ScheduleRange = { start: string; end: string };

export function scheduleRange(sections: ScheduleSection[]): ScheduleRange | null {
  const entries = sections.flatMap(section => section.entries);
  if (!entries.length) return null;
  return { start: entries.reduce((date, entry) => entry.startDate < date ? entry.startDate : date, entries[0].startDate),
    end: entries.reduce((date, entry) => entry.endDate > date ? entry.endDate : date, entries[0].endDate) };
}
export const scheduleDay = (date: string) => Date.parse(`${date}T00:00:00.000Z`);
export function addScheduleDays(date: string, count: number) { return new Date(scheduleDay(date) + count * 86400000).toISOString().slice(0, 10); }
export function schedulePosition(range: ScheduleRange, view: ScheduleRange) {
  if (range.end < view.start || range.start > view.end) return null;
  const days = (scheduleDay(view.end) - scheduleDay(view.start)) / 86400000 + 1;
  const left = Math.max(0, (scheduleDay(range.start) - scheduleDay(view.start)) / 86400000);
  const right = Math.min(days, (scheduleDay(range.end) - scheduleDay(view.start)) / 86400000 + 1);
  return { left: left / days * 100, width: (right - left) / days * 100 };
}
export const formatScheduleDate = (date: string) => new Date(`${date}T00:00:00.000Z`).toLocaleDateString("it-IT", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });

export function addScheduleMonths(date: string, months: number) {
  const source = new Date(scheduleDay(date));
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(source.getUTCDate(), lastDay));
  return target.toISOString().slice(0, 10);
}
export const initialScheduleWindow = (today: string): ScheduleRange => ({ start: addScheduleDays(today, -15), end: addScheduleMonths(today, 3) });
export function scheduleOverlaps(sections: ScheduleSection[], view: ScheduleRange) {
  return sections.some(section => section.entries.some(entry => entry.startDate <= view.end && entry.endDate >= view.start));
}
