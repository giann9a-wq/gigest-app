"use client";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { addScheduleDays, formatScheduleDate, scheduleDay, schedulePosition, scheduleRange, scheduleStatuses, scheduleTypes, type ScheduleEntry, type ScheduleJob, type ScheduleRange } from "@/lib/job-order-schedule-data";

const dayMs = 86400000;
const jobStatuses: Record<string, string> = { ACTIVE: "Attiva", SUSPENDED: "Sospesa", COMPLETED: "Conclusa", ENDED: "Estinta" };
function monthStart(date: string, offset = 0) { const d = new Date(scheduleDay(date)); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1)).toISOString().slice(0, 10); }
function getView(jobs: ScheduleJob[], mode: string, anchor: string): ScheduleRange {
  if (mode === "FIT") {
    const ranges = jobs.flatMap(job => { const r = scheduleRange(job.sections); return r ? [r] : []; });
    return ranges.length ? { start: addScheduleDays(ranges.reduce((a, r) => r.start < a ? r.start : a, ranges[0].start), -7), end: addScheduleDays(ranges.reduce((a, r) => r.end > a ? r.end : a, ranges[0].end), 7) }
      : { start: monthStart(anchor), end: addScheduleDays(monthStart(anchor, 3), -1) };
  }
  if (mode === "YEAR") return { start: `${anchor.slice(0, 4)}-01-01`, end: `${anchor.slice(0, 4)}-12-31` };
  const start = mode === "QUARTER" ? new Date(Date.UTC(Number(anchor.slice(0, 4)), Math.floor((Number(anchor.slice(5, 7)) - 1) / 3) * 3, 1)).toISOString().slice(0, 10) : monthStart(anchor);
  return { start, end: addScheduleDays(monthStart(start, mode === "QUARTER" ? 3 : 1), -1) };
}
function getTicks(view: ScheduleRange) {
  const count = (scheduleDay(view.end) - scheduleDay(view.start)) / dayMs + 1;
  const dates: string[] = [];
  if (count <= 62) {
    for (let day = view.start; day <= view.end; day = addScheduleDays(day, 7)) dates.push(day);
  } else {
    const months = Math.ceil(count / 30); const step = Math.max(1, Math.ceil(months / 9));
    let date = monthStart(view.start); if (date < view.start) date = monthStart(date, 1);
    for (; date <= view.end; date = monthStart(date, step)) dates.push(date);
  }
  if (!dates.length) dates.push(view.start);
  return dates.map(date => ({ date, left: (scheduleDay(date) - scheduleDay(view.start)) / dayMs / count * 100,
    label: new Date(scheduleDay(date)).toLocaleDateString("it-IT", { timeZone: "UTC", ...(count <= 62 ? { day: "2-digit", month: "2-digit" } : { month: "short", year: "numeric" }) }) }));
}

export function ScheduleTimeline({ jobs, expandJobs = false, showEditLinks = true }: { jobs: ScheduleJob[]; expandJobs?: boolean; showEditLinks?: boolean }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  const [mode, setMode] = useState("FIT"); const [anchor, setAnchor] = useState(today);
  const view = useMemo(() => getView(jobs, mode, anchor), [jobs, mode, anchor]);
  const ticks = getTicks(view);
  const todayPosition = schedulePosition({ start: today, end: today }, view);
  const planned = jobs.filter(job => scheduleRange(job.sections)).length;
  function move(direction: number) { setAnchor(mode === "YEAR" ? monthStart(anchor, direction * 12) : monthStart(anchor, direction * (mode === "QUARTER" ? 3 : 1))); }
  function track(range: ScheduleRange | null, kind: string, entry?: ScheduleEntry) {
    const position = range ? schedulePosition(range, view) : null;
    const label = range ? `${formatScheduleDate(range.start)}${range.end !== range.start ? ` – ${formatScheduleDate(range.end)}` : ""}` : "Da pianificare";
    return <div className="gantt-track" aria-label={label}>
      <div className="gantt-grid-lines" aria-hidden="true">{ticks.map(t => <span key={t.date} style={{ left: `${t.left}%` }} />)}</div>
      {todayPosition && <span className="gantt-today-line" style={{ left: `${todayPosition.left + todayPosition.width / 2}%` }} aria-hidden="true" />}
      {position ? entry && entry.type !== "ACTIVITY" ? <span className={`gantt-diamond ${entry.type === "INTERMEDIATE_MILESTONE" ? "gantt-intermediate" : ""} gantt-status-${entry.status.toLowerCase()}`} style={{ left: `${position.left + position.width / 2}%` }} title={`${scheduleTypes[entry.type]} · ${entry.title} · ${label}`} />
        : <span className={`gantt-bar gantt-bar-${kind}${entry ? ` gantt-status-${entry.status.toLowerCase()}` : ""}`} style={{ left: `${position.left}%`, width: `${position.width}%` }} title={label} />
        : <span className="gantt-no-bar">{range ? "Fuori intervallo" : "Da pianificare"}</span>}
    </div>;
  }
  return <div className="gantt-view" aria-label="Diagramma Gantt delle commesse">
    <div className="gantt-toolbar"><div className="gantt-period-controls"><label>Intervallo<select aria-label="Intervallo Gantt" value={mode} onChange={e => setMode(e.target.value)}><option value="FIT">Tutto il piano</option><option value="MONTH">Mese</option><option value="QUARTER">Trimestre</option><option value="YEAR">Anno</option></select></label><button type="button" className="mobile-button-secondary" disabled={mode === "FIT"} aria-label="Periodo precedente" onClick={() => move(-1)}>←</button><button type="button" className="mobile-button-secondary" onClick={() => { setMode("MONTH"); setAnchor(today); }}>Oggi</button><button type="button" className="mobile-button-secondary" disabled={mode === "FIT"} aria-label="Periodo successivo" onClick={() => move(1)}>→</button></div><span className="gantt-range-label" aria-live="polite">{formatScheduleDate(view.start)} – {formatScheduleDate(view.end)}</span></div>
    <div className="gantt-legend"><span><i className="gantt-legend-activity" />Attività</span><span><i className="gantt-legend-milestone" />Milestone</span><span><i className="gantt-legend-intermediate" />Milestone intermedia</span><span><i className="gantt-legend-today" />Oggi</span></div>
    {!planned && <p className="gantt-empty-note">Nessuna attività ancora pianificata. Inserisci il Gantt in Dati Commessa: le date della riga di sintesi saranno calcolate dal piano.</p>}
    <div className="gantt-scroll" role="region" aria-label="Linea del tempo scorribile"><div className="gantt-board">
      <div className="gantt-row gantt-axis-row"><div className="gantt-label">Commessa / attività</div><div className="gantt-axis">{ticks.map(t => <span key={t.date} style={{ left: `${t.left}%`, transform: t.left > 90 ? "translateX(-100%)" : undefined }}>{t.label}</span>)}</div></div>
      {jobs.map(job => { const range = scheduleRange(job.sections); return <details className="gantt-job" key={job.id} open={expandJobs || undefined}>
        <summary className="gantt-row gantt-job-summary"><div className="gantt-label"><strong><span className="gantt-expand" aria-hidden="true">›</span>{job.name}</strong><small>{range ? `${formatScheduleDate(range.start)} – ${formatScheduleDate(range.end)}` : "Da pianificare"}{jobStatuses[job.status] ? ` · ${jobStatuses[job.status]}` : ""}</small></div>{track(range, "job")}</summary>
        <div className="gantt-job-content">
          {showEditLinks && <p className="gantt-edit-link"><Link className="text-link" href={`/commesse/${job.id}?tab=data#gantt-pianificazione` as Route}>Apri pianificazione commessa →</Link></p>}
          {!job.sections.length && <p className="gantt-empty-job">Nessuna sezione inserita.</p>}
          {job.sections.map(section => <Fragment key={section.id}><div className="gantt-row gantt-section-row"><div className="gantt-label"><strong>{section.title}</strong>{section.description && <small>{section.description}</small>}</div>{track(scheduleRange([section]), "section")}</div>{section.entries.map(entry => <div className="gantt-row gantt-entry-row" key={entry.id}><div className="gantt-label"><span>{entry.title}</span><small>{scheduleTypes[entry.type]} · {scheduleStatuses[entry.status]} · {formatScheduleDate(entry.startDate)}{entry.endDate !== entry.startDate ? ` – ${formatScheduleDate(entry.endDate)}` : ""}</small>{entry.description && <small className="gantt-description">{entry.description}</small>}</div>{track({ start: entry.startDate, end: entry.endDate }, "activity", entry)}</div>)}</Fragment>)}
        </div>
      </details>; })}
      {!jobs.length && <p className="gantt-empty-job">Nessuna commessa disponibile.</p>}
    </div></div>
  </div>;
}
