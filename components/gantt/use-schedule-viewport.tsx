"use client";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { addScheduleDays, formatScheduleDate, initialScheduleWindow, scheduleDay, scheduleRange, type ScheduleSection } from "@/lib/job-order-schedule-data";

export const scheduleDaysBetween = (start: string, end: string) => Math.round((scheduleDay(end) - scheduleDay(start)) / 86400000);
export function useScheduleViewport(sections: ScheduleSection[]) {
  const today = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date()), []);
  const domain = useMemo(() => {
    const range = scheduleRange(sections);
    const year = Number(today.slice(0, 4));
    const start = `${year - 20}-01-01`, end = `${year + 40}-12-31`;
    return { start: range && range.start < start ? addScheduleDays(range.start, -365) : start, end: range && range.end > end ? addScheduleDays(range.end, 365) : end };
  }, [sections, today]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [scale, setScale] = useState(0);
  const [left, setLeft] = useState(0);
  const pendingScroll = useRef<number | null>(null);
  const previousDomain = useRef(domain.start);
  const labelWidth = width > 0 && width < 650 ? 160 : 250;
  const timeWidth = Math.max(100, width - labelWidth);
  const px = scale || 8;
  const totalDays = scheduleDaysBetween(domain.start, domain.end) + 1;
  const timelineWidth = totalDays * px;
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setWidth(entry.contentRect.width); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!width || scale) return;
    const view = initialScheduleWindow(today);
    const next = timeWidth / (scheduleDaysBetween(view.start, view.end) + 1);
    pendingScroll.current = scheduleDaysBetween(domain.start, view.start) * next;
    setScale(next);
  }, [width, scale, timeWidth, today, domain.start]);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || !scale) return;
    if (previousDomain.current !== domain.start && pendingScroll.current === null) {
      pendingScroll.current = element.scrollLeft + scheduleDaysBetween(domain.start, previousDomain.current) * scale;
    }
    previousDomain.current = domain.start;
    if (pendingScroll.current !== null) {
      element.scrollLeft = pendingScroll.current;
      pendingScroll.current = null;
      setLeft(element.scrollLeft);
    }
  }, [scale, width, domain.start]);
  const startIndex = Math.round(left / px);
  const endIndex = Math.round((left + timeWidth) / px) - 1;
  const view = { start: addScheduleDays(domain.start, startIndex), end: addScheduleDays(domain.start, Math.min(totalDays - 1, endIndex)) };
  const dateX = useCallback((date: string) => scheduleDaysBetween(domain.start, date) * px, [domain.start, px]);
  const dateAt = (x: number) => addScheduleDays(domain.start, Math.max(0, Math.min(totalDays - 1, Math.floor(x / px))));
  function setZoom(next: number) {
    const nextScale = Math.max(0.25, Math.min(64, next));
    const currentLeft = scrollRef.current?.scrollLeft ?? left;
    pendingScroll.current = Math.max(0, ((currentLeft + timeWidth / 2) / px) * nextScale - timeWidth / 2);
    setScale(nextScale);
  }
  function goToday() {
    const nextView = initialScheduleWindow(today);
    const next = timeWidth / (scheduleDaysBetween(nextView.start, nextView.end) + 1);
    const nextLeft = dateX(nextView.start) / px * next;
    if (next === scale && scrollRef.current) { scrollRef.current.scrollLeft = nextLeft; setLeft(scrollRef.current.scrollLeft); }
    else { pendingScroll.current = nextLeft; setScale(next); }
  }
  function fit() {
    const range = scheduleRange(sections);
    if (!range) { goToday(); return; }
    const start = addScheduleDays(range.start, -7), end = addScheduleDays(range.end, 7);
    const next = Math.max(0.25, Math.min(64, timeWidth / (scheduleDaysBetween(start, end) + 1)));
    const nextLeft = scheduleDaysBetween(domain.start, start) * next;
    if (next === scale && scrollRef.current) { scrollRef.current.scrollLeft = nextLeft; setLeft(scrollRef.current.scrollLeft); }
    else { pendingScroll.current = nextLeft; setScale(next); }
  }
  function pan(direction: number) { scrollRef.current?.scrollBy({ left: direction * timeWidth * 0.8, behavior: "smooth" }); }
  const tickStep = px >= 24 ? 1 : px >= 9 ? 7 : px >= 2 ? 14 : Math.ceil(90 / px / 30) * 30;
  const ticks = [];
  for (let i = Math.max(0, Math.floor(startIndex / tickStep) * tickStep); i <= Math.min(totalDays, endIndex + tickStep); i += tickStep) {
    const date = addScheduleDays(domain.start, i);
    ticks.push({ date, x: i * px, label: new Date(scheduleDay(date)).toLocaleDateString("it-IT", { timeZone: "UTC", ...(px < 1 ? { month: "short", year: "numeric" } : { day: "2-digit", month: "short", year: "2-digit" }) }) });
  }
  return { scrollRef, today, domain, view, px, left, labelWidth, timelineWidth, ticks, dateX, dateAt, setZoom, pan, goToday, fit, ready: !!scale,
    onScroll: () => setLeft(scrollRef.current?.scrollLeft ?? 0),
    boardStyle: { width: labelWidth + timelineWidth, "--gantt-label-width": `${labelWidth}px` } as React.CSSProperties };
}
export type ScheduleViewport = ReturnType<typeof useScheduleViewport>;
export function ScheduleViewportToolbar({ viewport, children }: { viewport: ScheduleViewport; children?: React.ReactNode }) {
  return <><div className="gantt-toolbar"><div className="gantt-period-controls">
    <button type="button" className="mobile-button-secondary" aria-label="Periodo precedente" onClick={() => viewport.pan(-1)}>←</button>
    <button type="button" className="mobile-button-secondary" onClick={viewport.goToday}>Oggi</button>
    <button type="button" className="mobile-button-secondary" aria-label="Periodo successivo" onClick={() => viewport.pan(1)}>→</button>
    <button type="button" className="mobile-button-secondary" onClick={viewport.fit}>Tutto il piano</button>
    <button type="button" className="mobile-button-secondary" aria-label="Comprimi asse temporale" onClick={() => viewport.setZoom(viewport.px / 1.5)}>−</button>
    <label className="gantt-zoom">Scala temporale<input type="range" aria-label="Scala temporale" min="0" max="100" value={Math.max(0, Math.min(100, Math.log(viewport.px / 0.25) / Math.log(256) * 100))} onChange={e => viewport.setZoom(0.25 * Math.pow(256, Number(e.target.value) / 100))} /></label>
    <button type="button" className="mobile-button-secondary" aria-label="Dilata asse temporale" onClick={() => viewport.setZoom(viewport.px * 1.5)}>+</button>{children}
  </div><span className="gantt-range-label" aria-live="polite">{viewport.ready ? `${formatScheduleDate(viewport.view.start)} – ${formatScheduleDate(viewport.view.end)}` : "Caricamento periodo…"}</span></div></>;
}
export function ScheduleAxis({ viewport, label }: { viewport: ScheduleViewport; label: React.ReactNode }) {
  return <div className="gantt-row gantt-axis-row"><div className="gantt-label">{label}</div><div className="gantt-axis">{viewport.ticks.map(t => <span key={t.date} style={{ left: t.x }}>{t.label}</span>)}</div></div>;
}
export function ScheduleGrid({ viewport }: { viewport: ScheduleViewport }) {
  return <><div className="gantt-grid-lines" aria-hidden="true">{viewport.ticks.map(t => <span key={t.date} style={{ left: t.x }} />)}</div><span className="gantt-today-line" style={{ left: viewport.dateX(viewport.today) + viewport.px / 2 }} aria-hidden="true" /></>;
}
