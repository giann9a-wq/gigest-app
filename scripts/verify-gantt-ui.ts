import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import { addScheduleDays, initialScheduleWindow, type ScheduleEntry } from "../lib/job-order-schedule-data";

export async function verifyGanttUI({ databaseUrl, actor, userId, jobOrderId, db }: { databaseUrl: string; actor: string; userId: string; jobOrderId: string; db: PrismaClient }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  const day = (n: number) => addScheduleDays(today, n);
  const makeEntry = (id: string, start: number, end: number): ScheduleEntry => ({ id, title: id, type: "ACTIVITY", description: "", startDate: day(start), endDate: day(end), status: "PLANNED" });
  const fixture = async (name: string, entries: ScheduleEntry[]) => db.jobOrder.create({ data: { name, type: "SITE", ...(entries.length ? { schedule: { create: { updatedBy: actor, sections: [{ id: `${name}-section`, title: name, description: "", entries }] } } } : {}) } });
  await fixture("Commessa senza piano", []);
  await fixture("Commessa futura", [makeEntry("Lavori futuri", 180, 210)]);
  await fixture("Commessa con intervallo vuoto", [makeEntry("Lavori passati", -100, -30), makeEntry("Lavori lontani", 300, 330)]);
  const other = await db.jobOrder.findFirstOrThrow({ where: { name: "Altro cantiere pianificato" } });
  await db.jobOrderSchedule.update({ where: { jobOrderId: other.id }, data: { sections: [{ id: "other", title: "Altro", description: "", entries: [makeEntry("Lavori attuali", 10, 20)] }] } });
  const secret = randomBytes(32).toString("hex");
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3108"], { env: { ...process.env, DATABASE_URL: databaseUrl, AUTH_SECRET: secret, AUTH_URL: "http://localhost:3108", AUTH_TRUST_HOST: "true" }, stdio: "pipe", windowsHide: true });
  let logs = ""; server.stdout.on("data", b => { logs += String(b); }); server.stderr.on("data", b => { logs += String(b); });
  const require = createRequire(import.meta.url);
  const { chromium } = require("C:/Users/Lorenzo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
  let browser: any; let page: any;
  try {
    for (let i = 0; i < 100; i++) { if (logs.includes("Ready")) break; if (server.exitCode !== null) throw new Error(logs.slice(-1500)); await new Promise(r => setTimeout(r, 200)); }
    browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
    const anonymous = await browser.newContext();
    assert.equal((await anonymous.request.get(`http://localhost:3108/api/commesse/${jobOrderId}/gantt`)).status(), 401);
    assert.equal((await anonymous.request.put(`http://localhost:3108/api/commesse/${jobOrderId}/gantt`, { data: { version: 0, sections: [] } })).status(), 401);
    assert.equal((await anonymous.request.post(`http://localhost:3108/api/commesse/${jobOrderId}/gantt/pdf`, { data: { version: 0, sections: [] } })).status(), 401);
    assert.equal((await anonymous.request.get("http://localhost:3108/api/gantt/pdf?start=2026-01-01&end=2026-12-31")).status(), 401);
    assert.equal((await anonymous.request.get("http://localhost:3108/dashboard002", { maxRedirects: 0 })).status(), 307); await anonymous.close();
    const { encode } = await import("next-auth/jwt"); const token = await encode({ token: { email: actor, sub: userId, id: userId }, secret, salt: "authjs.session-token" });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: "authjs.session-token", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
    page = await context.newPage(); page.setDefaultTimeout(25000);
    const errors: string[] = []; page.on("pageerror", (e: Error) => errors.push(e.message));
    await page.goto(`http://localhost:3108/commesse/${jobOrderId}?tab=data#gantt-pianificazione`);
    const editor = page.locator("#gantt-pianificazione"); await editor.locator('button:has-text("+ Nuova riga")').waitFor();
    console.log("UI: editor caricato.");
    await page.getByRole("button", { name: "+ Nuova riga", exact: true }).click();
    await page.getByLabel("Nome riga 1", { exact: true }).fill("Strutture");
    await page.getByLabel("Colore riga 1", { exact: true }).evaluate((input: HTMLInputElement) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "#8b5cf6");
      input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.getByLabel("Descrizione riga 1", { exact: true }).click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Il calendario deve scorrere nel proprio contenitore");
    await page.getByLabel("Testo descrizione riga 1", { exact: true }).fill("Opere strutturali");
    await page.getByLabel("Descrizione riga 1", { exact: true }).click();
    const track = editor.locator(".gantt-draw-track").first();
    await editor.getByRole("button", { name: "Oggi", exact: true }).click();
    // Coordinates deliberately come from the rendered time axis, not application internals.
    async function pointForDate(date: string, y = 60) {
      await track.evaluate((el: HTMLElement) => { const box = el.getBoundingClientRect(); if (box.top < 80 || box.bottom > window.innerHeight - 30) window.scrollBy({ top: box.top - window.innerHeight / 2, behavior: "instant" }); });
      const ticks = await editor.locator(".gantt-axis > span").evaluateAll((els: HTMLElement[]) => els.map(e => ({ text: e.textContent!, x: parseFloat(e.style.left) })));
      const dateFromTick = (text: string) => {
        const months = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
        const parts = text.replace(/\./g, "").split(/\s+/); return Date.UTC(2000 + Number(parts[2]), months.indexOf(parts[1]), Number(parts[0]));
      };
      const px = (ticks[1].x - ticks[0].x) / ((dateFromTick(ticks[1].text) - dateFromTick(ticks[0].text)) / 86400000);
      const box = await track.boundingBox(); const targetX = ticks[0].x + (Date.parse(`${date}T00:00:00Z`) - dateFromTick(ticks[0].text)) / 86400000 * px + px / 2;
      return { x: box.x + targetX, y: box.y + y, px };
    }
    async function draw(start: number, end: number, y = 60) { const a = await pointForDate(day(start), y); const b = await pointForDate(day(end), y); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up(); }
    await draw(2, 16);
    assert.equal(await editor.locator(".gantt-draw-bar").count(), 1, "La barra deve essere creata trascinando sul calendario");
    console.log("UI: barra disegnata.");
    let inspector = editor.getByRole("region", { name: "Dettagli elemento selezionato" });
    await inspector.getByLabel("Titolo", { exact: true }).fill("Fondazioni grafiche");
    await inspector.getByLabel("Descrizione elemento", { exact: true }).fill("Scavo e getto");
    assert.equal(await inspector.getByLabel("Inizio", { exact: true }).inputValue(), day(2));
    assert.equal(await inspector.getByLabel("Fine", { exact: true }).inputValue(), day(16));
    // Resize the bar end and move the entire bar, preserving its inclusive duration.
    const bar = editor.locator(".gantt-draw-bar").first();
    const endPoint = await pointForDate(day(23));
    let handle = await bar.locator(".gantt-resize-end").boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down(); await page.mouse.move(endPoint.x, handle.y + 10, { steps: 8 }); await page.mouse.up();
    assert.equal(await inspector.getByLabel("Fine", { exact: true }).inputValue(), day(23));
    const barBox = await bar.boundingBox(); const dayPx = endPoint.px;
    await page.mouse.move(barBox.x + 25, barBox.y + 12); await page.mouse.down(); await page.mouse.move(barBox.x + 25 + dayPx * 4, barBox.y + 12, { steps: 8 }); await page.mouse.up();
    assert.equal(await inspector.getByLabel("Inizio", { exact: true }).inputValue(), day(6));
    assert.equal(await inspector.getByLabel("Fine", { exact: true }).inputValue(), day(27));
    await editor.getByRole("button", { name: "◆ Milestone", exact: true }).click(); await draw(35, 35, 20);
    await inspector.getByLabel("Titolo", { exact: true }).fill("Consegna grafica");
    assert.equal(await inspector.getByLabel("Data milestone", { exact: true }).inputValue(), day(35));
    // Click directly on the activity bar: the milestone belongs on that same row.
    await editor.getByRole("button", { name: "◇ Milestone intermedia", exact: true }).click(); await draw(14, 14, 52);
    await inspector.getByLabel("Titolo", { exact: true }).fill("Verifica grafica");
    // Pointer cancellation does not add or modify an element.
    const beforeCancel = await editor.locator(".gantt-draw-item").count();
    const cancelPoint = await pointForDate(day(45));
    await page.mouse.move(cancelPoint.x, cancelPoint.y); await page.mouse.down();
    await track.dispatchEvent("pointercancel", { pointerId: 1 }); await page.mouse.up();
    assert.equal(await editor.locator(".gantt-draw-item").count(), beforeCancel);
    await editor.getByRole("button", { name: "+ Nuova riga", exact: true }).click();
    await page.getByLabel("Nome riga 2", { exact: true }).fill("Finiture");
    await page.getByRole("button", { name: "Sposta su riga 2", exact: true }).click();
    const [draftDownload] = await Promise.all([page.waitForEvent("download"), editor.getByRole("button", { name: "Esporta PDF", exact: true }).click()]);
    await draftDownload.saveAs("tmp/pdfs/gantt-ui-bozza.pdf");
    const beforeSave = await db.jobOrderSchedule.findUniqueOrThrow({ where: { jobOrderId } });
    assert.equal(beforeSave.version, 3); assert.deepEqual(beforeSave.sections, []);
    await editor.getByRole("button", { name: "Salva pianificazione", exact: true }).click();
    await editor.getByText("Pianificazione Gantt salvata.", { exact: true }).waitFor();
    const saved = await db.jobOrderSchedule.findUniqueOrThrow({ where: { jobOrderId } }); assert.equal(saved.version, 4);
    const rows = saved.sections as any[]; assert.equal(rows[0].title, "Finiture"); assert.equal(rows[1].entries.length, 3);
    assert.equal(rows[1].color, "#8b5cf6");
    assert.equal(rows[1].entries[0].startDate, day(6)); assert.equal(rows[1].entries[0].endDate, day(27));
    assert.equal(rows[1].entries[1].type, "MILESTONE"); assert.equal(rows[1].entries[2].type, "INTERMEDIATE_MILESTONE");
    await page.reload(); await editor.locator(".gantt-draw-bar").first().waitFor();
    assert.equal(await page.getByLabel("Colore riga 2", { exact: true }).inputValue(), "#8b5cf6");
    const [savedDownload] = await Promise.all([page.waitForEvent("download"), editor.getByRole("button", { name: "Esporta PDF", exact: true }).click()]);
    await savedDownload.saveAs("tmp/pdfs/gantt-ui-salvato.pdf");
    assert.equal((await context.request.get("http://localhost:3108/api/gantt/pdf?start=2026-02-30&end=2026-12-31")).status(), 400);
    await page.screenshot({ path: "tmp/gantt-table-editor-desktop.png", fullPage: true });
    const initialWidth = await editor.locator(".gantt-draw-bar").first().evaluate((e: HTMLElement) => e.getBoundingClientRect().width);
    await editor.getByRole("button", { name: "Dilata asse temporale", exact: true }).click();
    const zoomedWidth = await editor.locator(".gantt-draw-bar").first().evaluate((e: HTMLElement) => e.getBoundingClientRect().width);
    assert.ok(zoomedWidth > initialWidth * 1.4);
    await editor.getByRole("button", { name: "Oggi", exact: true }).click();
    await page.goto("http://localhost:3108/dashboard002");
    const gantt = page.locator("#dashboard-gantt"); await gantt.locator(".gantt-job").first().waitFor();
    assert.equal(await gantt.locator(".gantt-job").count(), 2);
    assert.equal(await gantt.locator(".gantt-job").filter({ hasText: "senza piano" }).count(), 0);
    assert.equal(await gantt.locator(".gantt-job").filter({ hasText: "intervallo vuoto" }).count(), 0);
    const initialView = initialScheduleWindow(today);
    const format = (s: string) => s.split("-").reverse().join("/");
    assert.equal(await gantt.locator(".gantt-range-label").textContent(), `${format(initialView.start)} – ${format(initialView.end)}`);
    const job = gantt.locator(".gantt-job").filter({ hasText: "Cantiere Gantt UI" }); await job.locator(":scope > summary").click();
    assert.equal(await job.locator(".gantt-entry-row").count(), 1);
    assert.equal(await job.locator(".gantt-section-row").count(), 0);
    assert.equal(await job.locator(".gantt-diamond").count(), 2);
    assert.equal(await job.locator(".gantt-entry-row .gantt-bar").evaluate((el: HTMLElement) => getComputedStyle(el).backgroundColor), "rgb(139, 92, 246)");
    const activityBox = await job.locator(".gantt-entry-row .gantt-bar").boundingBox();
    for (const marker of await job.locator(".gantt-diamond").all()) { const box = await marker.boundingBox(); assert.ok(Math.abs(box.y + box.height / 2 - activityBox.y - activityBox.height / 2) < 1); }
    assert.ok((await job.locator(".gantt-entry-row").boundingBox()).height < 60);
    await page.screenshot({ path: "tmp/dashboard002-scrolling-desktop.png", fullPage: true });
    const [dashboardDownload] = await Promise.all([page.waitForEvent("download"), gantt.getByRole("button", { name: "Esporta PDF", exact: true }).click()]);
    await dashboardDownload.saveAs("tmp/pdfs/gantt-ui-dashboard.pdf");
    // Native horizontal scroll updates both the period and the set of visible jobs.
    const dashboardScroll = gantt.locator(".gantt-continuous-scroll");
    await dashboardScroll.evaluate((el: HTMLElement) => { el.scrollLeft += (el.clientWidth - 250) * 1.5; });
    await gantt.locator(".gantt-job").filter({ hasText: "Commessa futura" }).waitFor();
    assert.equal(await gantt.locator(".gantt-job").filter({ hasText: "Cantiere Gantt UI" }).count(), 0);
    await gantt.getByRole("button", { name: "Comprimi asse temporale", exact: true }).click();
    for (const value of [0, 20, 40, 60, 80, 100]) {
      await gantt.getByLabel("Scala temporale", { exact: true }).evaluate((input: HTMLInputElement, value: number) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(value));
        input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
      }, value);
      const labels = await gantt.locator(".gantt-axis > span").evaluateAll((els: HTMLElement[]) => els.map(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right })));
      for (let i = 1; i < labels.length; i++) assert.ok(labels[i].left >= labels[i - 1].right + 5, `Date sovrapposte allo zoom ${value}`);
    }
    await gantt.getByRole("button", { name: "Oggi", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await gantt.getByRole("button", { name: "Oggi", exact: true }).click();
    assert.equal(await gantt.locator(".gantt-job").count(), 2);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: "tmp/dashboard002-scrolling-mobile.png", fullPage: true });
    await page.locator("#dashboard-meteo > summary").click();
    assert.equal(await page.locator("#dashboard-meteo .dashboard-weather-hero").isVisible(), true);
    assert.equal(await page.locator("#dashboard-meteo .dashboard-weather-city-form").getAttribute("action"), "/dashboard002");
    assert.equal(await page.locator('.app-nav a[href="/dashboard002"]').count(), 0);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`http://localhost:3108/commesse/${jobOrderId}?tab=data#gantt-pianificazione`);
    await page.locator("#gantt-pianificazione[open]").waitFor();
    const importer = page.locator(".gantt-text-import"); await importer.locator(":scope > summary").click();
    await page.evaluate('Object.defineProperty(navigator, "clipboard", { configurable: true, value: { async writeText(text) { window.__ganttCopiedSkill = text; } } });');
    await importer.getByRole("button", { name: "Copia istruzioni per l’AI", exact: true }).click();
    await importer.getByRole("status").filter({ hasText: "Istruzioni copiate" }).waitFor();
    assert.match(await page.evaluate(() => (window as any).__ganttCopiedSkill), /GIGEST GANTT 1/);
    const example = await readFile("public/skills/gigest-gantt/esempio.txt", "utf8");
    await page.getByLabel("Testo Gantt da importare", { exact: true }).fill("ATTIVITA | Fase errata | 30/02/2026 | 01/03/2026");
    await importer.getByRole("button", { name: "Verifica e mostra anteprima", exact: true }).click();
    await importer.getByRole("alert").filter({ hasText: "Riga 1" }).waitFor();
    assert.equal(await page.locator(".gantt-draw-row").count(), 2);
    await page.getByLabel("Testo Gantt da importare", { exact: true }).fill(example);
    await importer.getByRole("button", { name: "Verifica e mostra anteprima", exact: true }).click();
    assert.equal(await importer.locator("tbody tr").count(), 4);
    assert.equal(await importer.getByRole("button", { name: "Applica all’editor", exact: true }).isDisabled(), true);
    assert.equal((await db.jobOrderSchedule.findUniqueOrThrow({ where: { jobOrderId } })).version, 4);
    await page.screenshot({ path: "tmp/gantt-import-preview-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: "tmp/gantt-import-preview-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByLabel("Ho verificato date, milestone e ipotesi della bozza", { exact: true }).check();
    await importer.getByRole("button", { name: "Applica all’editor", exact: true }).click();
    assert.equal(await page.locator(".gantt-draw-row").count(), 6); // Default appends and keeps the previous plan.
    assert.equal((await db.jobOrderSchedule.findUniqueOrThrow({ where: { jobOrderId } })).version, 4);
    await importer.getByRole("button", { name: "Verifica e mostra anteprima", exact: true }).click();
    await page.getByLabel("Modalità importazione Gantt", { exact: true }).selectOption("replace");
    await page.getByLabel("Ho verificato date, milestone e ipotesi della bozza", { exact: true }).check();
    await importer.getByRole("button", { name: "Applica all’editor", exact: true }).click();
    assert.equal(await page.locator(".gantt-draw-row").count(), 4);
    await page.getByRole("button", { name: "Salva pianificazione", exact: true }).click();
    await page.getByText("Pianificazione Gantt salvata.", { exact: true }).waitFor();
    const imported = await db.jobOrderSchedule.findUniqueOrThrow({ where: { jobOrderId } });
    assert.equal(imported.version, 5); assert.equal((imported.sections as any[])[3].entries[1].type, "MILESTONE");
    assert.match((imported.sections as any[])[0].description, /anno 2026/);
    const skillResponse = await context.request.get("http://localhost:3108/skills/gigest-gantt/SKILL.md"); assert.equal(skillResponse.status(), 200); assert.match(await skillResponse.text(), /senza JSON/);
    assert.equal((await context.request.get("http://localhost:3108/skills/gigest-gantt.zip")).status(), 200);
    await page.goto("http://localhost:3108/dashboard"); await page.locator(".dashboard2-weather .dashboard-weather-hero").waitFor();
    assert.equal(await page.locator("#dashboard-gantt").count(), 0); assert.equal(await page.locator("#dashboard-meteo").count(), 0);
    assert.deepEqual(errors, []);
    console.log("PASS UI: disegno barre/milestone, spostamento/ridimensionamento, persistenza e riordino righe; finestra t-15/+3 mesi, filtri per attività effettive e commesse che compaiono scorrendo; zoom, mobile, dashboard principale invariata.");
  } catch (e) { console.error(e instanceof Error ? e.message : e); if (page) { console.error("Pagina di verifica:", page.url()); await page.screenshot({ path: "tmp/gantt-verifica-error.png", fullPage: true }); } throw e; }
  finally { await browser?.close(); server.kill(); }
}
