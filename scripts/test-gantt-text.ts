import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ganttTextLimit, parseGanttText } from "../lib/job-order-schedule-text";
import { scheduleChangeSchema } from "../lib/job-order-schedule-data";
const example = readFileSync("public/skills/gigest-gantt/esempio.txt", "utf8");
const plan = parseGanttText(example);
assert.equal(plan.sections.length, 4);
assert.deepEqual(plan.sections.map(s => [s.entries[0].startDate, s.entries[0].endDate]), [
  ["2026-09-28", "2026-10-25"], ["2026-10-26", "2026-11-08"], ["2026-11-09", "2026-12-06"], ["2026-12-07", "2027-01-31"],
]);
assert.equal(plan.sections[3].entries[1].type, "MILESTONE");
assert.equal(plan.sections[3].entries[1].title, "Consegna appartamento");
assert.equal(plan.sections[3].entries[1].startDate, "2027-01-31");
assert.equal(plan.sections[0].color, "#F97316");
assert.match(plan.sections[0].description, /Esempio illustrativo/);
assert.equal(scheduleChangeSchema.safeParse({ version: 0, sections: plan.sections }).success, true);
assert.equal(parseGanttText(`\uFEFF\n\n\x60\x60\x60text\n${example}\n\x60\x60\x60`).sections.length, 4);
const repeated = parseGanttText("INTERMEDIA | Impianti | Verifica | 2026-11-12\nattività | Impianti | 2026-11-02 | 2026-11-15 | #123456\nATTIVITA | impianti | 2026-11-20 | 2026-11-30 | #123456");
assert.equal(repeated.sections.length, 1); assert.equal(repeated.sections[0].entries.length, 3);
assert.equal(repeated.sections[0].entries[2].type, "INTERMEDIATE_MILESTONE");
const same = parseGanttText(example); assert.notEqual(plan.sections[0].id, same.sections[0].id);
const expectError = (input: string, message: RegExp) => assert.throws(() => parseGanttText(input), message);
expectError("", /Incolla/); expectError("x".repeat(ganttTextLimit + 1), /troppo lungo/);
expectError("GIGEST GANTT 2\n" + example, /Versione/);
expectError("ATTIVITA | Scavi | 28/09 | 30/09 | #123456", /Riga 1.*anno/);
expectError("ATTIVITA | Scavi | 30/02/2026 | 02/03/2026 | #123456", /data valida/);
expectError("ATTIVITA | Scavi | 30/09/2026 | 02/09/2026 | #123456", /precede/);
expectError("ATTIVITA | Scavi | 01/09/2026 | 02/09/2026 | red", /colore/);
expectError("ATTIVITA | Scavi | 01/09/2026 | 02/09/2026 | #123456\nATTIVITA | Scavi | 10/09/2026 | 12/09/2026 | #abcdef", /due colori/);
expectError(example + "\nMILESTONE | Attività inesistente | Fine | 31/01/2027", /non esiste/);
expectError("INTERMEDIA | Scavi | Fine | 31/01/2027", /Non ci sono attività/);
expectError("Ecco il tuo Gantt:\n" + example, /Riga 1.*non è riconosciuto/);
expectError(Array.from({ length: 51 }, (_, i) => `ATTIVITA | Riga ${i} | 01/09/2026 | 02/09/2026`).join("\n"), /50 righe/);
expectError(Array.from({ length: 501 }, () => "ATTIVITA | Scavi | 01/09/2026 | 02/09/2026").join("\n"), /500 attività/);
const outside = parseGanttText("ATTIVITA | Scavi | 01/09/2026 | 02/09/2026\nMILESTONE | Scavi | Fine | 10/09/2026\nINTERMEDIA | Scavi | Controllo | 05/09/2026");
assert.equal(outside.warnings.length, 2);
const untrusted = parseGanttText("ATTIVITA | <script>alert(1)</script> | 01/09/2026 | 02/09/2026");
assert.equal(untrusted.sections[0].title, "<script>alert(1)</script>"); // Remains data; the UI renders it as escaped text.
console.log("PASS import testo: esempio ristrutturazione, anni/date inclusive, milestone nella riga, colori, note persistenti, righe multiple, formati e limiti.");
