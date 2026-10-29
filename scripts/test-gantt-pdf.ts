import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createSchedulePdf, schedulePdfFilename, schedulePdfRangeSchema } from "../lib/job-order-schedule-pdf";
import type { ScheduleJob, ScheduleEntry } from "../lib/job-order-schedule-data";
const activity = (id: string, title: string, startDate: string, endDate: string, type: ScheduleEntry["type"] = "ACTIVITY", description = ""): ScheduleEntry => ({ id, title, startDate, endDate, type, description, status: "PLANNED" });
async function main() {
  assert.equal(schedulePdfRangeSchema.safeParse({ start: "2026-02-30", end: "2026-03-02" }).success, false);
  assert.equal(schedulePdfRangeSchema.safeParse({ start: "2026-03-30", end: "2026-03-02" }).success, false);
  assert.match(schedulePdfFilename('San Rainaldo / "PDF"\r\n'), /^gantt-[a-zA-Z0-9-]+\.pdf$/);
  const job: ScheduleJob = { id: "pdf-example", name: "Residenza San Lorenzo - Pianificazione lavori", status: "ACTIVE", sections: [
    { id: "structure", title: "Strutture e fondazioni", description: "Scavo, fondazioni e opere strutturali.", color: "#8b5cf6", entries: [
      activity("foundation", "Fondazioni", "2026-11-02", "2026-12-18", "ACTIVITY", "Scavo, armature e getto. Documentare le verifiche prima della chiusura."),
      activity("check", "Verifica armature", "2026-11-17", "2026-11-17", "INTERMEDIATE_MILESTONE"),
      activity("structure-end", "Strutture completate", "2026-12-18", "2026-12-18", "MILESTONE"),
    ] },
    { id: "finishes", title: "Impianti e finiture", description: "", color: "#f97316", entries: [
      activity("systems", "Impianti e finiture", "2027-01-04", "2027-04-30"),
      activity("delivery", "Consegna al cliente", "2027-04-30", "2027-04-30", "MILESTONE", "Verbale di consegna e documentazione tecnica."),
    ] },
  ] };
  await fs.mkdir("tmp/pdfs", { recursive: true });
  const pdf = await createSchedulePdf([job]); assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  await fs.writeFile("tmp/pdfs/gantt-esempio.pdf", pdf);
  const draft = await createSchedulePdf([job], { draft: true, range: { start: "2026-11-01", end: "2026-12-31" } });
  await fs.writeFile("tmp/pdfs/gantt-bozza.pdf", draft);
  const long = { ...job, sections: [{ ...job.sections[0], entries: [activity("long", "Piano pluriennale", "2025-09-01", "2027-12-31")] }] };
  await fs.writeFile("tmp/pdfs/gantt-lungo.pdf", await createSchedulePdf([long]));
  const crowded = { ...job, sections: [{ ...job.sections[0], entries: Array.from({ length: 28 }, (_, i) => activity(`lane-${i}`, `Attività sovrapposta ${i + 1}`, "2026-11-01", "2026-12-31", "ACTIVITY", i === 0 ? "Nota tecnica molto lunga. ".repeat(100) : "")) }] };
  await fs.writeFile("tmp/pdfs/gantt-note.pdf", await createSchedulePdf([crowded]));
  await assert.rejects(createSchedulePdf([{ ...job, sections: [] }]), /Nessuna attività/);
  await assert.rejects(createSchedulePdf([job], { range: { start: "2030-01-01", end: "2030-12-31" } }), /Nessuna attività/);
  console.log("PASS PDF: piano completo, periodo, bozza, colori, milestone inline, piani pluriennali, corsie sovrapposte, note lunghe e dati assenti.");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
