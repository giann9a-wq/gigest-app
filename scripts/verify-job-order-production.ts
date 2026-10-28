import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

// Explicit opt-in; only creates a short-lived fixture and references an existing Drive file.
// Never uploads or deletes real Drive documents, nor edits an existing job order.
async function main() {
  assert.equal(process.env.VERIFY_COMMESSE_PRODUCTION, "1", "Verifica produzione non abilitata esplicitamente");
  process.loadEnvFile("tmp/.env.commesse2-production");
  const db = new PrismaClient(); const base = "https://gigest.vercel.app";
  let fixtureId: string | undefined;
  try {
    const user = await db.user.findFirstOrThrow({ where: { status: "ACTIVE" }, select: { id: true, email: true } });
    const salt = "__Secure-authjs.session-token";
    const token = await encode({ token: { email: user.email, sub: user.id, id: user.id }, secret: process.env.AUTH_SECRET!, salt, maxAge: 600 });
    const headers = { Cookie: `${salt}=${token}` };
    const response = await fetch(`${base}/api/commesse2`, { headers });
    assert.equal(response.status, 200, "API overview autenticata");
    const overview = await response.json(); assert.ok(Array.isArray(overview.rows));
    assert.equal((await fetch(`${base}/api/commesse2`)).status, 401);
    const first = overview.rows[0];
    if (first) {
      const sheet = await fetch(`${base}/api/commesse/${first.id}`, { headers }); assert.equal(sheet.status, 200);
      const data = await sheet.json();
      assert.equal(first.actual.totalCosts, data.actual.totalCosts);
      assert.equal(first.actual.grossMargin, data.actual.grossMargin);
      assert.equal(first.budget.revenue, data.budget.revenue);
    }
    console.log(`PASS produzione: overview autenticata (${overview.rows.length} commesse), coerenza dashboard e protezione accessi.`);
    const stored = await db.deliveryNoteDocument.findFirst({ where: { sizeBytes: { lte: 4 * 1024 * 1024 } }, select: { driveFileId: true, fileName: true, mimeType: true, sizeBytes: true } })
      ?? await db.trainingDocument.findFirst({ where: { sizeBytes: { lte: 4 * 1024 * 1024 } }, select: { driveFileId: true, fileName: true, mimeType: true, sizeBytes: true } });
    if (!stored) { console.log("Nessun documento Drive esistente adatto alla verifica download."); return; }
    const fixture = await db.jobOrder.create({ data: { name: "Verifica tecnica temporanea Commesse2", type: "TRAINING", status: "ENDED", technicalBookEnabled: true } }); fixtureId = fixture.id;
    const save = await fetch(`${base}/api/commesse/${fixture.id}/fascicoli`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ kind: "TECHNICAL", title: "Verifica download temporanea", status: "DRAFT" }) });
    assert.equal(save.status, 200); const record = await save.json();
    const doc = await db.jobOrderDocument.create({ data: { jobOrderId: fixture.id, title: "Riferimento temporaneo", links: { create: { recordId: record.id } }, revisions: { create: { revision: 1, fileName: stored.fileName, mimeType: stored.mimeType ?? "application/octet-stream", sizeBytes: stored.sizeBytes ?? 0, driveFileId: stored.driveFileId, actor: user.email } } }, include: { revisions: true } });
    const download = await fetch(`${base}/api/commesse/${fixture.id}/fascicoli/documenti/${doc.revisions[0].id}`, { headers });
    assert.equal(download.status, 200); assert.ok((await download.arrayBuffer()).byteLength > 0);
    const unauth = await fetch(`${base}/api/commesse/${fixture.id}/fascicoli/documenti/${doc.revisions[0].id}`); assert.equal(unauth.status, 401);
    console.log("PASS produzione: salvataggio scheda tecnica e apertura documento Drive tramite credenziali dell'app; file originale preservato.");
  } finally {
    if (fixtureId) await db.$transaction(async tx => {
      const records = await tx.jobOrderRecord.findMany({ where: { jobOrderId: fixtureId }, select: { id: true } });
      const ids = records.map(r => r.id);
      await tx.jobOrderDocumentLink.deleteMany({ where: { recordId: { in: ids } } });
      await tx.jobOrderDocumentRevision.deleteMany({ where: { document: { jobOrderId: fixtureId } } });
      await tx.jobOrderDocument.deleteMany({ where: { jobOrderId: fixtureId } });
      await tx.jobOrderRecordRevision.deleteMany({ where: { recordId: { in: ids } } });
      await tx.jobOrderRecordUnit.deleteMany({ where: { recordId: { in: ids } } });
      await tx.jobOrderRecord.deleteMany({ where: { jobOrderId: fixtureId } });
      await tx.jobOrder.delete({ where: { id: fixtureId } });
    });
    await db.$disconnect();
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Verifica produzione fallita"); process.exitCode = 1; });
