"use client";
import { useEffect, useRef, useState } from "react";
import { addScheduleDays, formatScheduleDate, scheduleChangeSchema, scheduleEntryLanes, scheduleRowColor, scheduleRowInk, scheduleStatuses, scheduleTypes, type ScheduleEntry, type SchedulePlan, type ScheduleSection } from "@/lib/job-order-schedule-data";
import { ScheduleAxis, ScheduleGrid, ScheduleViewportToolbar, scheduleDaysBetween, useScheduleViewport } from "./use-schedule-viewport";
import { SchedulePdfButton } from "./schedule-pdf-button";
import { ScheduleTextImport } from "./schedule-text-import";

async function requestPlan(url: string, body?: unknown): Promise<SchedulePlan> {
  const response = await fetch(url, body ? { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "Impossibile caricare la pianificazione"); return data;
}
type Selection = { sectionId: string; entryId: string };
type Gesture = { sectionId: string; original: ScheduleEntry; mode: "CREATE" | "MOVE" | "START" | "END"; origin: string; current: ScheduleEntry };
function reorder<T>(items: T[], index: number, offset: number) { const next = [...items]; const target = index + offset; if (target < 0 || target >= next.length) return next; [next[index], next[target]] = [next[target], next[index]]; return next; }

export function JobOrderScheduleEditor({ jobOrderId, onDirtyChange }: { jobOrderId: string; jobName: string; startDate: string; onDirtyChange: (dirty: boolean) => void }) {
  const [plan, setPlan] = useState<SchedulePlan | null>(null);
  const [sections, setSections] = useState<ScheduleSection[]>([]);
  const panel = useRef<HTMLDetailsElement>(null);
  const fitImportedPlan = useRef(false);
  const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [tool, setTool] = useState<ScheduleEntry["type"]>("ACTIVITY");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pdfScope, setPdfScope] = useState("all");
  const gesture = useRef<Gesture | null>(null);
  const [preview, setPreview] = useState<Gesture | null>(null);
  const url = `/api/commesse/${jobOrderId}/gantt`;
  const viewport = useScheduleViewport(sections);
  useEffect(() => { if (fitImportedPlan.current) { fitImportedPlan.current = false; viewport.fit(); } }, [sections, viewport]);
  useEffect(() => { if (window.location.hash === "#gantt-pianificazione" && panel.current) panel.current.open = true; }, []);
  useEffect(() => { let active = true; requestPlan(url).then(data => { if (active) { setPlan(data); setSections(data.sections); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [url]);
  function change(next: ScheduleSection[]) { setSections(next); setDirty(true); onDirtyChange(true); setMessage(""); }
  function entryField(sectionId: string, entryId: string, patch: Partial<ScheduleEntry>) { change(sections.map(s => s.id === sectionId ? { ...s, entries: s.entries.map(e => e.id === entryId ? { ...e, ...patch } : e) } : s)); }
  async function reload() {
    if (dirty && !window.confirm("Ricaricare il piano e abbandonare le modifiche non salvate?")) return;
    setBusy(true); setError("");
    try { const next = await requestPlan(url); setPlan(next); setSections(next.sections); setDirty(false); setSelection(null); onDirtyChange(false); setMessage(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Ricaricamento non riuscito"); } finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!plan) return;
    const checked = scheduleChangeSchema.safeParse({ version: plan.version, sections });
    if (!checked.success) { setError(checked.error.issues[0]?.message ?? "Controlla date e titoli"); return; }
    setBusy(true); setError(""); setMessage("");
    try { const next = await requestPlan(url, checked.data); setPlan(next); setSections(next.sections); setDirty(false); onDirtyChange(false); setMessage("Pianificazione Gantt salvata."); }
    catch (e) { setError(e instanceof Error ? e.message : "Salvataggio non riuscito"); } finally { setBusy(false); }
  }
  function newEntry(sectionId: string, date: string): ScheduleEntry {
    const section = sections.find(s => s.id === sectionId)!;
    return { id: crypto.randomUUID(), type: tool, title: tool === "ACTIVITY" ? section.title || "Nuova attività" : scheduleTypes[tool], description: "", startDate: date, endDate: date, status: "PLANNED" };
  }
  function startGesture(event: React.PointerEvent, sectionId: string, mode: Gesture["mode"], entry?: ScheduleEntry) {
    if (busy || event.button !== 0 || !event.isPrimary) return;
    const track = event.currentTarget.closest<HTMLElement>(".gantt-draw-track")!;
    const date = viewport.dateAt(event.clientX - track.getBoundingClientRect().left);
    // With a milestone tool active, clicking an activity adds a marker on that same row.
    if (entry?.type === "ACTIVITY" && tool !== "ACTIVITY") { entry = undefined; mode = "CREATE"; }
    const original = entry ?? newEntry(sectionId, date);
    const next = { sectionId, original, mode, origin: date, current: original };
    gesture.current = next; setPreview(next);
    if (entry) setSelection({ sectionId, entryId: entry.id });
    track.setPointerCapture(event.pointerId); event.preventDefault(); event.stopPropagation();
  }
  function moveGesture(event: React.PointerEvent<HTMLDivElement>) {
    const active = gesture.current; if (!active) return;
    const date = viewport.dateAt(event.clientX - event.currentTarget.getBoundingClientRect().left);
    const { original, origin, mode } = active;
    let startDate = original.startDate, endDate = original.endDate;
    if (mode === "CREATE") { startDate = original.type === "ACTIVITY" && date < origin ? date : origin; endDate = original.type === "ACTIVITY" && date > origin ? date : origin; if (original.type !== "ACTIVITY") startDate = endDate = date; }
    if (mode === "MOVE") { const delta = scheduleDaysBetween(origin, date); startDate = addScheduleDays(original.startDate, delta); endDate = addScheduleDays(original.endDate, delta); }
    if (mode === "START") startDate = date > endDate ? endDate : date;
    if (mode === "END") endDate = date < startDate ? startDate : date;
    const next = { ...active, current: { ...original, startDate, endDate } }; gesture.current = next; setPreview(next);
  }
  function endGesture(event: React.PointerEvent<HTMLDivElement>) {
    const active = gesture.current; if (!active) return;
    gesture.current = null; setPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (active.mode === "CREATE") change(sections.map(s => s.id === active.sectionId ? { ...s, entries: [...s.entries, active.current] } : s));
    else if (active.current.startDate !== active.original.startDate || active.current.endDate !== active.original.endDate) entryField(active.sectionId, active.original.id, { startDate: active.current.startDate, endDate: active.current.endDate });
    setSelection({ sectionId: active.sectionId, entryId: active.current.id });
  }
  const selectedSection = sections.find(s => s.id === selection?.sectionId);
  const selected = selectedSection?.entries.find(e => e.id === selection?.entryId);
  return <details ref={panel} id="gantt-pianificazione" className="job-sheet-panel gantt-editor gantt-table-editor">
    <summary><strong>Pianificazione Gantt{dirty ? " *" : ""}</strong><span>{sections.length} righe · {sections.reduce((sum, s) => sum + s.entries.length, 0)} elementi</span></summary>
    <p>Aggiungi le righe a sinistra. Per una barra trascina sul calendario; per una milestone scegli lo strumento e tocca la data. Trascina gli elementi per spostarli e i bordi delle barre per modificarne la durata.</p>
    {error && <div role="alert" className="job-dashboard-error">{error}</div>}{message && <div role="status" className="job-dashboard-success">{message}</div>}
    {!plan && <p>Caricamento pianificazione… <button type="button" className="text-link" onClick={reload}>Riprova</button></p>}
    <ScheduleTextImport sections={sections} disabled={busy || !plan} onApply={next => { fitImportedPlan.current = true; setSelection(null); change(next); }} />
    <form onSubmit={save}><fieldset disabled={busy || !plan}>
      <ScheduleViewportToolbar viewport={viewport}><label>PDF<select aria-label="Periodo esportazione PDF" value={pdfScope} onChange={e => setPdfScope(e.target.value)}><option value="all">Piano completo</option><option value="view">Periodo visibile</option></select></label><SchedulePdfButton url={`${url}/pdf`} data={{ version: plan?.version ?? 0, sections, ...(pdfScope === "view" ? { range: viewport.view } : {}) }} disabled={!sections.some(s => s.entries.length) || !plan} /></ScheduleViewportToolbar>
      <div className="gantt-draw-tools" role="group" aria-label="Strumento di pianificazione">{Object.entries(scheduleTypes).map(([key, label]) => <button type="button" className="mobile-button-secondary" aria-pressed={tool === key} key={key} onClick={() => setTool(key as ScheduleEntry["type"])}>{key === "ACTIVITY" ? "▰ Barra" : key === "MILESTONE" ? "◆ Milestone" : "◇ Milestone intermedia"}</button>)}<span>Seleziona un elemento per titolo, descrizione e dettagli.</span></div>
      <div ref={viewport.scrollRef} onScroll={viewport.onScroll} className="gantt-scroll gantt-continuous-scroll" role="region" tabIndex={0} aria-label="Pianificazione su asse temporale scorribile"><div className="gantt-board" style={viewport.boardStyle}>
        <ScheduleAxis viewport={viewport} label="Sezioni / righe" />
        {sections.map((section, index) => {
          const entries = section.entries.map(entry => preview?.sectionId === section.id && preview.original.id === entry.id ? preview.current : entry);
          if (preview?.sectionId === section.id && preview.mode === "CREATE") entries.push(preview.current);
          const { lanes, count } = scheduleEntryLanes(entries);
          return <div className="gantt-row gantt-draw-row" data-section-id={section.id} key={section.id} style={{ "--gantt-row-color": scheduleRowColor(section), "--gantt-row-ink": scheduleRowInk(section) } as React.CSSProperties}>
            <div className="gantt-label"><input aria-label={`Nome riga ${index + 1}`} placeholder="Nome riga" required maxLength={200} value={section.title} onChange={event => change(sections.map(s => s.id === section.id ? { ...s, title: event.target.value } : s))} />
              <div className="gantt-row-actions"><button type="button" className="text-link" aria-label={`Sposta su riga ${index + 1}`} disabled={!index} onClick={() => change(reorder(sections, index, -1))}>↑</button><button type="button" className="text-link" aria-label={`Sposta giù riga ${index + 1}`} disabled={index === sections.length - 1} onClick={() => change(reorder(sections, index, 1))}>↓</button><button type="button" className="text-link" aria-label={`Elimina riga ${index + 1}`} onClick={() => { if (!section.entries.length || window.confirm("Eliminare la riga e tutti i suoi elementi?")) { change(sections.filter(s => s.id !== section.id)); setSelection(null); } }}>×</button><details><summary aria-label={`Descrizione riga ${index + 1}`}>Descrizione</summary><textarea aria-label={`Testo descrizione riga ${index + 1}`} rows={2} maxLength={4000} value={section.description} onChange={event => change(sections.map(s => s.id === section.id ? { ...s, description: event.target.value } : s))} /></details></div>
              <label className="gantt-row-color"><input type="color" aria-label={`Colore riga ${index + 1}`} value={scheduleRowColor(section)} onChange={e => change(sections.map(s => s.id === section.id ? { ...s, color: e.target.value } : s))} /><span>Colore</span></label>
            </div>
            <div className="gantt-track gantt-draw-track" aria-label={`Calendario ${section.title}`} style={{ minHeight: Math.max(82, count * 32 + 36) }} onPointerDown={e => startGesture(e, section.id, "CREATE")} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={() => { gesture.current = null; setPreview(null); }}>
              <ScheduleGrid viewport={viewport} />
              {entries.map(entry => {
                const milestone = entry.type !== "ACTIVITY";
                const selectedHere = selection?.entryId === entry.id;
                const startX = viewport.dateX(entry.startDate);
                const width = (scheduleDaysBetween(entry.startDate, entry.endDate) + 1) * viewport.px;
                const visible = startX + width >= viewport.left - 30 && startX <= viewport.left + (viewport.scrollRef.current?.clientWidth ?? 1200);
                if (!visible) return null;
                return <button key={entry.id} type="button" data-entry-id={entry.id} className={`gantt-draw-item ${milestone ? `gantt-draw-milestone ${entry.type === "INTERMEDIATE_MILESTONE" ? "gantt-draw-intermediate" : ""}` : "gantt-draw-bar"} gantt-status-${entry.status.toLowerCase()} ${selectedHere ? "is-selected" : ""}`} aria-label={`${scheduleTypes[entry.type]}: ${entry.title}`} title={`${entry.title} · ${formatScheduleDate(entry.startDate)}${milestone ? "" : ` – ${formatScheduleDate(entry.endDate)}`}`} style={{ left: startX + (milestone ? viewport.px / 2 : 0), width: milestone ? 20 : Math.max(8, width), top: (milestone ? 42.5 : 40) + (lanes.get(entry.id) ?? 0) * 32 }} onPointerDown={e => startGesture(e, section.id, "MOVE", entry)} onClick={() => { if (tool === "ACTIVITY" || entry.type !== "ACTIVITY") setSelection({ sectionId: section.id, entryId: entry.id }); }}>
                  {milestone ? <span className="gantt-draw-diamond" /> : <><span className="gantt-resize-handle gantt-resize-start" aria-hidden="true" onPointerDown={e => startGesture(e, section.id, "START", entry)} /><span className="gantt-draw-title" style={{ marginLeft: Math.max(10, viewport.left - startX + 10) }}>{entry.title}</span><span className="gantt-resize-handle gantt-resize-end" aria-hidden="true" onPointerDown={e => startGesture(e, section.id, "END", entry)} /></>}
                </button>;
              })}
            </div>
          </div>;
        })}
        <div className="gantt-row gantt-add-row"><div className="gantt-label"><button type="button" className="mobile-button-secondary" onClick={() => change([...sections, { id: crypto.randomUUID(), title: `Riga ${sections.length + 1}`, description: "", entries: [] }])}>+ Nuova riga</button></div><div className="gantt-track"><ScheduleGrid viewport={viewport} /></div></div>
      </div></div>
      {preview && <p className="gantt-drag-feedback" role="status">{preview.current.title}: {formatScheduleDate(preview.current.startDate)}{preview.current.type === "ACTIVITY" ? ` – ${formatScheduleDate(preview.current.endDate)}` : ""}</p>}
      {selected && selectedSection && <section className="gantt-item-inspector" aria-label="Dettagli elemento selezionato"><div className="gantt-inspector-heading"><strong>Elemento selezionato</strong><button type="button" className="text-link" onClick={() => setSelection(null)}>Chiudi dettagli</button></div>
        <div className="gantt-entry-fields"><label><span>Titolo</span><input required maxLength={200} value={selected.title} onChange={e => entryField(selectedSection.id, selected.id, { title: e.target.value })} /></label><label><span>Tipo</span><select value={selected.type} onChange={e => entryField(selectedSection.id, selected.id, { type: e.target.value as ScheduleEntry["type"], ...(e.target.value !== "ACTIVITY" ? { endDate: selected.startDate } : {}) })}>{Object.entries(scheduleTypes).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label><span>{selected.type === "ACTIVITY" ? "Inizio" : "Data milestone"}</span><input required type="date" value={selected.startDate} max={selected.type === "ACTIVITY" ? selected.endDate : undefined} onChange={e => entryField(selectedSection.id, selected.id, { startDate: e.target.value, ...(selected.type !== "ACTIVITY" ? { endDate: e.target.value } : {}) })} /></label>{selected.type === "ACTIVITY" && <label><span>Fine</span><input required type="date" value={selected.endDate} min={selected.startDate} onChange={e => entryField(selectedSection.id, selected.id, { endDate: e.target.value })} /></label>}<label><span>Stato</span><select value={selected.status} onChange={e => entryField(selectedSection.id, selected.id, { status: e.target.value as ScheduleEntry["status"] })}>{Object.entries(scheduleStatuses).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label></div>
        <label className="gantt-entry-description"><span>Descrizione elemento</span><textarea rows={2} maxLength={4000} value={selected.description} onChange={e => entryField(selectedSection.id, selected.id, { description: e.target.value })} /></label><button type="button" className="text-link" onClick={() => { change(sections.map(s => s.id === selectedSection.id ? { ...s, entries: s.entries.filter(e => e.id !== selected.id) } : s)); setSelection(null); }}>Elimina elemento</button>
      </section>}
      <div className="gantt-editor-actions"><button className="button" disabled={!dirty || busy || !plan}>{busy ? "Salvataggio…" : "Salva pianificazione"}</button><button type="button" className="mobile-button-secondary" onClick={reload}>Ricarica piano</button><details className="gantt-keyboard-add"><summary>Inserisci con date</summary><p>Puoi anche aggiungere un elemento senza trascinare.</p><div className="gantt-row-actions">{sections.map(section => <button type="button" key={section.id} className="mobile-button-secondary" onClick={() => { const entry = newEntry(section.id, viewport.view.start); change(sections.map(s => s.id === section.id ? { ...s, entries: [...s.entries, entry] } : s)); setSelection({ sectionId: section.id, entryId: entry.id }); }}>Aggiungi in {section.title}</button>)}</div></details></div>
    </fieldset></form>
    {plan?.updatedAt && <small className="gantt-saved-meta">Aggiornato il {new Date(plan.updatedAt).toLocaleString("it-IT")} · {plan.updatedBy}</small>}
  </details>;
}
