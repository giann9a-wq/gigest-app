import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { calculateSimulation, defaultSimulation, simulationSchema } from "../lib/discount-calculator";
import { serializeSimulation, simulationData, simulationInclude } from "../lib/discount-simulation-store";

const db = new PrismaClient();
const ids: string[] = [];
async function main() {
  try {
    const input = simulationSchema.parse({ ...defaultSimulation(), name: `Test temporaneo ${Date.now()}`, advances: [{ date: "2026-10-01", amount: 50000 }, { date: "2027-11-01", amount: 50000 }] });
    const created = await db.discountSimulation.create({ data: { ...simulationData(input), createdById: "discount-integration-test" }, include: simulationInclude }); ids.push(created.id);
    const reopened = serializeSimulation(await db.discountSimulation.findUniqueOrThrow({ where: { id: created.id }, include: simulationInclude }));
    assert.deepEqual(simulationSchema.parse(reopened), input);
    assert.deepEqual(calculateSimulation(reopened), calculateSimulation(input));
    const changed = simulationSchema.parse({ ...reopened, advances: [{ date: "2026-10-01", amount: 50000 }, { date: "2027-06-01", amount: 50000 }] });
    const data = simulationData(changed);
    await db.discountSimulation.update({ where: { id: created.id }, data: { ...data, advances: { deleteMany: {}, ...data.advances } } });
    const updated = serializeSimulation(await db.discountSimulation.findUniqueOrThrow({ where: { id: created.id }, include: simulationInclude }));
    assert.equal(updated.createdAt, reopened.createdAt); assert.ok(updated.updatedAt >= reopened.updatedAt);
    assert.equal(calculateSimulation(updated).guarantee, calculateSimulation(input).guarantee);
    assert.notEqual(calculateSimulation(updated).interest, calculateSimulation(input).interest);
    assert.equal(updated.advances.length, 2);
    const copy = await db.discountSimulation.create({ data: { ...simulationData({ ...changed, name: `${input.name} (copia)` }), createdById: "discount-integration-test" }, include: simulationInclude }); ids.push(copy.id);
    assert.notEqual(copy.id, created.id); assert.equal(copy.advances.length, 2);
    await db.discountSimulation.delete({ where: { id: created.id } });
    assert.equal(await db.discountAdvance.count({ where: { simulationId: created.id } }), 0);
    assert.equal(await db.discountSimulation.findUnique({ where: { id: created.id } }), null);
    console.log("PASS: salvataggio, riapertura, aggiornamento atomico, duplicazione, eliminazione e cascade sul database.");
  } finally {
    await db.discountSimulation.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
