import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { saleSchema, unitSchema, date } from "../lib/property-sales-validation";

// Use a disposable PostgreSQL schema, never real job orders or sales.
async function main() {
  process.loadEnvFile(".env");
  const originalUrl = process.env.DATABASE_URL!;
  const schema = `sales_test_${Date.now()}`;
  assert.match(schema, /^sales_test_\d+$/);
  const adminDb = new PrismaClient({ datasourceUrl: originalUrl });
  const testUrl = new URL(originalUrl); testUrl.searchParams.set("schema", schema);
  let db: PrismaClient | undefined;
  try {
    await adminDb.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    process.env.DATABASE_URL = testUrl.toString();
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: process.env, stdio: "pipe" });
    console.log("Migrazioni verificate; test vendite, acconti e collegamento clienti…");
    const sales = await import("../lib/property-sales");
    const { prisma } = await import("../lib/prisma"); db = prisma;
    const { getScheduleEvents } = await import("../lib/schedule-events");
    const user = await db.user.create({ data: { email: `${schema}@example.invalid`, role: "ADMIN", status: "ACTIVE" } });
    const job = await db.jobOrder.create({ data: { name: "Test listino", type: "SITE", description: "Da preservare" } });
    await sales.setSalesPriceListEnabled(job.id, true);
    assert.equal((await db.jobOrder.findUniqueOrThrow({ where: { id: job.id } })).description, "Da preservare");
    const disabledJob = await db.jobOrder.create({ data: { name: "Senza listino", type: "SITE" } });
    await assert.rejects(sales.saveUnit(disabledJob.id, { code: "A1", listPrice: 100 }), /Abilita/);
    const a = await sales.saveUnit(job.id, { code: "A1", listPrice: "300000.00", description: "Trilocale" });
    const b = await sales.saveUnit(job.id, { code: "A2", listPrice: "250000,00" });
    await assert.rejects(sales.saveUnit(job.id, { code: "A1", listPrice: 100 }));
    assert.equal(unitSchema.safeParse({ code: "", listPrice: 0 }).success, false);
    assert.equal(unitSchema.safeParse({ code: "A", listPrice: "12.345" }).success, false);
    assert.equal(date.safeParse("2026-02-30").success, false);
    assert.equal(saleSchema.safeParse({ unitId: a.id, customerName: "Cliente", agreedPrice: 50, saleDate: "2026-10-13", installments: [{ description: "Rata", amount: 51, dueDate: "2026-10-13" }] }).success, false);
    const payload = { unitId: a.id, customerName: "Cliente Test", agreedPrice: 280000, saleDate: "2026-10-13",
      installments: Array.from({ length: 4 }, (_, i) => ({ description: `Acconto ${i + 1}`, amount: 50000, dueDate: `2026-${String(9 + i).padStart(2, "0")}-13` })) };
    const sale = await sales.saveSale(payload, user.id);
    assert.ok(sale.customerRecordId);
    assert.equal((await db.jobOrder.findUniqueOrThrow({ where: { id: job.id } })).clientDossierEnabled, true);
    assert.equal((await db.jobOrderRecord.findUniqueOrThrow({ where: { id: sale.customerRecordId! } })).title, "Cliente Test");
    await assert.rejects(sales.setSalesPriceListEnabled(job.id, false), /contiene vendite/);
    await assert.rejects(sales.saveSale(payload, user.id), /già venduto/);
    await assert.rejects(sales.deleteUnit(job.id, a.id), /venduto/);
    let view = (await sales.getSalesView(job.id))!;
    assert.equal(view.listTotal, 550000); assert.equal(view.soldTotal, 280000); assert.equal(view.remainingListTotal, 250000);
    let saved = view.units.find(row => row.id === a.id)!.sale!;
    assert.equal(saved.installments.length, 4); assert.equal(await db.deadline.count(), 4);
    assert.equal(await db.jobOrderAdvance.count(), 0);
    const events = await getScheduleEvents();
    assert.equal(events.length, 4); assert.equal(events[0].originLabel, "Acconto vendita");
    assert.equal(events[0].linkedJobOrder?.id, job.id); assert.equal(events[0].canEdit, false);
    const firstId = saved.installments[0].id;
    const approved = await Promise.all([sales.approveInstallment(firstId, user.id), sales.approveInstallment(firstId, user.id)]);
    assert.equal(approved[0], approved[1]); assert.equal(await db.jobOrderAdvance.count(), 1);
    assert.equal(Number((await db.jobOrder.findUniqueOrThrow({ where: { id: job.id } })).actualRevenue), 50000);
    assert.equal((await getScheduleEvents()).length, 3);
    await assert.rejects(sales.deleteSale(sale.id), /approvati/);
    await assert.rejects(sales.saveSale({ ...payload, id: sale.id, updatedAt: saved.updatedAt }, user.id), /ricarica/);
    view = (await sales.getSalesView(job.id))!; saved = view.units.find(row => row.id === a.id)!.sale!;
    await assert.rejects(sales.saveSale({ ...saved, unitId: a.id, installments: saved.installments.slice(1) }, user.id), /approvati/);
    const revised = { ...saved, unitId: a.id, installments: saved.installments.map((row, i) => i === 1 ? { ...row, amount: 60000, dueDate: "2027-01-15" } : row) };
    await sales.saveSale(revised, user.id);
    const changed = await db.salesInstallment.findUniqueOrThrow({ where: { id: saved.installments[1].id }, include: { deadline: true } });
    assert.equal(Number(changed.amount), 60000); assert.equal(changed.deadline.eventDate.toISOString().slice(0, 10), "2027-01-15");
    // Correct an approved date without recreating the advance or losing approval.
    const before = await db.salesInstallment.findUniqueOrThrow({ where: { id: firstId }, include: { advance: true } });
    const refreshed = (await sales.getSalesView(job.id))!.units.find(row => row.id === a.id)!.sale!;
    const rescheduled = { ...refreshed, unitId: a.id, installments: refreshed.installments.map(row => row.id === firstId ? { ...row, dueDate: "2027-02-14" } : row) };
    await sales.saveSale(rescheduled, user.id);
    const after = await db.salesInstallment.findUniqueOrThrow({ where: { id: firstId }, include: { advance: true, deadline: true } });
    assert.equal(after.dueDate.toISOString().slice(0, 10), "2027-02-14");
    assert.equal(after.advance!.advanceDate.toISOString().slice(0, 10), "2027-02-14");
    assert.equal(after.deadline.eventDate.toISOString().slice(0, 10), "2027-02-14");
    assert.equal(after.advanceId, before.advanceId); assert.equal(after.deadlineId, before.deadlineId);
    assert.equal(after.approvedAt!.getTime(), before.approvedAt!.getTime()); assert.equal(after.approvedByUserId, before.approvedByUserId);
    assert.equal(after.advance!.amount.toString(), before.advance!.amount.toString());
    assert.equal(after.advance!.description, before.advance!.description); assert.equal(after.advance!.isActive, true);
    assert.equal(await db.jobOrderAdvance.count(), 1); assert.equal(await db.deadline.count(), 4);
    assert.equal(await sales.approveInstallment(firstId, user.id), before.advanceId);
    assert.equal((await getScheduleEvents()).length, 3);
    assert.equal(Number((await db.jobOrder.findUniqueOrThrow({ where: { id: job.id } })).actualRevenue), 50000);
    await assert.rejects(sales.saveSale(rescheduled, user.id), /ricarica/);
    const latest = (await sales.getSalesView(job.id))!.units.find(row => row.id === a.id)!.sale!;
    await assert.rejects(sales.saveSale({ ...latest, unitId: a.id, installments: latest.installments.map(row => row.id === firstId ? { ...row, amount: 55000, dueDate: "2027-03-01" } : row) }, user.id), /acconti approvati/);
    assert.equal((await db.jobOrderAdvance.findUniqueOrThrow({ where: { id: before.advanceId! } })).advanceDate.toISOString().slice(0, 10), "2027-02-14");
    await db.jobOrderAdvance.update({ where: { id: before.advanceId! }, data: { isActive: false, disabledReason: "Fatturato", disabledAt: new Date() } });
    const disabledBefore = await db.jobOrderAdvance.findUniqueOrThrow({ where: { id: before.advanceId! } });
    await sales.saveSale({ ...latest, unitId: a.id, installments: latest.installments.map(row => row.id === firstId ? { ...row, dueDate: "2027-03-01" } : row) }, user.id);
    const disabledAfter = await db.jobOrderAdvance.findUniqueOrThrow({ where: { id: before.advanceId! } });
    assert.equal(disabledAfter.advanceDate.toISOString().slice(0, 10), "2027-03-01");
    assert.equal(disabledAfter.isActive, false); assert.equal(disabledAfter.disabledReason, "Fatturato");
    assert.equal(disabledAfter.disabledAt!.getTime(), disabledBefore.disabledAt!.getTime());
    assert.equal(await db.jobOrderAdvance.count(), 1);
    const noAdvances = await sales.saveSale({ unitId: b.id, customerName: "Senza acconti", agreedPrice: 240000, saleDate: "2026-10-13" }, user.id);
    assert.equal((await sales.getSalesView(job.id))!.remainingListTotal, 0);
    await sales.deleteSale(noAdvances.id);
    const cancellable = await sales.saveSale({ unitId: b.id, customerName: "Da annullare", agreedPrice: 240000, saleDate: "2026-10-13", installments: [{ description: "Rata", amount: 50000, dueDate: "2027-01-01" }] }, user.id);
    await sales.deleteSale(cancellable.id); assert.equal(await db.deadline.count(), 4);
    await assert.rejects(sales.deleteUnit(job.id, b.id), /fascicolo/);
    // Recover the same customer for a second unit rather than asking for the name again.
    const beforeCustomers = await db.jobOrderRecord.count({ where: { kind: "CLIENT" } });
    let boxSale = await sales.saveSale({ unitId: b.id, customerRecordId: sale.customerRecordId, agreedPrice: 240000, saleDate: "2026-10-28" }, user.id);
    assert.equal(boxSale.customerRecordId, sale.customerRecordId);
    assert.equal(boxSale.customerName, "Cliente Test");
    assert.equal(await db.jobOrderRecord.count({ where: { kind: "CLIENT" } }), beforeCustomers);
    assert.equal(await db.jobOrderRecordUnit.count({ where: { recordId: sale.customerRecordId! } }), 2);
    const { saveDossierRecord } = await import("../lib/job-order-dossiers");
    const customer = await db.jobOrderRecord.findUniqueOrThrow({ where: { id: sale.customerRecordId! } });
    await assert.rejects(saveDossierRecord(job.id, { ...customer, updatedAt: customer.updatedAt.toISOString(), dueDate: "", unitIds: [a.id] }, user.email), /vendita/);
    const request = await saveDossierRecord(job.id, { kind: "REQUEST", parentId: customer.id, title: "Richiesta da conservare", status: "OPEN" }, user.email);
    await saveDossierRecord(job.id, { ...customer, updatedAt: customer.updatedAt.toISOString(), title: "Cliente Test corretto", dueDate: "", unitIds: [a.id, b.id] }, user.email);
    boxSale = await db.propertySale.findUniqueOrThrow({ where: { id: boxSale.id } });
    assert.equal(boxSale.customerName, "Cliente Test corretto");
    // Reassigning a sale creates a new dossier; documents and requests stay with the old buyer.
    const changedBuyer = await sales.saveSale({ id: boxSale.id, updatedAt: boxSale.updatedAt.toISOString(), unitId: b.id,
      createCustomer: true, customerName: "Nuovo acquirente", customerContact: "Contatto", agreedPrice: 240000, saleDate: "2026-10-28" }, user.id);
    assert.notEqual(changedBuyer.customerRecordId, customer.id);
    assert.equal((await db.jobOrderRecord.findUniqueOrThrow({ where: { id: changedBuyer.customerRecordId! } })).contact, "Contatto");
    assert.equal((await db.jobOrderRecord.findUniqueOrThrow({ where: { id: request.id } })).parentId, customer.id);
    const outside = await db.jobOrderRecord.create({ data: { jobOrderId: disabledJob.id, kind: "CLIENT", title: "Cliente altra commessa" } });
    await assert.rejects(sales.saveSale({ id: changedBuyer.id, updatedAt: changedBuyer.updatedAt.toISOString(), unitId: b.id,
      customerRecordId: outside.id, agreedPrice: 240000, saleDate: "2026-10-28" }, user.id), /non appartiene/);
    await sales.deleteSale(changedBuyer.id);
    assert.ok(await db.jobOrderRecord.findUnique({ where: { id: changedBuyer.customerRecordId! } }));
    // Simulate old rows and reconstruct an apartment/box group, idempotently.
    const c = await sales.saveUnit(job.id, { code: "Box Legacy", listPrice: 10000 });
    await db.propertySale.create({ data: { unitId: b.id, customerName: "Legacy Buyer", agreedPrice: 200000, saleDate: new Date("2026-10-28"), createdByUserId: user.id, updatedByUserId: user.id } });
    await db.propertySale.create({ data: { unitId: c.id, customerName: "Legacy Buyer", agreedPrice: 10000, saleDate: new Date("2026-10-28"), createdByUserId: user.id, updatedByUserId: user.id } });
    assert.equal(await sales.linkExistingSaleCustomers(), 2); assert.equal(await sales.linkExistingSaleCustomers(), 0);
    const legacy = await db.propertySale.findMany({ where: { customerName: "Legacy Buyer" } });
    assert.equal(legacy[0].customerRecordId, legacy[1].customerRecordId);
    assert.ok(legacy[0].customerRecordId);
    console.log("PASS: vendite e acconti; cliente creato/recuperato alla vendita, più unità sulla stessa pratica, cambio acquirente senza perdita storico, vincoli e recupero idempotente vendite pregresse.");
  } finally {
    await db?.$disconnect();
    await adminDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await adminDb.$disconnect();
    process.env.DATABASE_URL = originalUrl;
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Test fallito"); process.exitCode = 1; });
