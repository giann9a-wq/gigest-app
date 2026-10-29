"use client";
import { useMemo } from "react";
import Link from "next/link";
import type { Route } from "next";
import { formatScheduleDate, scheduleEntryLanes, scheduleOverlaps, scheduleRange, scheduleRowColor, scheduleStatuses, scheduleTypes, type ScheduleJob } from "@/lib/job-order-schedule-data";
import { ScheduleAxis, ScheduleGrid, ScheduleViewportToolbar, scheduleDaysBetween, useScheduleViewport } from "./use-schedule-viewport";
import { SchedulePdfButton } from "./schedule-pdf-button";

export function ScheduleTimeline({ jobs, expandJobs = false, showEditLinks = true }: { jobs: ScheduleJob[]; expandJobs?: boolean; showEditLinks?: boolean }) {
  const sections = useMemo(() => jobs.flatMap(job => job.sections), [jobs]);
  const viewport = useScheduleViewport(sections);
  const visibleJobs = jobs.filter(job => scheduleOverlaps(job.sections, viewport.view));
  return <div className="gantt-view gantt-scrolling-view gantt-compact-dashboard" aria-label="Diagramma Gantt delle commesse">
    <ScheduleViewportToolbar viewport={viewport}><SchedulePdfButton url={`/api/gantt/pdf?start=${viewport.view.start}&end=${viewport.view.end}`} disabled={!visibleJobs.length || !viewport.ready} /></ScheduleViewportToolbar>
    <div className="gantt-compact-caption"><span aria-live="polite">{visibleJobs.length} commesse nel periodo</span><span>◆ Milestone · ◇ Intermedia · Scorri per altre date</span></div>
    <div ref={viewport.scrollRef} onScroll={viewport.onScroll} className="gantt-scroll gantt-continuous-scroll" role="region" tabIndex={0} aria-label="Linea del tempo scorribile"><div className="gantt-board" style={viewport.boardStyle}>
      <ScheduleAxis viewport={viewport} label="Commessa / attività" />
      {visibleJobs.map(job => { const range = scheduleRange(job.sections)!; return <details className="gantt-job" key={job.id} open={expandJobs || undefined}>
        <summary className="gantt-row gantt-job-summary"><div className="gantt-label"><strong><span className="gantt-expand" aria-hidden="true">›</span>{job.name}</strong><small>{formatScheduleDate(range.start)} – {formatScheduleDate(range.end)}{showEditLinks && <Link className="text-link gantt-inline-edit" href={`/commesse/${job.id}?tab=data#gantt-pianificazione` as Route} onClick={e => e.stopPropagation()}>Modifica ↗</Link>}</small></div><div className="gantt-track"><ScheduleGrid viewport={viewport} /><span className="gantt-bar gantt-bar-job" style={{ left: viewport.dateX(range.start), width: (scheduleDaysBetween(range.start, range.end) + 1) * viewport.px }} /></div></summary>
        <div className="gantt-job-content">{job.sections.filter(section => scheduleOverlaps([section], viewport.view)).map(section => {
          const { lanes, count } = scheduleEntryLanes(section.entries);
          const rowRange = scheduleRange([section])!;
          return <div className="gantt-row gantt-entry-row gantt-activity-row" key={section.id} style={{ "--gantt-row-color": scheduleRowColor(section) } as React.CSSProperties}>
            <div className="gantt-label" title={section.description || section.title}><strong><i className="gantt-row-swatch" />{section.title}</strong><small>{formatScheduleDate(rowRange.start)} – {formatScheduleDate(rowRange.end)}</small></div>
            <div className="gantt-track" style={{ minHeight: Math.max(40, count * 24 + 16) }}><ScheduleGrid viewport={viewport} />
              {section.entries.filter(e => e.startDate <= viewport.view.end && e.endDate >= viewport.view.start).map(entry => {
                const milestone = entry.type !== "ACTIVITY";
                const label = `${scheduleTypes[entry.type]} · ${entry.title} · ${formatScheduleDate(entry.startDate)}${milestone ? "" : ` – ${formatScheduleDate(entry.endDate)}`} · ${scheduleStatuses[entry.status]}${entry.description ? ` · ${entry.description}` : ""}`;
                return <span key={entry.id} tabIndex={0} aria-label={label} title={label} className={milestone ? `gantt-diamond ${entry.type === "INTERMEDIATE_MILESTONE" ? "gantt-intermediate" : ""}` : "gantt-bar gantt-bar-activity"} style={{ left: viewport.dateX(entry.startDate) + (milestone ? viewport.px / 2 : 0), ...(milestone ? {} : { width: (scheduleDaysBetween(entry.startDate, entry.endDate) + 1) * viewport.px }), top: 20 + (lanes.get(entry.id) ?? 0) * 24 }} />;
              })}
            </div>
          </div>;
        })}</div>
      </details>; })}
      {!visibleJobs.length && <div className="gantt-row gantt-empty-row"><div className="gantt-label">Nessuna commessa pianificata nel periodo.</div><div className="gantt-track"><ScheduleGrid viewport={viewport} /></div></div>}
    </div></div>
  </div>;
}
