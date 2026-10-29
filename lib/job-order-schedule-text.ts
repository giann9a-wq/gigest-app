import { scheduleChangeSchema, scheduleRange, type ScheduleSection } from "./job-order-schedule-data";

export const ganttTextLimit = 1_000_000;
export class GanttTextError extends Error {}
const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
const colors = ["#f97316", "#8b5cf6", "#0ea5e9", "#10b981", "#eab308", "#ec4899"];
export type ImportedGanttText = { title: string; calendar: string; notes: string[]; sections: ScheduleSection[]; warnings: string[] };
function fail(line: number, message: string): never { throw new GanttTextError(`Riga ${line}: ${message}`); }
function importedDate(value: string, line: number) {
  let iso = value.trim();
  const italian = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(iso);
  if (italian) iso = `${italian[3]}-${italian[2]}-${italian[1]}`;
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) fail(line, `“${value}” non è una data valida. Usa gg/mm/aaaa o aaaa-mm-gg, con l'anno.`);
  return iso;
}
export function parseGanttText(source: string, idFactory = () => globalThis.crypto.randomUUID()): ImportedGanttText {
  if (!source.trim()) throw new GanttTextError("Incolla il testo prodotto dall'AI o carica un file .txt.");
  if (source.length > ganttTextLimit) throw new GanttTextError("Il testo è troppo lungo: il limite è 1 MB.");
  let text = source.replace(/^\uFEFF/, "").trim();
  const fence = /^```(?:text|txt|plaintext|markdown|md)?\s*\n([\s\S]*?)\n```$/i.exec(text);
  if (fence) text = fence[1];
  const result: ImportedGanttText = { title: "Piano importato", calendar: "Giorni naturali", notes: [], sections: [], warnings: [] };
  const rows = new Map<string, ScheduleSection>();
  const milestones: { line: number; parts: string[]; intermediate: boolean }[] = [];
  let count = 0;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = index + 1; const value = raw.trim(); if (!value) continue;
    if (/^gigest gantt\b/i.test(value)) { if (normalized(value) !== "gigest gantt 1") fail(line, "Versione del formato non supportata. Usa GIGEST GANTT 1."); continue; }
    const parts = value.split("|").map(part => part.trim()); const kind = normalized(parts[0]);
    if (kind === "titolo" || kind === "calendario" || kind === "nota") {
      const detail = parts.slice(1).join(" | ");
      if (!detail || detail.length > 1000) fail(line, "Titolo, calendario e note devono contenere da 1 a 1000 caratteri.");
      if (kind === "titolo") result.title = detail;
      if (kind === "calendario") result.calendar = detail;
      if (kind === "nota") { if (result.notes.length >= 20) fail(line, "Sono consentite al massimo 20 note."); result.notes.push(detail); }
      continue;
    }
    if (kind === "milestone" || kind === "intermedia") {
      if (parts.length < 4 || !parts[1] || !parts[2]) fail(line, "Usa MILESTONE | Nome attività | Nome traguardo | Data (oppure INTERMEDIA).");
      milestones.push({ line, parts, intermediate: kind === "intermedia" });
    } else if (kind === "attivita") {
      if (parts.length < 4 || !parts[1]) fail(line, "Usa ATTIVITA | Nome attività | Inizio | Fine | #colore.");
      if (parts[1].length > 200) fail(line, "Il nome dell'attività può contenere al massimo 200 caratteri.");
      const startDate = importedDate(parts[2], line), endDate = importedDate(parts[3], line);
      if (endDate < startDate) fail(line, "La fine dell'attività precede l'inizio.");
      const key = normalized(parts[1]); let row = rows.get(key);
      const color = parts[4] || row?.color || colors[rows.size % colors.length];
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) fail(line, "Il colore deve essere nel formato #RRGGBB, per esempio #F97316.");
      if (row && row.color?.toLowerCase() !== color.toLowerCase()) fail(line, `L'attività “${parts[1]}” ha due colori diversi. Usa lo stesso colore per le barre della stessa riga.`);
      if (!row) {
        if (rows.size >= 50) fail(line, "Il piano può contenere al massimo 50 righe.");
        row = { id: idFactory(), title: parts[1], description: "", color, entries: [] }; rows.set(key, row); result.sections.push(row);
      }
      row.entries.push({ id: idFactory(), type: "ACTIVITY", title: parts[1], description: parts.slice(5).join(" | "), startDate, endDate, status: "PLANNED" });
    } else fail(line, `“${parts[0]}” non è riconosciuto. Incolla solo il blocco GIGEST con ATTIVITA, MILESTONE, INTERMEDIA, TITOLO, CALENDARIO e NOTA.`);
    if (++count > 500) fail(line, "Il piano può contenere al massimo 500 attività e milestone.");
  }
  if (!rows.size) throw new GanttTextError("Non ci sono attività da importare. Il testo deve contenere almeno una riga ATTIVITA.");
  for (const { line, parts, intermediate } of milestones) {
    const row = rows.get(normalized(parts[1]));
    if (!row) fail(line, `La milestone fa riferimento a “${parts[1]}”, ma non esiste un'attività con questo nome.`);
    if (parts[2].length > 200) fail(line, "Il nome della milestone può contenere al massimo 200 caratteri.");
    const date = importedDate(parts[3], line);
    const range = scheduleRange([{ ...row, entries: row.entries.filter(e => e.type === "ACTIVITY") }])!;
    if (date < range.start || date > range.end) result.warnings.push(`“${parts[2]}” (${parts[3]}) è fuori dal periodo della barra “${row.title}”. Verrà mantenuta sulla stessa riga.`);
    row.entries.push({ id: idFactory(), type: intermediate ? "INTERMEDIATE_MILESTONE" : "MILESTONE", title: parts[2], description: parts.slice(4).join(" | "), startDate: date, endDate: date, status: "PLANNED" });
  }
  // Keep the original assumptions available after saving and in PDF exports.
  result.sections[0].description = [`Piano: ${result.title}`, `Calendario: ${result.calendar}`, ...result.notes.map(note => `Nota: ${note}`)].join("\n");
  if (result.sections[0].description.length > 4000) throw new GanttTextError("Titolo, calendario e note superano i 4000 caratteri complessivi. Riduci le note e riprova.");
  const validated = scheduleChangeSchema.safeParse({ version: 0, sections: result.sections });
  if (!validated.success) throw new GanttTextError(validated.error.issues[0]?.message ?? "Controlla i dati del piano: uno dei campi supera i limiti consentiti.");
  result.sections = validated.data.sections;
  return result;
}
