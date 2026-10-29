"use client";
import { useRef, useState } from "react";
import { formatScheduleDate, scheduleChangeSchema, scheduleRange, type ScheduleSection } from "@/lib/job-order-schedule-data";
import { ganttTextLimit, parseGanttText, type ImportedGanttText } from "@/lib/job-order-schedule-text";

export function ScheduleTextImport({ sections, disabled, onApply }: { sections: ScheduleSection[]; disabled: boolean; onApply: (sections: ScheduleSection[]) => void }) {
  const [source, setSource] = useState(""); const [preview, setPreview] = useState<ImportedGanttText | null>(null);
  const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [checked, setChecked] = useState(false); const [mode, setMode] = useState("append");
  const fileRef = useRef<HTMLInputElement>(null);
  function edit(value: string) { setSource(value); setPreview(null); setChecked(false); setError(""); setMessage(""); }
  async function copySkill() {
    try { const response = await fetch("/skills/gigest-gantt/SKILL.md"); if (!response.ok) throw new Error(); await navigator.clipboard.writeText(await response.text()); setMessage("Istruzioni copiate. Incollale nel tuo strumento AI insieme alla descrizione del cantiere."); }
    catch { setError("Non riesco a copiare automaticamente. Usa Scarica istruzioni e apri il file di testo."); }
  }
  function analyze() { setError(""); setMessage(""); setChecked(false); try { setPreview(parseGanttText(source)); } catch (e) { setPreview(null); setError(e instanceof Error ? e.message : "Testo non valido"); } }
  function apply() {
    if (!preview || !checked || disabled) return;
    const next = mode === "append" ? [...sections, ...preview.sections] : preview.sections;
    if (next.length > 50 || next.reduce((sum, section) => sum + section.entries.length, 0) > 500) { setError("Il piano complessivo supera 50 righe o 500 elementi. Riduci il testo oppure scegli Sostituisci tutte le righe."); return; }
    const valid = scheduleChangeSchema.safeParse({ version: 0, sections: next });
    if (!valid.success) { setError(valid.error.issues[0]?.message ?? "Il piano complessivo supera i limiti consentiti."); return; }
    onApply(valid.data.sections); setPreview(null); setChecked(false); setMessage("Piano applicato all'editor. Controllalo nel grafico e premi Salva pianificazione per registrarlo.");
  }
  return <details className="gantt-text-import"><summary>Importa da AI · copia e incolla</summary>
    <p>Copia le istruzioni nel tuo strumento AI e descrivi il cantiere. Poi incolla qui il blocco di testo ricevuto: GiGEST riconosce attività, colori e milestone sulla stessa riga.</p>
    <div className="gantt-import-tools"><button type="button" className="mobile-button-secondary" onClick={copySkill}>Copia istruzioni per l’AI</button><a className="text-link" href="/skills/gigest-gantt/SKILL.md" download="gigest-gantt-skill.md">Scarica istruzioni</a><a className="text-link" href="/skills/gigest-gantt.zip" download="gigest-gantt.zip">Skill completa (.zip)</a><a className="text-link" href="/skills/gigest-gantt/esempio.txt" download="gigest-gantt-esempio.txt">Scarica esempio</a></div>
    <label className="gantt-import-source"><span>Testo Gantt da importare</span><textarea aria-label="Testo Gantt da importare" rows={7} maxLength={ganttTextLimit} spellCheck={false} disabled={disabled} value={source} placeholder={"GIGEST GANTT 1\nATTIVITA | Demolizioni | 28/09/2026 | 25/10/2026 | #F97316\nMILESTONE | Demolizioni | Verifica finale | 25/10/2026"} onChange={e => edit(e.target.value)} /></label>
    <input ref={fileRef} type="file" accept=".txt,.md,text/plain,text/markdown" aria-label="Carica testo Gantt" disabled={disabled} onChange={async e => {
      const file = e.target.files?.[0]; if (!file) return;
      try { if (file.size > ganttTextLimit) throw new Error("Il file supera il limite di 1 MB."); edit(await file.text()); } catch (e) { setError(e instanceof Error ? e.message : "File non leggibile"); } finally { if (fileRef.current) fileRef.current.value = ""; }
    }} />
    <div className="gantt-import-tools"><button type="button" className="mobile-button-secondary" disabled={disabled || !source.trim()} onClick={analyze}>Verifica e mostra anteprima</button></div>
    {error && <div role="alert" className="job-dashboard-error">{error}</div>}{message && <div role="status" className="job-dashboard-success">{message}</div>}
    {preview && <div className="gantt-import-preview"><strong>{preview.title}</strong><p>{preview.sections.length} righe · {preview.sections.flatMap(s => s.entries).filter(e => e.type !== "ACTIVITY").length} milestone · {preview.calendar}</p>
      {!!(preview.notes.length + preview.warnings.length) && <div className="gantt-import-notes"><strong>Note e ipotesi da verificare</strong><ul>{[...preview.notes, ...preview.warnings].map((note, i) => <li key={i}>{note}</li>)}</ul></div>}
      <div className="gantt-import-table-scroll"><table className="gantt-import-table"><thead><tr><th>Attività</th><th>Periodo</th><th>Milestone nella riga</th></tr></thead><tbody>{preview.sections.map(section => { const range = scheduleRange([{ ...section, entries: section.entries.filter(e => e.type === "ACTIVITY") }])!; return <tr key={section.id}><td><i className="gantt-import-swatch" style={{ background: section.color }} />{section.title}</td><td>{formatScheduleDate(range.start)} - {formatScheduleDate(range.end)}</td><td>{section.entries.filter(e => e.type !== "ACTIVITY").map(entry => <div key={entry.id}>{entry.type === "MILESTONE" ? "◆" : "◇"} {entry.title} · {formatScheduleDate(entry.startDate)}</div>)}</td></tr>; })}</tbody></table></div>
      <div className="gantt-import-confirm"><label>Come applicare il testo<select aria-label="Modalità importazione Gantt" value={mode} disabled={disabled} onChange={e => setMode(e.target.value)}><option value="append">Aggiungi alle righe esistenti</option><option value="replace">Sostituisci tutte le righe</option></select></label><label className="gantt-import-ack"><input type="checkbox" disabled={disabled} checked={checked} onChange={e => setChecked(e.target.checked)} /><span>Ho verificato date, milestone e ipotesi della bozza</span></label><button type="button" className="button" disabled={!checked || disabled} onClick={apply}>Applica all’editor</button></div>
    </div>}
  </details>;
}
