import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";

export async function verifyWorkspaceUI({ databaseUrl, actor, userId, jobOrderId, db }: { databaseUrl: string; actor: string; userId: string; jobOrderId: string; db: PrismaClient }) {
  const secret = randomBytes(32).toString("hex");
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3107"], {
    env: { ...process.env, DATABASE_URL: databaseUrl, AUTH_SECRET: secret, AUTH_URL: "http://localhost:3107", AUTH_TRUST_HOST: "true", PORT: "3107" }, stdio: "pipe", windowsHide: true,
  });
  let log = ""; server.stdout.on("data", b => { log += String(b); }); server.stderr.on("data", b => { log += String(b); });
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Lorenzo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
  let browser: any; // Optional local browser runtime, outside application dependencies.
  let folderId: string | undefined;
  try {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (log.includes("Ready")) break;
      if (server.exitCode !== null) throw new Error(`Server di verifica terminato: ${log.slice(-1000)}`);
      await new Promise(r => setTimeout(r, 250));
    }
    browser = await chromium.launch({ headless: true, executablePath: process.env.TEST_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
    const anonymous = await browser.newContext();
    assert.equal((await anonymous.request.get("http://localhost:3107/api/commesse2")).status(), 401);
    assert.equal((await anonymous.request.get(`http://localhost:3107/api/commesse/${jobOrderId}/fascicoli`)).status(), 401);
    await anonymous.close();
    const { encode } = await import("next-auth/jwt");
    const token = await encode({ token: { email: actor, sub: userId, id: userId, name: "Verifica UI" }, secret, salt: "authjs.session-token" });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: "authjs.session-token", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage(); page.setDefaultTimeout(60000);
    const errors: string[] = []; page.on("pageerror", (e: Error) => errors.push(e.message));
    await page.goto("http://localhost:3107/commesse2");
    await page.getByRole("heading", { name: "Overview commesse", exact: true }).waitFor();
    const card = page.locator(".jobs2-card").filter({ has: page.getByRole("heading", { name: "Nuovo nome", exact: true }) });
    await card.waitFor(); assert.equal(await card.locator(".jobs2-metrics strong").count(), 4);
    await page.screenshot({ path: "tmp/commesse2-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: "tmp/commesse2-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await card.getByRole("link", { name: "Apri scheda", exact: true }).click();
    await page.getByRole("heading", { name: "Dati Commessa", exact: true }).waitFor();
    await page.getByRole("tab", { name: "Budget", exact: true }).click();
    await page.getByLabel("Budget Materie prime", { exact: true }).fill("200100");
    await page.getByRole("button", { name: "Salva budget", exact: true }).click();
    await page.getByText("Budget salvato.", { exact: true }).waitFor();
    assert.equal(Number((await db.jobOrder.findUniqueOrThrow({ where: { id: jobOrderId } })).budgetMaterialsCost), 200100);
    await page.screenshot({ path: "tmp/commesse2-budget-desktop.png", fullPage: true });
    console.log("UI: overview e salvataggio budget verificati.");
    await page.getByRole("tab", { name: "Listino", exact: true }).click();
    await page.getByRole("heading", { name: "Listino appartamenti e box" }).waitFor();
    await page.getByRole("tab", { name: "Clienti", exact: true }).click();
    await page.getByRole("button", { name: "+ Pratica cliente", exact: true }).click();
    await page.getByLabel("Cliente / intestatari", { exact: true }).fill("Pratica verifica browser");
    await page.getByLabel("Referenti e contatti", { exact: true }).fill("Referente di prova");
    await page.getByRole("button", { name: "Salva scheda", exact: true }).click();
    await page.getByText("Scheda salvata e storicizzata.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "+ Personalizzazione", exact: true }).click();
    await page.getByLabel("Titolo", { exact: true }).fill("Richiesta dal browser");
    await page.locator(".dossier-content form select").first().selectOption("PENDING");
    await page.getByRole("button", { name: "Salva scheda", exact: true }).click();
    await page.getByText("Scheda salvata e storicizzata.", { exact: true }).waitFor();
    assert.equal(await db.jobOrderRecord.count({ where: { jobOrderId, title: "Richiesta dal browser", status: "PENDING" } }), 1);
    console.log("UI: pratica cliente e personalizzazione salvate.");
    await page.getByRole("tab", { name: "Libretto immobile", exact: true }).click();
    await page.getByRole("button", { name: "+ Scheda tecnica", exact: true }).click();
    await page.getByLabel("Titolo", { exact: true }).fill("Scheda verifica browser");
    await page.getByRole("button", { name: "Salva scheda", exact: true }).click();
    await page.getByText("Scheda salvata e storicizzata.", { exact: true }).waitFor();
    if (!process.env.GOOGLE_DRIVE_REFRESH_TOKEN || process.env.GOOGLE_DRIVE_REFRESH_TOKEN.includes("SENSITIVE")) {
      await page.screenshot({ path: "tmp/commesse2-libretto-desktop.png", fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await page.screenshot({ path: "tmp/commesse2-libretto-mobile.png", fullPage: true });
      assert.deepEqual(errors, []);
      console.log("PASS UI: overview desktop/mobile, budget, pratiche, personalizzazioni e libretto. Upload Drive non eseguito: token locale mascherato da Vercel.");
      return;
    }
    const { ensureJobOrderDossierFolder, deleteDriveFile } = await import("../lib/google-drive-document-storage");
    folderId = await ensureJobOrderDossierFolder(jobOrderId);
    const PDFDocument = require("pdfkit");
    const pdf = await new Promise<Buffer>((resolve, reject) => { const doc = new PDFDocument(); const chunks: Buffer[] = []; doc.on("data", (c: Buffer) => chunks.push(c)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); doc.text("Verifica temporanea fascicoli GiGEST"); doc.end(); });
    await page.getByText("Carica documento o nuova revisione", { exact: true }).click();
    await page.getByLabel("Titolo", { exact: true }).fill("Documento verifica browser");
    await page.locator('input[type="file"]').setInputFiles({ name: "verifica.pdf", mimeType: "application/pdf", buffer: pdf });
    await page.getByRole("button", { name: "Carica documento", exact: true }).click();
    await page.getByText("Documento caricato. Le revisioni precedenti rimangono disponibili.", { exact: true }).waitFor();
    const uploaded = await db.jobOrderDocument.findFirstOrThrow({ where: { jobOrderId, title: "Documento verifica browser" }, include: { revisions: true } });
    const response = await context.request.get(`http://localhost:3107/api/commesse/${jobOrderId}/fascicoli/documenti/${uploaded.revisions[0].id}`);
    assert.equal(response.status(), 200); assert.deepEqual(await response.body(), pdf);
    await page.locator(".dossier-upload select[name=documentId]").selectOption(uploaded.id);
    await page.locator('input[type="file"]').setInputFiles({ name: "verifica-rev2.pdf", mimeType: "application/pdf", buffer: pdf });
    const uploadResponse = page.waitForResponse((r: any) => r.url().endsWith("/fascicoli/documenti") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Carica documento", exact: true }).click();
    assert.equal((await uploadResponse).status(), 200);
    assert.equal(await db.jobOrderDocumentRevision.count({ where: { documentId: uploaded.id } }), 2);
    await page.screenshot({ path: "tmp/commesse2-libretto-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: "tmp/commesse2-libretto-mobile.png", fullPage: true });
    assert.deepEqual(errors, []);
    await deleteDriveFile(folderId); folderId = undefined;
    console.log("PASS UI: overview desktop/mobile, accesso scheda, salvataggio budget, cliente/richiesta/libretto, upload Drive, download e due revisioni immutabili; accessi anonimi negati.");
  } finally {
    if (folderId) { const { deleteDriveFile } = await import("../lib/google-drive-document-storage"); await deleteDriveFile(folderId).catch(() => {}); }
    await browser?.close(); server.kill();
  }
}
