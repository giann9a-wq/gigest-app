import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { addScheduleDays, addScheduleMonths, initialScheduleWindow, scheduleOverlaps, scheduleChangeSchema, schedulePosition, scheduleRange, type ScheduleSection } from "../lib/job-order-schedule-data";

export const samplePlan: ScheduleSection[] = [
  { id: "structure", title: "Strutture", description: "Opere strutturali", entries: [
    { id: "foundation", type: "ACTIVITY", title: "Fondazioni", description: "Scavo e getto", startDate: "2026-11-01", endDate: "2026-11-15", status: "IN_PROGRESS" },
    { id: "check", type: "INTERMEDIATE_MILESTONE", title: "Verifica armature", description: "Controllo prima del getto", startDate: "2026-11-06", endDate: "2026-11-06", status: "PLANNED" },
    { id: "delivery", type: "MILESTONE", title: "Consegna", description: "Verbale di consegna", startDate: "2026-12-12", endDate: "2026-12-12", status: "PLANNED" },
  ] },
  { id: "finishes", title: "Finiture", description: "Impianti e finiture", entries: [
    { id: "floors", type: "ACTIVITY", title: "Pavimenti", description: "Posa pavimenti", startDate: "2026-11-20", endDate: "2026-12-05", status: "PLANNED" },
  ] },
];

async function main() {
  const valid = { version: 0, sections: samplePlan };
  assert.equal(scheduleChangeSchema.safeParse(valid).success, true);
  assert.deepEqual(scheduleRange(samplePlan), { start: "2026-11-01", end: "2026-12-12" });
  assert.equal(scheduleRange([]), null);
  assert.equal(scheduleRange([{ ...samplePlan[0], entries: [] }]), null);
  const changeEntry = (change: object) => ({ ...valid, sections: [{ ...samplePlan[0], entries: [{ ...samplePlan[0].entries[0], ...change }] }] });
  assert.equal(scheduleChangeSchema.safeParse(changeEntry({ startDate: "2026-02-30" })).success, false);
  assert.equal(scheduleChangeSchema.safeParse(changeEntry({ endDate: "2026-10-01" })).success, false);
  assert.equal(scheduleChangeSchema.safeParse(changeEntry({ type: "MILESTONE" })).success, false);
  assert.equal(scheduleChangeSchema.safeParse(changeEntry({ title: " " })).success, false);
  assert.equal(scheduleChangeSchema.safeParse({ ...valid, sections: [samplePlan[0], samplePlan[0]] }).success, false);
  assert.equal(scheduleChangeSchema.safeParse(changeEntry({ startDate: "2028-02-29", endDate: "2028-02-29" })).success, true);
  assert.equal(addScheduleDays("2026-03-28", 2), "2026-03-30");
  assert.equal(addScheduleMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addScheduleMonths("2028-01-31", 1), "2028-02-29");
  assert.deepEqual(initialScheduleWindow("2026-10-29"), { start: "2026-10-14", end: "2027-01-29" });
  assert.equal(scheduleOverlaps([], initialScheduleWindow("2026-10-29")), false);
  assert.equal(scheduleOverlaps(samplePlan, { start: "2026-11-16", end: "2026-11-19" }), false);
  assert.equal(scheduleOverlaps(samplePlan, { start: "2026-12-12", end: "2026-12-12" }), true);
  assert.deepEqual(schedulePosition({ start: "2026-11-01", end: "2026-11-01" }, { start: "2026-11-01", end: "2026-11-01" }), { left: 0, width: 100 });
  assert.equal(schedulePosition({ start: "2026-10-01", end: "2026-10-02" }, { start: "2026-11-01", end: "2026-11-30" }), null);
  assert.deepEqual(schedulePosition({ start: "2026-10-01", end: "2026-12-31" }, { start: "2026-11-01", end: "2026-11-30" }), { left: 0, width: 100 });
  console.log("PASS date, durata inclusiva, milestone, ordinamento dati e validazione piano.");
  process.loadEnvFile(".env.production.local");
  const original = process.env.DATABASE_URL!; const schema = `gantt_test_${Date.now()}`;
  assert.match(schema, /^gantt_test_\d+$/); const admin = new PrismaClient({ datasourceUrl: original });
  let db: PrismaClient | undefined;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const url = new URL(original); url.searchParams.set("schema", schema); process.env.DATABASE_URL = url.toString();
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: process.env, stdio: "pipe" });
    console.log("Migrazioni Gantt verificate nello schema temporaneo.");
    const { prisma } = await import("../lib/prisma"); db = prisma;
    const planning = await import("../lib/job-order-schedules");
    const actor = `${schema}@example.invalid`;
    const user = await db.user.create({ data: { email: actor, role: "OPERATOR", status: "ACTIVE" } });
    const job = await db.jobOrder.create({ data: { name: "Cantiere Gantt UI", type: "SITE", startDate: new Date("2026-11-01"), endDate: new Date("2026-12-31"), budgetExpectedRevenue: 500000 } });
    const other = await db.jobOrder.create({ data: { name: "Altro cantiere pianificato", type: "SITE", status: "SUSPENDED" } });
    assert.equal((await planning.getJobOrderSchedule(job.id)).version, 0);
    let plan = await planning.saveJobOrderSchedule(job.id, valid, actor);
    assert.equal(plan.version, 1); assert.deepEqual(plan.sections, samplePlan); assert.equal(plan.updatedBy, actor);
    await assert.rejects(planning.saveJobOrderSchedule(job.id, valid, actor), /altro utente/);
    const competing = await Promise.allSettled([
      planning.saveJobOrderSchedule(job.id, { version: 1, sections: [{ ...samplePlan[0], title: "Versione A" }] }, actor),
      planning.saveJobOrderSchedule(job.id, { version: 1, sections: [{ ...samplePlan[0], title: "Versione B" }] }, actor),
    ]);
    assert.equal(competing.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(competing.filter(r => r.status === "rejected").length, 1);
    plan = await planning.getJobOrderSchedule(job.id); assert.equal(plan.version, 2);
    const first = await Promise.allSettled([planning.saveJobOrderSchedule(other.id, valid, actor), planning.saveJobOrderSchedule(other.id, valid, actor)]);
    assert.equal(first.filter(r => r.status === "fulfilled").length, 1);
    await assert.rejects(planning.saveJobOrderSchedule("missing-job", valid, actor), /non trovata/);
    const before = await db.jobOrder.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(Number(before.budgetExpectedRevenue), 500000);
    assert.equal(before.startDate!.toISOString().slice(0, 10), "2026-11-01");
    assert.equal(before.endDate!.toISOString().slice(0, 10), "2026-12-31");
    await db.jobOrder.update({ where: { id: job.id }, data: { description: "Modifica anagrafica indipendente" } });
    assert.equal((await planning.getJobOrderSchedule(job.id)).version, 2);
    plan = await planning.saveJobOrderSchedule(job.id, { version: 2, sections: [] }, actor);
    assert.equal(plan.version, 3); assert.equal(scheduleRange(plan.sections), null);
    const dashboard = await planning.getDashboardSchedules();
    assert.equal(dashboard.length, 2);
    assert.deepEqual(scheduleRange(dashboard.find(j => j.id === other.id)!.sections), { start: "2026-11-01", end: "2026-12-12" });
    console.log("PASS DB: sezioni e milestone persistite, conflitti simultanei, dati anagrafici/budget indipendenti e sintesi dashboard.");
    if (process.env.TEST_GANTT_UI === "1") {
      const { verifyGanttUI } = await import("./verify-gantt-ui");
      await verifyGanttUI({ databaseUrl: process.env.DATABASE_URL!, actor, userId: user.id, jobOrderId: job.id, db });
    }
  } finally {
    await db?.$disconnect(); await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect(); process.env.DATABASE_URL = original;
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Test Gantt fallito"); process.exitCode = 1; });
