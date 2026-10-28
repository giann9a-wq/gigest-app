import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

// All mutations run in a disposable schema, never on existing application records.
async function main() {
  process.loadEnvFile(".env");
  const originalUrl = process.env.DATABASE_URL!;
  process.loadEnvFile(".env.production.local");
  const schema = `workspace_test_${Date.now()}`;
  assert.match(schema, /^workspace_test_\d+$/);
  const admin = new PrismaClient({ datasourceUrl: originalUrl });
  let testDb: PrismaClient | undefined;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    console.log("Schema temporaneo creato; applicazione migrazioni…");
    const testUrl = new URL(originalUrl); testUrl.searchParams.set("schema", schema); process.env.DATABASE_URL = testUrl.toString();
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: process.env, stdio: "pipe" });
    console.log("Migrazioni verificate; test salvataggi e fascicoli…");
    const { prisma: db } = await import("../lib/prisma"); testDb = db;
    const { saveJobOrderSection } = await import("../lib/job-order-sheet");
    const { saveDossierRecord, getDossier, linkDossierDocument } = await import("../lib/job-order-dossiers");
    const { getJobOrderDashboard } = await import("../lib/job-order-dashboard");
    const { getJobOrdersOverview } = await import("../lib/job-orders-overview");
    const sales = await import("../lib/property-sales");
    const actor = `${schema}@example.invalid`;
    const user = await db.user.create({ data: { email: actor, role: "ADMIN", status: "ACTIVE" } });
    let job = await db.jobOrder.create({ data: { name: "Verifica commessa", type: "SITE", budgetExpectedRevenue: 500000, budgetMaterialsCost: 200000, description: "Descrizione da conservare" } });
    const foreign = await db.jobOrder.create({ data: { name: "Altra commessa", type: "SITE", salesPriceListEnabled: true, clientDossierEnabled: true } });
    job = await saveJobOrderSection(job.id, { section: "DATA", updatedAt: job.updatedAt.toISOString(), name: "Nuovo nome", type: "SITE", status: "ACTIVE", startDate: "2026-01-01", endDate: "", description: "Conservata", customerName: "Committente", customerContact: "Contatto", siteAddress: "Indirizzo", isOwnAccountSite: true });
    assert.equal(Number(job.budgetExpectedRevenue), 500000); assert.equal(Number(job.budgetMaterialsCost), 200000);
    const budget = { personnel: "100", equipment: "20", materials: "200000", professionalServices: "0", thirdPartyServices: "0", misc: "0", revenue: "550000" };
    await assert.rejects(saveJobOrderSection(job.id, { section: "BUDGET", updatedAt: "2020-01-01T00:00:00.000Z", budget, budgetRevenueSource: "MANUAL" }), /ricarica/);
    await assert.rejects(saveJobOrderSection(job.id, { section: "BUDGET", updatedAt: job.updatedAt.toISOString(), budget, budgetRevenueSource: "LIST" }), /Abilita/);
    job = await saveJobOrderSection(job.id, { section: "BUDGET", updatedAt: job.updatedAt.toISOString(), budget, budgetRevenueSource: "MANUAL" });
    assert.equal(job.description, "Conservata"); assert.equal(Number(job.budgetExpectedRevenue), 550000);
    await sales.setSalesPriceListEnabled(job.id, true);
    const a = await sales.saveUnit(job.id, { code: "A01", listPrice: "300000" });
    const b = await sales.saveUnit(job.id, { code: "B01", listPrice: "30000" });
    const outside = await sales.saveUnit(foreign.id, { code: "X01", listPrice: "100" });
    job = await db.jobOrder.findUniqueOrThrow({ where: { id: job.id } });
    job = await saveJobOrderSection(job.id, { section: "BUDGET", updatedAt: job.updatedAt.toISOString(), budget: { ...budget, revenue: "330000" }, budgetRevenueSource: "LIST" });
    assert.equal(Number(job.budgetExpectedRevenue), 550000);
    assert.equal((await getJobOrderDashboard(job.id))!.budget.revenue, 330000);
    await sales.saveUnit(job.id, { id: a.id, code: "A01", listPrice: "310000" });
    assert.equal((await getJobOrderDashboard(job.id))!.budget.revenue, 340000);
    await sales.setSalesPriceListEnabled(job.id, false);
    assert.equal((await getJobOrderDashboard(job.id))!.budget.revenue, 550000);
    job = await db.jobOrder.findUniqueOrThrow({ where: { id: job.id } });
    job = await saveJobOrderSection(job.id, { section: "MODULES", updatedAt: job.updatedAt.toISOString(), clientDossierEnabled: true, technicalBookEnabled: true });
    const client = await saveDossierRecord(job.id, { kind: "CLIENT", title: "Rossi e Bianchi", status: "OPEN", unitIds: [a.id, b.id], contact: "Due intestatari" }, actor);
    const request = await saveDossierRecord(job.id, { kind: "REQUEST", parentId: client.id, title: "Presa cucina", status: "PENDING", description: "Presa aggiuntiva" }, actor);
    await saveDossierRecord(job.id, { ...request, updatedAt: request.updatedAt.toISOString(), dueDate: "", status: "APPROVED" }, actor);
    await assert.rejects(saveDossierRecord(job.id, { ...request, updatedAt: request.updatedAt.toISOString(), dueDate: "", status: "DONE" }, actor), /ricarica/);
    await assert.rejects(saveDossierRecord(foreign.id, { kind: "REQUEST", parentId: client.id, title: "Tentativo altra commessa", status: "OPEN" }, actor), /Pratica cliente non valida/);
    await assert.rejects(saveDossierRecord(job.id, { kind: "CLIENT", title: "Unità esterna", status: "OPEN", unitIds: [outside.id] }, actor), /Unità non appartenente/);
    const technical = await saveDossierRecord(job.id, { kind: "TECHNICAL", title: "Impianto elettrico A01", status: "VALIDATED", unitIds: [a.id], scope: "A01" }, actor);
    const doc = await db.jobOrderDocument.create({ data: { jobOrderId: job.id, title: "Elaborato", links: { create: { recordId: request.id } }, revisions: { create: { revision: 1, fileName: "schema.pdf", mimeType: "application/pdf", driveFileId: "test-file-id-no-upload", sizeBytes: 10, actor } } } });
    await linkDossierDocument(job.id, technical.id, doc.id); await linkDossierDocument(job.id, technical.id, doc.id);
    await assert.rejects(linkDossierDocument(foreign.id, technical.id, doc.id), /non appartenente/);
    assert.equal(await db.jobOrderDocument.count(), 1); assert.equal(await db.jobOrderDocumentLink.count(), 2);
    await assert.rejects(db.salesUnit.delete({ where: { id: a.id } }));
    await sales.setSalesPriceListEnabled(job.id, true);
    const sale = await sales.saveSale({ unitId: a.id, customerName: "Rossi", agreedPrice: 300000, saleDate: "2026-10-28" }, user.id);
    await sales.deleteSale(sale.id);
    assert.equal((await getDossier(job.id)).records.find(r => r.id === client.id)!.units.length, 2);
    const changed = await db.jobOrderRecord.findUniqueOrThrow({ where: { id: client.id } });
    await saveDossierRecord(job.id, { ...changed, updatedAt: changed.updatedAt.toISOString(), dueDate: "", status: "CLOSED", unitIds: [a.id, b.id] }, actor);
    await assert.rejects(saveDossierRecord(job.id, { kind: "CHOICE", parentId: client.id, title: "Finiture", status: "OPEN" }, actor), /chiusa/);
    const dossier = await getDossier(job.id);
    assert.equal(dossier.records.find(r => r.id === request.id)!.revisions.length, 2);
    job = await db.jobOrder.findUniqueOrThrow({ where: { id: job.id } });
    await saveJobOrderSection(job.id, { section: "MODULES", updatedAt: job.updatedAt.toISOString(), clientDossierEnabled: false, technicalBookEnabled: true });
    await assert.rejects(saveDossierRecord(job.id, { kind: "CLIENT", title: "Disabilitato", status: "OPEN" }, actor), /Abilita/);
    assert.equal((await getDossier(job.id)).records.length, 3);
    // Compare both readers on representative cost/revenue records, not just zero values.
    await db.costActualEntry.create({ data: { jobOrderId: job.id, category: "MATERIE_PRIME", amount: "123.45", fingerprint: "workspace-test-cost" } });
    await db.jobOrder.update({ where: { id: job.id }, data: { actualRevenue: 1000 } });
    const dashboard = (await getJobOrderDashboard(job.id))!;
    const overview = (await getJobOrdersOverview()).find(r => r.id === job.id)!;
    assert.equal(overview.budget.revenue, dashboard.budget.revenue);
    assert.equal(overview.actual.totalCosts, dashboard.actual.totalCosts);
    assert.equal(overview.actual.grossMargin, dashboard.actual.grossMargin);
    assert.equal(overview.actual.grossMarginPct, dashboard.actual.grossMarginPct);
    console.log("PASS: salvataggi per sezione, conflitti, fonte listino/manuale, pratiche e unità, storico, documenti condivisi, vincoli, cambio vendita e coerenza overview/dashboard.");
    if (process.env.TEST_WORKSPACE_UI === "1") {
      await db.jobOrder.update({ where: { id: job.id }, data: { clientDossierEnabled: true } });
      const { verifyWorkspaceUI } = await import("./verify-job-order-ui");
      await verifyWorkspaceUI({ databaseUrl: process.env.DATABASE_URL!, actor, userId: user.id, jobOrderId: job.id, db });
    }
  } finally {
    await testDb?.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect();
    process.env.DATABASE_URL = originalUrl;
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Test fallito"); process.exitCode = 1; });
