"use client";
import { Fragment, useMemo } from "react";
import Link from "next/link";
import type { Route } from "next";
import { formatScheduleDate, scheduleOverlaps, scheduleRange, scheduleStatuses, scheduleTypes, type ScheduleEntry, type ScheduleJob, type ScheduleRange } from "@/lib/job-order-schedule-data";
import { ScheduleAxis, ScheduleGrid, ScheduleViewportToolbar, scheduleDaysBetween, useScheduleViewport } from "./use-schedule-viewport";

export function ScheduleTimeline({ jobs, expandJobs = false, showEditLinks = true }: { jobs: ScheduleJob[]; expandJobs?: boolean; showEditLinks?: boolean }) {
  const sections = useMemo(() => jobs.flatMap(job => job.sections), [jobs]);
  const viewport = useScheduleViewport(sections);
  // Filter actual activities, not the envelope: a gap between two activities is not planned work.
  const visibleJobs = jobs.filter(job => scheduleOverlaps(job.sections, viewport.view));
  function track(range: ScheduleRange | null, kind: string, entry?: ScheduleEntry) {
    const label = range ? `${formatScheduleDate(range.start)}${range.end !== range.start ? ` – ${formatScheduleDate(range.end)}` : ""}` : "";
    return <div className="gantt-track" aria-label={label}><ScheduleGrid viewport={viewport} />
      {range && (entry && entry.type !== "ACTIVITY" ? <span className={`gantt-diamond ${entry.type === "INTERMEDIATE_MILESTONE" ? "gantt-intermediate" : ""} gantt-status-${entry.status.toLowerCase()}`} style={{ left: viewport.dateX(range.start) + viewport.px / 2 }} title={`${scheduleTypes[entry.type]} · ${entry.title} · ${label}`} />
        : <span className={`gantt-bar gantt-bar-${kind}${entry ? ` gantt-status-${entry.status.toLowerCase()}` : ""}`} style={{ left: viewport.dateX(range.start), width: (scheduleDaysBetween(range.start, range.end) + 1) * viewport.px }} title={label} />)}
    </div>;
  }
  return <div className="gantt-view gantt-scrolling-view" aria-label="Diagramma Gantt delle commesse">
    <ScheduleViewportToolbar viewport={viewport} />
    <div className="gantt-legend"><span><i className="gantt-legend-activity" />Attività</span><span><i className="gantt-legend-milestone" />Milestone</span><span><i className="gantt-legend-intermediate" />Milestone intermedia</span><span><i className="gantt-legend-today" />Oggi</span></div>
    <p className="gantt-visible-count" aria-live="polite">{visibleJobs.length} commesse nel periodo · Scorri lateralmente per esplorare altre date.</p>
    <div ref={viewport.scrollRef} onScroll={viewport.onScroll} className="gantt-scroll gantt-continuous-scroll" role="region" tabIndex={0} aria-label="Linea del tempo scorribile"><div className="gantt-board" style={viewport.boardStyle}>
      <ScheduleAxis viewport={viewport} label="Commessa / attività" />
      {visibleJobs.map(job => { const range = scheduleRange(job.sections)!; return <details className="gantt-job" key={job.id} open={expandJobs || undefined}>
        <summary className="gantt-row gantt-job-summary"><div className="gantt-label"><strong><span className="gantt-expand" aria-hidden="true">›</span>{job.name}</strong><small>{formatScheduleDate(range.start)} – {formatScheduleDate(range.end)}</small></div>{track(range, "job")}</summary>
        <div className="gantt-job-content">
          {showEditLinks && <div className="gantt-row gantt-edit-row"><div className="gantt-label"><Link className="text-link" href={`/commesse/${job.id}?tab=data#gantt-pianificazione` as Route}>Apri pianificazione →</Link></div><div /></div>}
          {job.sections.filter(section => scheduleOverlaps([section], viewport.view)).map(section => <Fragment key={section.id}><div className="gantt-row gantt-section-row"><div className="gantt-label"><strong>{section.title}</strong>{section.description && <small>{section.description}</small>}</div>{track(scheduleRange([section]), "section")}</div>{section.entries.filter(entry => entry.startDate <= viewport.view.end && entry.endDate >= viewport.view.start).map(entry => <div className="gantt-row gantt-entry-row" key={entry.id}><div className="gantt-label"><span>{entry.title}</span><small>{scheduleTypes[entry.type]} · {scheduleStatuses[entry.status]} · {formatScheduleDate(entry.startDate)}{entry.endDate !== entry.startDate ? ` – ${formatScheduleDate(entry.endDate)}` : ""}</small>{entry.description && <small>{entry.description}</small>}</div>{track({ start: entry.startDate, end: entry.endDate }, "activity", entry)}</div>)}</Fragment>)}
        </div>
      </details>; })}
      {!visibleJobs.length && <div className="gantt-row gantt-empty-row"><div className="gantt-label">Nessuna commessa pianificata nel periodo.</div><div className="gantt-track"><ScheduleGrid viewport={viewport} /></div></div>}
    </div></div>
  </div>;
}
