import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import { z } from "zod";
import { addScheduleDays, addScheduleMonths, formatScheduleDate, scheduleAxisTicks, scheduleDay, scheduleEntryLanes, scheduleOverlaps, scheduleRange, scheduleRowColor, scheduleStatuses, scheduleTypes, type ScheduleJob, type ScheduleRange } from "./job-order-schedule-data";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Number.isFinite(scheduleDay(value)) && new Date(scheduleDay(value)).toISOString().slice(0, 10) === value, "Data non valida");
export const schedulePdfRangeSchema = z.object({ start: date, end: date }).refine(r => r.start <= r.end, "La fine precede l'inizio");
export class SchedulePdfError extends Error {}
const clean = (value: string) => value.replace(/[–—−]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF€]/g, " ");
const days = (start: string, end: string) => Math.round((scheduleDay(end) - scheduleDay(start)) / 86400000);
export const schedulePdfFilename = (name: string) => `gantt-${name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 90).replace(/^-|-$/g, "") || "commesse"}.pdf`;

export async function createSchedulePdf(jobs: ScheduleJob[], options: { range?: ScheduleRange; draft?: boolean } = {}) {
  const planned = jobs.filter(job => options.range ? scheduleOverlaps(job.sections, options.range) : scheduleRange(job.sections));
  if (!planned.length) throw new SchedulePdfError("Nessuna attività pianificata da esportare nel periodo scelto.");
  const doc = new PDFDocument({ size: "A3", layout: "landscape", margin: 0, bufferPages: true, autoFirstPage: false,
    info: { Title: "Pianificazione Gantt", Author: "GiGEST", Subject: options.draft ? "Bozza non salvata" : "Pianificazione commesse" } });
  const chunks: Buffer[] = []; doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const left = 38, labelWidth = 270, plotX = left + labelWidth, plotWidth = 844, right = plotX + plotWidth, bottom = 782;
  const generated = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
  let pageCount = 0, y = 0;
  const text = (value: string, x: number, at: number, width: number, size = 9, bold = false, height = 30) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor("#172438").text(clean(value), x, at, { width, height, lineGap: 2, ellipsis: true });
  };
  function page(job: ScheduleJob, range: ScheduleRange, details = false) {
    if (++pageCount > 100) throw new SchedulePdfError("Il PDF supera 100 pagine. Esporta un periodo più breve o una singola commessa.");
    doc.addPage(); doc.rect(left, 27, 4, 42).fill("#ea580c");
    text("GiGEST  /  PIANIFICAZIONE GANTT", left + 14, 27, 750, 10, true);
    text(job.name, left + 14, 45, right - left - 14, 17, true, 44);
    text(`${details ? "Dettagli e milestone" : "Periodo"}: ${formatScheduleDate(range.start)} - ${formatScheduleDate(range.end)}${options.draft ? "  |  BOZZA NON SALVATA" : ""}`, left, 96, right - left, 9);
    y = 122;
  }
  function axis(range: ScheduleRange) {
    const px = plotWidth / (days(range.start, range.end) + 1);
    doc.rect(left, y, right - left, 28).fill("#fff4eb"); text("ATTIVITA / RIGA", left + 10, y + 9, labelWidth - 20, 8, true);
    text(formatScheduleDate(range.start), plotX + 3, y + 9, 80, 8);
    for (const tick of scheduleAxisTicks(range.start, range, px)) if (tick.x >= 90 && tick.x + 80 <= plotWidth) text(tick.label, plotX + tick.x + 3, y + 9, 80, 8);
    y += 28;
    return px;
  }
  function diamond(x: number, at: number, color: string, intermediate: boolean) {
    x = Math.max(plotX + 6, Math.min(right - 6, x));
    doc.save().moveTo(x, at - 5).lineTo(x + 5, at).lineTo(x, at + 5).lineTo(x - 5, at).closePath().lineWidth(1.2).fillAndStroke(intermediate ? "#ffffff" : color, color).restore();
  }
  function wrap(value: string, width: number) {
    doc.font("Helvetica").fontSize(9);
    const lines: string[] = []; let current = "";
    for (const word of clean(value).split(/\s+/)) {
      if (doc.widthOfString(`${current} ${word}`.trim()) <= width) { current = `${current} ${word}`.trim(); continue; }
      if (current) { lines.push(current); current = ""; }
      for (const character of word) { if (doc.widthOfString(current + character) > width) { lines.push(current); current = ""; } current += character; }
    }
    if (current) lines.push(current);
    return lines;
  }
  try {
    for (const job of planned) {
      const requested = options.range ?? scheduleRange(job.sections)!;
      let start = requested.start;
      while (start <= requested.end) {
        const next = addScheduleMonths(start, 6);
        const range = { start, end: requested.end < next ? requested.end : addScheduleDays(next, -1) };
        start = next;
        if (!scheduleOverlaps(job.sections, range)) continue;
        page(job, range); let px = axis(range);
        for (const section of job.sections.filter(s => scheduleOverlaps([s], range))) {
          const entries = section.entries.filter(e => e.startDate <= range.end && e.endDate >= range.start);
          const { lanes, count } = scheduleEntryLanes(entries);
          for (let firstLane = 0; firstLane < count; firstLane += 8) {
            const height = Math.max(50, Math.min(8, count - firstLane) * 22 + 18);
            if (y + height > bottom - 38) { page(job, range); px = axis(range); }
            const top = y;
            doc.lineWidth(0.4).strokeColor("#dfd9d3").rect(left, top, right - left, height).stroke();
            doc.save().rect(left + 1, top + 1, labelWidth - 2, height - 2).fill("#faf9f7").restore();
            text(`${section.title}${firstLane ? " (continua)" : ""}`, left + 10, top + 7, labelWidth - 20, 10, true, 28);
            const full = scheduleRange([section])!;
            text(`${formatScheduleDate(full.start)} - ${formatScheduleDate(full.end)}`, left + 10, top + 35, labelWidth - 20, 8, false, 12);
            doc.save().rect(plotX, top + 1, plotWidth, height - 2).clip();
            for (const tick of scheduleAxisTicks(range.start, range, px)) doc.moveTo(plotX + tick.x, top).lineTo(plotX + tick.x, top + height).lineWidth(0.4).strokeColor("#e8e4df").stroke();
            // Markers are painted after bars so they remain visible on the activity.
            for (const entry of [...entries].sort((a, b) => Number(a.type !== "ACTIVITY") - Number(b.type !== "ACTIVITY"))) {
              const lane = lanes.get(entry.id) ?? 0; if (lane < firstLane || lane >= firstLane + 8) continue;
              const x = plotX + days(range.start, entry.startDate) * px;
              const at = top + 25 + (lane - firstLane) * 22;
              if (entry.type === "ACTIVITY") {
                doc.roundedRect(x, at - 4, Math.max(1, (days(entry.startDate, entry.endDate) + 1) * px), 8, 2).fill(scheduleRowColor(section));
              } else diamond(x + px / 2, at, scheduleRowColor(section), entry.type === "INTERMEDIATE_MILESTONE");
            }
            doc.restore(); y += height;
          }
        }
        text("Barra: attività  |  Rombo pieno: milestone  |  Rombo vuoto: milestone intermedia  |  Colori delle righe come nel piano", left, y + 12, right - left, 8);
        y += 42;
      }
      const notes = job.sections.flatMap(section => [
        ...(section.description && scheduleOverlaps([section], requested) ? [{ heading: section.title, body: section.description }] : []),
        ...section.entries.filter(e => e.startDate <= requested.end && e.endDate >= requested.start && (e.type !== "ACTIVITY" || e.description || e.title !== section.title)).map(e => ({
          heading: `${section.title} / ${scheduleTypes[e.type]}: ${e.title}`,
          body: `${formatScheduleDate(e.startDate)}${e.endDate !== e.startDate ? ` - ${formatScheduleDate(e.endDate)}` : ""} | ${scheduleStatuses[e.status]}${e.description ? ` | ${e.description}` : ""}`,
        })),
      ]);
      if (notes.length) {
        if (y > bottom - 70) page(job, requested, true);
        text("MILESTONE E DETTAGLI DEL PIANO", left, y, right - left, 10, true); y += 24;
        for (const note of notes) {
          const lines = [...wrap(note.heading, right - left - 20), ...wrap(note.body, right - left - 20)];
          if (y > bottom - 45) page(job, requested, true);
          for (let i = 0; i < lines.length; i++) {
            if (y > bottom - 16) page(job, requested, true);
            text(lines[i], left + 10, y, right - left - 20, 9, i === 0, 14); y += 14;
          }
          y += 10;
        }
      }
    }
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i); doc.moveTo(left, 801).lineTo(right, 801).lineWidth(0.5).strokeColor("#dfd9d3").stroke();
      text(`GiGEST | Esportato il ${generated}${options.draft ? " | Bozza non salvata" : ""}`, left, 811, 850, 8, false, 15);
      text(`Pagina ${i + 1} / ${pageCount}`, right - 110, 811, 110, 8, false, 15);
    }
    doc.end(); return await completed;
  } catch (error) { doc.end(); await completed.catch(() => undefined); throw error; }
}
