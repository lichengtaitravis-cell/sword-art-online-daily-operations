'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { DashboardCampaignScale } from './LifeDashboard';

export type OverviewCalendarTone = 'yellow' | 'green' | 'purple' | 'blue' | 'orange';
export type OverviewCalendarMarker = 'pin' | 'check' | 'cancel';

export type OverviewCalendarDay = {
  id: string;
  day: number;
  dateLabel: string;
  future: boolean;
  selected: boolean;
  outsideMonth: boolean;
  value: string;
  unit: string;
  marker?: OverviewCalendarMarker;
  markerCount?: number;
  detail: string;
  intensity: number;
};

export type OverviewCalendarPanel = {
  id: string;
  label: string;
  cells: (OverviewCalendarDay | null)[];
};

export type OverviewCalendarTrend = {
  title: string;
  values: { id: string; label: string; value: number | null; displayValue: string }[];
};

export type OverviewCalendarDrilldownData = {
  index: string;
  title: string;
  periodLabel: string;
  metric: string;
  metricLabel: string;
  dayActionLabel: string;
  formula: string;
  accent: OverviewCalendarTone;
  scale: DashboardCampaignScale;
  panels: OverviewCalendarPanel[];
  trend?: OverviewCalendarTrend;
};

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function trendGeometry(trend: OverviewCalendarTrend) {
  const validValues = trend.values.map((item) => item.value).filter((value): value is number => value !== null);
  const maxValue = Math.max(1, ...validValues);
  const points = trend.values.map((item, index) => ({
    ...item,
    x: trend.values.length === 1 ? 500 : 28 + index * 944 / Math.max(1, trend.values.length - 1),
    y: item.value === null ? null : 108 - item.value / maxValue * 80,
  }));
  let path = '';
  let segmentOpen = false;
  points.forEach((point) => {
    if (point.y === null) {
      segmentOpen = false;
      return;
    }
    path += `${segmentOpen ? ' L' : ' M'} ${point.x} ${point.y}`;
    segmentOpen = true;
  });
  const validIndexes = points.flatMap((point, index) => point.y === null ? [] : [index]);
  return { points, path, firstValidIndex: validIndexes[0] ?? -1, lastValidIndex: validIndexes.at(-1) ?? -1 };
}

export function DashboardCalendarDrilldown({ data, onClose, onDaySelect }: { data: OverviewCalendarDrilldownData; onClose: () => void; onDaySelect: (dayKey: string) => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [highlightedDayId, setHighlightedDayId] = useState<string | null>(null);
  const trend = data.trend ? trendGeometry(data.trend) : null;
  const highlightedPoint = trend?.points.find((point) => point.id === highlightedDayId && point.y !== null) ?? null;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    const closeOnKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', closeOnKeyDown);
    return () => window.removeEventListener('keydown', closeOnKeyDown);
  }, [onClose]);

  return <div className="dashboard-calendar-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className={`dashboard-calendar-drilldown calendar-${data.accent} calendar-scale-${data.scale}`} role="dialog" aria-modal="true" aria-labelledby="dashboard-calendar-title">
      <header>
        <div><span>{data.index} / CAMPAIGN CALENDAR</span><h2 id="dashboard-calendar-title">{data.title}</h2><p>{data.periodLabel}</p></div>
        <div className="calendar-headline"><strong>{data.metric}</strong><span>{data.metricLabel}</span></div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭战役日历">×</button>
      </header>
      <div className="calendar-formula"><span>FIELD RULE</span><strong>{data.formula}</strong></div>
      <div className="calendar-scroll-region">
        {data.trend && trend && <section className="overview-daily-trend" aria-label={data.trend.title}>
          <header><span>DAILY SIGNAL / 每日趋势</span><strong>{data.trend.title}</strong></header>
          <div>
            <svg viewBox="0 0 1000 132" preserveAspectRatio="none" role="img" aria-label={data.trend.title}>
              <path className="trend-grid" d="M28 28H972M28 68H972M28 108H972" />
              {trend.path && <path className="trend-keyline" d={trend.path} />}
              {trend.path && <path className="trend-signal" d={trend.path} />}
              {trend.points.map((point, index) => point.y !== null ? <g key={point.id} className={`trend-point-group ${highlightedDayId === point.id ? 'is-active' : ''}`} tabIndex={0} aria-label={`${point.label} · ${point.displayValue}`} onMouseEnter={() => setHighlightedDayId(point.id)} onMouseLeave={() => setHighlightedDayId((current) => current === point.id ? null : current)} onFocus={() => setHighlightedDayId(point.id)} onBlur={() => setHighlightedDayId((current) => current === point.id ? null : current)}>
                <circle className="trend-point-hit" cx={point.x} cy={point.y} r={data.trend!.values.length > 31 ? 7 : 10} />
                <circle className={`trend-point ${data.trend!.values.length <= 31 || index % 7 === 0 || index === trend.firstValidIndex || index === trend.lastValidIndex ? 'is-visible' : ''}`} cx={point.x} cy={point.y} r={data.trend!.values.length > 31 ? 3.5 : 5} />
              </g> : null)}
            </svg>
            {highlightedPoint && <div className="trend-link-tooltip" role="status" style={{ left: `${highlightedPoint.x / 10}%`, top: `${Math.max(8, (highlightedPoint.y ?? 108) / 132 * 100)}%` }}><span>{highlightedPoint.label}</span><strong>{highlightedPoint.displayValue}</strong></div>}
            <footer><span>{data.trend.values[0]?.label}</span><strong>DAY BY DAY</strong><span>{data.trend.values.at(-1)?.label}</span></footer>
          </div>
        </section>}
        <section className="overview-calendar-archive" aria-label={`${data.title}日历`}>
          <header><span>CALENDAR GRID / 每日记录</span><strong>{data.trend ? 'CALENDAR + TREND' : 'CALENDAR MARKERS'}</strong></header>
          <div className="overview-calendar-panels">
            {data.panels.map((panel) => <section key={panel.id} className="overview-calendar-panel">
              <header><strong>{panel.label}</strong><span>STANDARD MONTH</span></header>
              <div className="overview-weekday-row">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
              <div className="overview-calendar-grid">{panel.cells.map((day, index) => day ? <button type="button" key={`${panel.id}-${day.id}`} className={`overview-calendar-day ${day.future ? 'is-future' : ''} ${day.selected ? 'is-selected' : ''} ${day.outsideMonth ? 'is-outside-month' : ''} ${day.value || day.marker ? 'has-signal' : ''} ${day.selected && highlightedDayId === day.id ? 'is-linked' : ''}`} style={{ '--day-intensity': day.intensity } as CSSProperties} title={day.detail} aria-label={`${day.detail}，${data.dayActionLabel}`} onClick={() => onDaySelect(day.id)} onMouseEnter={() => { if (day.selected) setHighlightedDayId(day.id); }} onMouseLeave={() => setHighlightedDayId((current) => current === day.id ? null : current)} onFocus={() => { if (day.selected) setHighlightedDayId(day.id); }} onBlur={() => setHighlightedDayId((current) => current === day.id ? null : current)}>
                <time dateTime={day.id}>{String(day.day).padStart(2, '0')}</time>
                {day.marker === 'pin' && <span className="calendar-pin" aria-hidden="true"><i /><b /></span>}
                {day.marker === 'check' && <span className="calendar-check" aria-hidden="true">✓</span>}
                {day.marker === 'cancel' && <span className="calendar-cancel" aria-hidden="true">×</span>}
                {day.value && <strong>{day.value}<small>{day.unit}</small></strong>}
                {day.markerCount && day.markerCount > 1 ? <em>×{day.markerCount}</em> : null}
              </button> : <i className="calendar-void" aria-hidden="true" key={`void-${index}`} />)}</div>
            </section>)}
          </div>
        </section>
      </div>
      <footer><span>ESC / CLICK OUTSIDE TO CLOSE</span><button type="button" onClick={onClose}>CLOSE CALENDAR</button></footer>
    </section>
  </div>;
}
