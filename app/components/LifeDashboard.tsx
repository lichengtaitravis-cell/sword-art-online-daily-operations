'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { DashboardDrilldown, type DashboardDrilldownData, type DrilldownItem, type DrilldownTone } from './DashboardDrilldown';
import type { DeadlineEvent } from '../lib/deadline-store';
import type { SleepRecord } from '../lib/sleep-store';

type DashboardStatus = 'pending' | 'inProgress' | 'completed';
type DashboardTone = 'purple' | 'blue' | 'green' | 'yellow';
type DashboardPriority = 'must' | 'high' | 'medium' | 'low';
export type DashboardCampaignScale = 'week' | 'month' | 'quarter';
type TypeRankMode = 'total' | 'average';
type LoadMode = 'factions' | 'priority';
type FactionTimeMode = 'merged' | 'stacked';
type GraceMinutes = 0 | 30 | 60;

export type DashboardTask = {
  id: string;
  title: string;
  status: DashboardStatus;
  taskType: string;
  priority: DashboardPriority;
  startedAt: string;
  completedAt: string;
  dueAt: string;
  tone: DashboardTone;
};

type LifeDashboardProps = {
  username: string;
  now: Date;
  tasks: DashboardTask[];
  sleepRecords: SleepRecord[];
  deadlineEvents: DeadlineEvent[];
  campaignScale: DashboardCampaignScale;
  selectedPeriodId: string;
  onCampaignWindowChange: (scale: DashboardCampaignScale, periodId: string) => void;
  onNavigate: (view: 'board' | 'table' | 'calendar' | 'sleep') => void;
};

type CampaignPeriod = {
  id: string;
  start: Date;
  end: Date;
  label: string;
  compactLabel: string;
};

type Allocation = {
  label: string;
  tone: DashboardTone;
  minutes: number;
  count: number;
  average: number;
};

const DAY_MS = 24 * 60 * 60_000;
const MINUTE_MS = 60_000;
const PIE_RADIUS = 82;
const PIE_CIRCUMFERENCE = 2 * Math.PI * PIE_RADIUS;
const FACTION_TIME_MODE_SESSION_KEY = 'sao-dashboard-faction-time-mode-v1';
const GRACE_SESSION_KEY = 'sao-dashboard-in-time-grace-v1';
const TONES: DashboardTone[] = ['purple', 'blue', 'green', 'yellow'];
const PRIORITIES: DashboardPriority[] = ['must', 'high', 'medium', 'low'];
const TONE_META: Record<DashboardTone, { label: string; signal: string }> = {
  purple: { label: '深度·建设', signal: 'DEPTH / BUILD' },
  blue: { label: '责任·秩序', signal: 'DUTY / ORDER' },
  green: { label: '生活·维运', signal: 'LIFE / MAINTAIN' },
  yellow: { label: '休整·复原', signal: 'REST / RESTORE' },
};
const SCALE_META: Record<DashboardCampaignScale, { title: string; subtitle: string; trendCount: number }> = {
  week: { title: 'WEEK', subtitle: '周战役', trendCount: 12 },
  month: { title: 'MONTH', subtitle: '月战役', trendCount: 12 },
  quarter: { title: 'QUARTER', subtitle: '季度战役', trendCount: 4 },
};
const PRIORITY_META: Record<DashboardPriority, { label: string; tone: string }> = {
  must: { label: 'MUST', tone: 'priority-must' },
  high: { label: 'HIGH', tone: 'priority-high' },
  medium: { label: 'MID', tone: 'priority-medium' },
  low: { label: 'LOW', tone: 'priority-low' },
};
const PRIORITY_DRILLDOWN_TONE: Record<DashboardPriority, DrilldownTone> = {
  must: 'red',
  high: 'orange',
  medium: 'yellow',
  low: 'muted',
};
const GRACE_OPTIONS: { value: GraceMinutes; label: string; detail: string }[] = [
  { value: 0, label: 'NONE', detail: 'NO GRACE' },
  { value: 30, label: '30M', detail: '30 MIN' },
  { value: 60, label: '1H', detail: '1 HOUR' },
];

function validDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const result = startOfDay(date);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function startOfPeriod(date: Date, scale: DashboardCampaignScale) {
  if (scale === 'week') return startOfWeek(date);
  if (scale === 'month') return new Date(date.getFullYear(), date.getMonth(), 1);
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
}

function advancePeriod(date: Date, scale: DashboardCampaignScale, amount = 1) {
  const result = new Date(date);
  if (scale === 'week') result.setDate(result.getDate() + amount * 7);
  else if (scale === 'month') result.setMonth(result.getMonth() + amount);
  else result.setMonth(result.getMonth() + amount * 3);
  return result;
}

function formatPeriod(start: Date, scale: DashboardCampaignScale) {
  if (scale === 'week') {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const thursday = new Date(start);
    thursday.setDate(thursday.getDate() + 3);
    const isoYear = thursday.getFullYear();
    const weekOne = startOfWeek(new Date(isoYear, 0, 4));
    const week = Math.round((+start - +weekOne) / (7 * DAY_MS)) + 1;
    return {
      label: `${isoYear} W${String(week).padStart(2, '0')} · ${start.getMonth() + 1}/${start.getDate()}—${end.getMonth() + 1}/${end.getDate()}`,
      compactLabel: `${isoYear} W${String(week).padStart(2, '0')}`,
    };
  }
  if (scale === 'month') return { label: `${start.getFullYear()} 年 ${start.getMonth() + 1} 月`, compactLabel: `${start.getFullYear()}/${start.getMonth() + 1}` };
  const quarter = Math.floor(start.getMonth() / 3) + 1;
  return { label: `${start.getFullYear()} Q${quarter} · ${start.getMonth() + 1}—${start.getMonth() + 3} 月`, compactLabel: `${start.getFullYear()} Q${quarter}` };
}

function buildPeriods(earliest: Date, now: Date, scale: DashboardCampaignScale) {
  const periods: CampaignPeriod[] = [];
  let cursor = startOfPeriod(earliest, scale);
  const currentStart = startOfPeriod(now, scale);
  while (+cursor <= +currentStart) {
    const start = new Date(cursor);
    const end = advancePeriod(start, scale);
    const formatted = formatPeriod(start, scale);
    periods.push({ id: dateKey(start), start, end, ...formatted });
    cursor = end;
  }
  return periods;
}

function inPeriod(value: string, period: CampaignPeriod) {
  const date = validDate(value);
  return Boolean(date && +date >= +period.start && +date < +period.end);
}

function trackedInterval(task: DashboardTask, period: CampaignPeriod, now: Date) {
  const taskStart = validDate(task.startedAt);
  if (!taskStart || task.status === 'pending') return null;
  const rawEnd = task.status === 'completed' ? validDate(task.completedAt) : now;
  if (!rawEnd) return null;
  const start = Math.max(+taskStart, +period.start);
  const end = Math.min(+rawEnd, +period.end, +now);
  return end > start ? { start, end } : null;
}

function intervalMinutes(task: DashboardTask, period: CampaignPeriod, now: Date) {
  const interval = trackedInterval(task, period, now);
  return interval ? (interval.end - interval.start) / MINUTE_MS : 0;
}

function mergedToneMinutes(tasks: DashboardTask[], tone: DashboardTone, period: CampaignPeriod, now: Date) {
  const intervals = tasks
    .filter((task) => task.tone === tone)
    .map((task) => trackedInterval(task, period, now))
    .filter((interval): interval is { start: number; end: number } => Boolean(interval))
    .sort((a, b) => a.start - b.start);
  if (!intervals.length) return 0;
  let total = 0;
  let mergedStart = intervals[0].start;
  let mergedEnd = intervals[0].end;
  intervals.slice(1).forEach((interval) => {
    if (interval.start <= mergedEnd) {
      mergedEnd = Math.max(mergedEnd, interval.end);
      return;
    }
    total += mergedEnd - mergedStart;
    mergedStart = interval.start;
    mergedEnd = interval.end;
  });
  return (total + mergedEnd - mergedStart) / MINUTE_MS;
}

function taskOperationalDate(task: DashboardTask) {
  return validDate(task.dueAt) ?? validDate(task.startedAt) ?? validDate(task.completedAt);
}

function taskBelongsToPeriod(task: DashboardTask, period: CampaignPeriod) {
  const date = taskOperationalDate(task);
  return Boolean(date && +date >= +period.start && +date < +period.end);
}

function formatDuration(minutes: number) {
  if (minutes < 1) return '0m';
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return hours ? `${hours}h${rest ? ` ${rest}m` : ''}` : `${rest}m`;
}

function formatMoment(value: string) {
  const date = validDate(value);
  return date ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date) : '未记录';
}

function taskStatusLabel(status: DashboardStatus) {
  if (status === 'completed') return 'CLEARED';
  if (status === 'inProgress') return 'IN PROGRESS';
  return 'PENDING';
}

function isDeadlineExtension(event: DeadlineEvent) {
  const oldDueAt = validDate(event.oldDueAt);
  const newDueAt = validDate(event.newDueAt);
  return Boolean(oldDueAt && newDueAt && +newDueAt > +oldDueAt);
}

function completionDeadlineDelta(task: DashboardTask) {
  const completedAt = validDate(task.completedAt);
  const dueAt = validDate(task.dueAt);
  return completedAt && dueAt ? +completedAt - +dueAt : null;
}

function isInTimeCompletion(task: DashboardTask, graceMinutes: GraceMinutes) {
  const delta = completionDeadlineDelta(task);
  if (delta === null) return false;
  return delta <= graceMinutes * MINUTE_MS;
}

function periodMetrics(period: CampaignPeriod, tasks: DashboardTask[], events: DeadlineEvent[], sleepRecords: SleepRecord[], now: Date, graceMinutes: GraceMinutes) {
  const periodTasks = tasks.filter((task) => taskBelongsToPeriod(task, period));
  const mustTasks = periodTasks.filter((task) => task.priority === 'must');
  const clears = tasks.filter((task) => inPeriod(task.completedAt, period));
  const deadlineClears = clears.filter((task) => validDate(task.dueAt));
  const inTimeCount = deadlineClears.filter((task) => isInTimeCompletion(task, graceMinutes)).length;
  const periodEvents = events.filter((event) => event.priorityAtChange === 'must' && isDeadlineExtension(event) && inPeriod(event.changedAt, period));
  const changedMustIds = new Set(periodEvents.map((event) => event.taskId).filter((id) => mustTasks.some((task) => task.id === id)));
  const trackedTasks = tasks.filter((task) => intervalMinutes(task, period, now) > 0);
  const allocations = new Map<string, Allocation>();
  const toneAllocations = new Map<DashboardTone, Allocation>(TONES.map((tone) => [tone, { label: TONE_META[tone].label, tone, minutes: 0, count: 0, average: 0 }]));
  trackedTasks.forEach((task) => {
    const minutes = intervalMinutes(task, period, now);
    const type = allocations.get(task.taskType) ?? { label: task.taskType, tone: task.tone, minutes: 0, count: 0, average: 0 };
    type.minutes += minutes;
    type.count += 1;
    type.average = type.minutes / type.count;
    allocations.set(task.taskType, type);
    const tone = toneAllocations.get(task.tone)!;
    tone.minutes += minutes;
    tone.count += 1;
    tone.average = tone.minutes / tone.count;
  });
  const sleeps = sleepRecords.filter((record) => inPeriod(record.wakeAt, period));
  const sleepAverage = sleeps.length ? sleeps.reduce((sum, record) => sum + Math.max(0, +new Date(record.wakeAt) - +new Date(record.sleepStartedAt)) / MINUTE_MS, 0) / sleeps.length : null;
  const activeDays = new Set(sleeps.map((record) => dateKey(new Date(record.wakeAt))));
  return {
    taskCount: periodTasks.length,
    mustCount: mustTasks.length,
    clearCount: clears.length,
    inTimeRate: deadlineClears.length ? inTimeCount / deadlineClears.length * 100 : null,
    inTimeCount,
    inTimeSample: deadlineClears.length,
    deadlineChangeRate: mustTasks.length ? changedMustIds.size / mustTasks.length * 100 : null,
    changedMustCount: changedMustIds.size,
    deadlineChangeCount: periodEvents.length,
    activeDays: activeDays.size,
    sleepAverage,
    sleepCount: sleeps.length,
    types: [...allocations.values()].sort((a, b) => b.minutes - a.minutes),
    tones: TONES.map((tone) => toneAllocations.get(tone)!),
  };
}

function buildLoadBuckets(period: CampaignPeriod, scale: DashboardCampaignScale, tasks: DashboardTask[]) {
  const buckets: { key: string; label: string; start: Date; end: Date; total: number; tones: Record<DashboardTone, number>; priorities: Record<DashboardPriority, number> }[] = [];
  const stepDays = scale === 'quarter' ? 7 : 1;
  let cursor = new Date(period.start);
  while (+cursor < +period.end) {
    const start = new Date(cursor);
    const end = new Date(start);
    end.setDate(end.getDate() + stepDays);
    if (+end > +period.end) end.setTime(+period.end);
    const matching = tasks.filter((task) => {
      const date = taskOperationalDate(task);
      return date && +date >= +start && +date < +end;
    });
    buckets.push({
      key: dateKey(start),
      label: scale === 'week' ? new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(start).toUpperCase() : `${start.getMonth() + 1}/${start.getDate()}`,
      start,
      end,
      total: matching.length,
      tones: TONES.reduce((counts, tone) => ({ ...counts, [tone]: matching.filter((task) => task.tone === tone).length }), {} as Record<DashboardTone, number>),
      priorities: PRIORITIES.reduce((counts, priority) => ({ ...counts, [priority]: matching.filter((task) => task.priority === priority).length }), {} as Record<DashboardPriority, number>),
    });
    cursor = end;
  }
  return buckets;
}

function PieChart({ title, subtitle, segments, headingControl, onSegmentSelect }: {
  title: string;
  subtitle: string;
  segments: { id: string; label: string; value: number; color: string }[];
  headingControl?: ReactNode;
  onSegmentSelect: (segment: { id: string; label: string; value: number; color: string }) => void;
}) {
  const [hoveredSegment, setHoveredSegment] = useState<{ label: string; ratio: number; value: number } | null>(null);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const visibleSegments = segments.filter((segment) => segment.value > 0);
  let cursor = 0;
  return <figure className="p4-pie-figure">
    <div className="p4-pie-heading"><span>{subtitle}</span><div><strong>{title}</strong>{headingControl}</div></div>
    <div className="p4-pie-stage">
      <span className="p4-pie-graffiti" aria-hidden="true">{'//// TRUTH! ✦'}</span>
      <div className="p4-pie-disc">
        <svg viewBox="0 0 240 240" role="img" aria-label={title}>
          <circle className="p4-pie-base" cx="120" cy="120" r={PIE_RADIUS} />
          {total > 0 && visibleSegments.map((segment) => {
            const ratio = segment.value / total;
            const dash = Math.max(1, ratio * PIE_CIRCUMFERENCE - 3);
            const offset = -cursor * PIE_CIRCUMFERENCE;
            cursor += ratio;
            const tooltip = { label: segment.label, ratio, value: segment.value };
            return <circle key={segment.id} className={`p4-pie-segment ${hoveredSegment ? hoveredSegment.label === segment.label ? 'is-highlighted' : 'is-muted' : ''}`} cx="120" cy="120" r={PIE_RADIUS} strokeDasharray={`${dash} ${PIE_CIRCUMFERENCE - dash}`} strokeDashoffset={offset} style={{ '--segment-color': segment.color } as CSSProperties} transform="rotate(-90 120 120)" tabIndex={0} aria-label={`${segment.label}，${(ratio * 100).toFixed(1)}%，${formatDuration(segment.value)}，按回车查看明细`} onClick={() => onSegmentSelect(segment)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSegmentSelect(segment); } }} onMouseEnter={() => setHoveredSegment(tooltip)} onMouseLeave={() => setHoveredSegment(null)} onFocus={() => setHoveredSegment(tooltip)} onBlur={() => setHoveredSegment(null)} />;
          })}
        </svg>
      </div>
      {hoveredSegment && <div className="p4-chart-tooltip pie-tooltip" role="status"><span>{hoveredSegment.label}</span><strong>{(hoveredSegment.ratio * 100).toFixed(1)}%</strong><small>{formatDuration(hoveredSegment.value)}</small></div>}
    </div>
    <figcaption>{visibleSegments.slice(0, 8).map((segment) => {
      const tooltip = { label: segment.label, ratio: total ? segment.value / total : 0, value: segment.value };
      return <button type="button" key={segment.id} className={hoveredSegment?.label === segment.label ? 'is-active' : ''} onClick={() => onSegmentSelect(segment)} onMouseEnter={() => setHoveredSegment(tooltip)} onMouseLeave={() => setHoveredSegment(null)} onFocus={() => setHoveredSegment(tooltip)} onBlur={() => setHoveredSegment(null)}><i style={{ background: segment.color }} /><strong>{segment.label}</strong><small>{(tooltip.ratio * 100).toFixed(1)}%</small></button>;
    })}</figcaption>
  </figure>;
}

function MetricTrend({ title, values, tone, onPointSelect }: { title: string; values: { label: string; value: number | null; period: CampaignPeriod }[]; tone: 'yellow' | 'orange'; onPointSelect: (period: CampaignPeriod) => void }) {
  const [hoveredPoint, setHoveredPoint] = useState<{ label: string; value: number; x: number; y: number } | null>(null);
  const points = values.reduce<{ label: string; value: number; x: number; y: number; period: CampaignPeriod }[]>((result, item, index) => {
    if (item.value === null) return result;
    result.push({
      label: item.label,
      value: item.value,
      period: item.period,
      x: values.length === 1 ? 150 : 12 + index * 276 / Math.max(1, values.length - 1),
      y: 96 - item.value * .78,
    });
    return result;
  }, []);
  return <div className={`metric-trend trend-${tone}`}>
    <span>{title}</span>
    <svg viewBox="0 0 300 112" preserveAspectRatio="none" role="img" aria-label={title}>
      <path d="M12 18H288M12 57H288M12 96H288" />
      {points.length > 1 && <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} />}
      {points.map((point) => <circle key={point.label} cx={point.x} cy={point.y} r="5" tabIndex={0} aria-label={`${point.label}，${point.value.toFixed(1)}%，按回车查看明细`} onClick={() => onPointSelect(point.period)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPointSelect(point.period); } }} onMouseEnter={() => setHoveredPoint(point)} onMouseLeave={() => setHoveredPoint(null)} onFocus={() => setHoveredPoint(point)} onBlur={() => setHoveredPoint(null)} />)}
    </svg>
    {hoveredPoint && <div className="p4-chart-tooltip trend-tooltip" role="status" style={{ left: `${hoveredPoint.x / 3}%`, top: `${Math.max(30, hoveredPoint.y)}px` }}><span>{hoveredPoint.label}</span><strong>{hoveredPoint.value.toFixed(1)}%</strong></div>}
    <div><small>{values[0]?.label ?? '—'}</small><small>{values.at(-1)?.label ?? '—'}</small></div>
  </div>;
}

export function LifeDashboard({ username, now, tasks, sleepRecords, deadlineEvents, campaignScale: scale, selectedPeriodId, onCampaignWindowChange, onNavigate }: LifeDashboardProps) {
  const [typeRankMode, setTypeRankMode] = useState<TypeRankMode>('total');
  const [loadMode, setLoadMode] = useState<LoadMode>('factions');
  const [factionTimeMode, setFactionTimeMode] = useState<FactionTimeMode>(() => {
    if (typeof window === 'undefined') return 'merged';
    return window.sessionStorage.getItem(FACTION_TIME_MODE_SESSION_KEY) === 'stacked' ? 'stacked' : 'merged';
  });
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const [graceMenuOpen, setGraceMenuOpen] = useState(false);
  const [graceMinutes, setGraceMinutes] = useState<GraceMinutes>(() => {
    if (typeof window === 'undefined') return 60;
    const saved = window.sessionStorage.getItem(GRACE_SESSION_KEY);
    if (saved === '0') return 0;
    if (saved === '30') return 30;
    return 60;
  });
  const [drilldown, setDrilldown] = useState<DashboardDrilldownData | null>(null);
  const [sleepSmaGeometry, setSleepSmaGeometry] = useState<{ sourceKey: string; left: number; top: number; width: number; height: number; points: { id: string; x: number; y: number }[] } | null>(null);
  const periodSelectorRef = useRef<HTMLDivElement>(null);
  const graceFilterRef = useRef<HTMLDivElement>(null);
  const sleepRhythmRef = useRef<HTMLDivElement>(null);
  const earliest = useMemo(() => {
    const dates = [
      ...tasks.flatMap((task) => [taskOperationalDate(task), validDate(task.completedAt)]),
      ...sleepRecords.map((record) => validDate(record.wakeAt)),
      ...deadlineEvents.map((event) => validDate(event.changedAt)),
    ].filter((date): date is Date => Boolean(date && +date <= +now));
    return dates.length ? new Date(Math.min(...dates.map(Number))) : now;
  }, [deadlineEvents, now, sleepRecords, tasks]);
  const periods = useMemo(() => buildPeriods(earliest, now, scale), [earliest, now, scale]);
  const selectedIndex = periods.findIndex((period) => period.id === selectedPeriodId);
  const effectiveIndex = selectedPeriodId && selectedIndex >= 0 ? selectedIndex : periods.length - 1;
  const period = periods[effectiveIndex];
  const metrics = useMemo(() => periodMetrics(period, tasks, deadlineEvents, sleepRecords, now, graceMinutes), [deadlineEvents, graceMinutes, now, period, sleepRecords, tasks]);
  const trendPeriods = periods.slice(Math.max(0, effectiveIndex - SCALE_META[scale].trendCount + 1), effectiveIndex + 1);
  const trendMetrics = trendPeriods.map((item) => ({ period: item, metrics: periodMetrics(item, tasks, deadlineEvents, sleepRecords, now, graceMinutes) }));
  const loadBuckets = buildLoadBuckets(period, scale, tasks);
  const maxLoad = Math.max(1, ...loadBuckets.map((bucket) => bucket.total));
  const mergedFactionMinutes = useMemo(() => TONES.reduce((values, tone) => ({ ...values, [tone]: mergedToneMinutes(tasks, tone, period, now) }), {} as Record<DashboardTone, number>), [now, period, tasks]);
  const colorSegments = metrics.tones.map((tone) => ({ id: tone.tone, label: TONE_META[tone.tone].label, value: factionTimeMode === 'merged' ? mergedFactionMinutes[tone.tone] : tone.minutes, color: `var(--dashboard-${tone.tone})` }));
  const typeSegments = metrics.types.map((type, index) => ({ id: type.label, label: type.label, value: type.minutes, color: `color-mix(in srgb,var(--dashboard-${type.tone}) ${58 + index % 4 * 10}%,${index % 2 ? 'var(--color-paper)' : 'var(--color-ink)'})` }));
  const rankedTypes = [...metrics.types].sort((a, b) => typeRankMode === 'total' ? b.minutes - a.minutes : b.average - a.average);
  const maxTypeMetric = Math.max(1, ...rankedTypes.map((type) => typeRankMode === 'total' ? type.minutes : type.average));
  const periodDays = Math.round((+period.end - +period.start) / DAY_MS);
  const rollingWindowLabel = scale === 'week' ? 'ROLLING 12 WEEKS' : scale === 'month' ? 'ROLLING 12 MONTHS' : 'ROLLING 4 QUARTERS';
  const graceLabel = GRACE_OPTIONS.find((option) => option.value === graceMinutes)?.label ?? '1H';
  const sleepRhythm = useMemo(() => {
    const durationFor = (record: SleepRecord) => Math.max(0, +new Date(record.wakeAt) - +new Date(record.sleepStartedAt)) / MINUTE_MS;
    const dailyDurations = new Map<string, number[]>();
    sleepRecords.forEach((record) => {
      const wakeAt = validDate(record.wakeAt);
      if (!wakeAt) return;
      const key = dateKey(wakeAt);
      dailyDurations.set(key, [...(dailyDurations.get(key) ?? []), durationFor(record)]);
    });
    return sleepRecords
      .filter((record) => inPeriod(record.wakeAt, period))
      .sort((a, b) => +new Date(a.wakeAt) - +new Date(b.wakeAt))
      .map((record) => {
        const wakeDay = new Date(record.wakeAt);
        wakeDay.setHours(0, 0, 0, 0);
        const rollingDays = Array.from({ length: 7 }, (_, index) => {
          const day = new Date(wakeDay);
          day.setDate(wakeDay.getDate() - index);
          const durations = dailyDurations.get(dateKey(day)) ?? [];
          return durations.length ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length : null;
        }).filter((duration): duration is number => duration !== null);
        return {
          record,
          minutes: durationFor(record),
          sma7: rollingDays.reduce((sum, duration) => sum + duration, 0) / rollingDays.length,
        };
      });
  }, [period, sleepRecords]);
  const sleepRhythmKey = sleepRhythm.map(({ record }) => record.id).join('|');
  const activeSleepSmaGeometry = sleepSmaGeometry?.sourceKey === sleepRhythmKey ? sleepSmaGeometry : null;
  const sleepSmaPointList = activeSleepSmaGeometry?.points.map((point) => `${point.x},${point.y}`).join(' ') ?? '';

  const selectScale = (nextScale: DashboardCampaignScale) => {
    onCampaignWindowChange(nextScale, '');
  };
  const movePeriod = (direction: number) => {
    const next = periods[effectiveIndex + direction];
    if (next) onCampaignWindowChange(scale, next.id);
  };
  const makeTaskItem = (task: DashboardTask, value: string, detail?: string, tone: DrilldownItem['tone'] = task.tone): DrilldownItem => ({
    id: task.id,
    title: task.title,
    meta: `${taskStatusLabel(task.status)} · ${PRIORITY_META[task.priority].label} · ${task.taskType}`,
    detail: detail ?? `START ${formatMoment(task.startedAt)} · DEADLINE ${formatMoment(task.dueAt)}`,
    value,
    tone,
  });
  const openInTimeDrilldown = (targetPeriod: CampaignPeriod) => {
    const deadlineClears = tasks.filter((task) => inPeriod(task.completedAt, targetPeriod) && validDate(task.dueAt));
    const inTime = deadlineClears.filter((task) => isInTimeCompletion(task, graceMinutes));
    const late = deadlineClears.filter((task) => !isInTimeCompletion(task, graceMinutes));
    const targetMetrics = periodMetrics(targetPeriod, tasks, deadlineEvents, sleepRecords, now, graceMinutes);
    const deadlineItem = (task: DashboardTask) => {
      const delta = completionDeadlineDelta(task) ?? 0;
      const isInTime = isInTimeCompletion(task, graceMinutes);
      const outcome = delta <= 0 ? 'EARLY' : isInTime ? 'GRACE' : 'LATE';
      return makeTaskItem(task, `${formatDuration(Math.abs(delta) / MINUTE_MS)} ${outcome}`, `完成 ${formatMoment(task.completedAt)} · 最终截止 ${formatMoment(task.dueAt)}`, isInTime ? outcome === 'GRACE' ? 'blue' : 'green' : 'red');
    };
    setDrilldown({
      index: '01',
      title: 'IN-TIME VERDICT',
      periodLabel: targetPeriod.label,
      metric: targetMetrics.inTimeRate === null ? '--' : `${targetMetrics.inTimeRate.toFixed(1)}%`,
      metricLabel: `FINAL DEADLINE RATE · ${graceLabel} GRACE`,
      formula: `${targetMetrics.inTimeCount} IN TIME ÷ ${targetMetrics.inTimeSample} DEADLINE CLEARS · GRACE ${graceLabel}`,
      accent: 'yellow',
      groups: [
        { id: 'in-time', label: 'IN TIME / 准时完成', countLabel: `${inTime.length} MISSIONS`, items: inTime.map(deadlineItem) },
        { id: 'late', label: 'OUT OF TIME / 超时完成', countLabel: `${late.length} MISSIONS`, items: late.map(deadlineItem) },
      ],
    });
  };
  const openDeadlineDrilldown = (targetPeriod: CampaignPeriod) => {
    const mustTasks = tasks.filter((task) => task.priority === 'must' && taskBelongsToPeriod(task, targetPeriod));
    const periodEvents = deadlineEvents.filter((event) => event.priorityAtChange === 'must' && isDeadlineExtension(event) && inPeriod(event.changedAt, targetPeriod));
    const eventsByTask = new Map<string, DeadlineEvent[]>();
    periodEvents.forEach((event) => eventsByTask.set(event.taskId, [...(eventsByTask.get(event.taskId) ?? []), event]));
    const changed = mustTasks.filter((task) => eventsByTask.has(task.id));
    const unchanged = mustTasks.filter((task) => !eventsByTask.has(task.id));
    const targetMetrics = periodMetrics(targetPeriod, tasks, deadlineEvents, sleepRecords, now, graceMinutes);
    const changedItem = (task: DashboardTask) => {
      const events = eventsByTask.get(task.id) ?? [];
      const history = events.sort((a, b) => +new Date(a.changedAt) - +new Date(b.changedAt)).map((event) => `${formatMoment(event.changedAt)}｜${formatMoment(event.oldDueAt)} → ${formatMoment(event.newDueAt)}`).join(' · ');
      return makeTaskItem(task, `${events.length} CHANGE${events.length === 1 ? '' : 'S'}`, history, 'orange');
    };
    setDrilldown({
      index: '02',
      title: 'DEADLINE REVISION LOG',
      periodLabel: targetPeriod.label,
      metric: targetMetrics.deadlineChangeRate === null ? '--' : `${targetMetrics.deadlineChangeRate.toFixed(1)}%`,
      metricLabel: 'APPROVED CHANGE RATE',
      formula: `${targetMetrics.changedMustCount} CHANGED MUST ÷ ${targetMetrics.mustCount} MUST MISSIONS`,
      accent: 'orange',
      groups: [
        { id: 'changed', label: 'REVISED / 已变更', countLabel: `${changed.length} MISSIONS · ${periodEvents.length} EVENTS`, items: changed.map(changedItem) },
        { id: 'unchanged', label: 'UNCHANGED / 未变更', countLabel: `${unchanged.length} MISSIONS`, items: unchanged.map((task) => makeTaskItem(task, 'LOCKED', `最终截止 ${formatMoment(task.dueAt)}`, 'muted')) },
      ],
    });
  };
  const openLoadDrilldown = (bucket: typeof loadBuckets[number]) => {
    const bucketTasks = tasks.filter((task) => {
      const date = taskOperationalDate(task);
      return date && +date >= +bucket.start && +date < +bucket.end;
    });
    const groups = loadMode === 'factions'
      ? TONES.map((tone) => ({ id: tone, label: `${TONE_META[tone].signal} / ${TONE_META[tone].label}`, tone, tasks: bucketTasks.filter((task) => task.tone === tone) }))
      : PRIORITIES.map((priority) => ({ id: priority, label: `${PRIORITY_META[priority].label} PRIORITY`, tone: PRIORITY_DRILLDOWN_TONE[priority], tasks: bucketTasks.filter((task) => task.priority === priority) }));
    setDrilldown({
      index: '03',
      title: loadMode === 'factions' ? 'FACTION DEPLOYMENT' : 'PRIORITY DEPLOYMENT',
      periodLabel: `${bucket.label} · ${dateKey(bucket.start)}—${dateKey(new Date(+bucket.end - 1))}`,
      metric: String(bucket.total),
      metricLabel: 'MISSIONS IN BUCKET',
      formula: loadMode === 'factions' ? 'TOTAL = DEPTH + DUTY + LIFE + REST' : 'TOTAL = MUST + HIGH + MID + LOW',
      accent: 'blue',
      groups: groups.map((group) => ({ id: group.id, label: group.label, countLabel: `${group.tasks.length} MISSIONS`, tone: group.tone, items: group.tasks.map((task) => makeTaskItem(task, taskStatusLabel(task.status))) })),
    });
  };
  const openAllocationDrilldown = (kind: 'tone' | 'type', id: string, toneTimeMode: FactionTimeMode = 'stacked', compactTitle = false) => {
    const tracked = tasks.map((task) => ({ task, minutes: intervalMinutes(task, period, now) })).filter((item) => item.minutes > 0);
    const matching = tracked.filter(({ task }) => kind === 'tone' ? task.tone === id : task.taskType === id).sort((a, b) => b.minutes - a.minutes);
    const useMergedToneTime = kind === 'tone' && toneTimeMode === 'merged';
    const selectedMinutes = useMergedToneTime ? mergedToneMinutes(tasks, id as DashboardTone, period, now) : matching.reduce((sum, item) => sum + item.minutes, 0);
    const totalMinutes = useMergedToneTime ? TONES.reduce((sum, tone) => sum + mergedToneMinutes(tasks, tone, period, now), 0) : tracked.reduce((sum, item) => sum + item.minutes, 0);
    const ratio = totalMinutes ? selectedMinutes / totalMinutes * 100 : 0;
    const tone = kind === 'tone' ? id as DashboardTone : matching[0]?.task.tone ?? 'purple';
    const label = kind === 'tone' ? `${TONE_META[tone].signal} / ${TONE_META[tone].label}` : id;
    setDrilldown({
      index: kind === 'tone' ? '05A' : '05B',
      title: compactTitle ? label : `${label} · TIME SHARE`,
      periodLabel: period.label,
      metric: `${ratio.toFixed(1)}%`,
      metricLabel: `${formatDuration(selectedMinutes)} OF ${formatDuration(totalMinutes)}`,
      formula: `${formatDuration(selectedMinutes)} ${useMergedToneTime ? 'MERGED' : 'SELECTED'} TIME ÷ ${formatDuration(totalMinutes)} TOTAL TIME`,
      accent: kind === 'tone' ? tone : 'blue',
      groups: [{ id: 'contributors', label: 'CONTRIBUTING MISSIONS / 耗时来源', countLabel: `${matching.length} MISSIONS`, items: matching.map(({ task, minutes }) => makeTaskItem(task, formatDuration(minutes), `本周期计入 ${formatDuration(minutes)} · START ${formatMoment(task.startedAt)} · END ${task.status === 'completed' ? formatMoment(task.completedAt) : 'NOW'}`)) }],
    });
  };

  useEffect(() => {
    window.sessionStorage.setItem(FACTION_TIME_MODE_SESSION_KEY, factionTimeMode);
  }, [factionTimeMode]);

  useEffect(() => {
    window.sessionStorage.setItem(GRACE_SESSION_KEY, String(graceMinutes));
  }, [graceMinutes]);

  useEffect(() => {
    const strip = sleepRhythmRef.current;
    if (!strip || !sleepRhythm.length) {
      setSleepSmaGeometry(null);
      return;
    }
    let frame = 0;
    const updateGeometry = () => {
      const styles = window.getComputedStyle(strip);
      const left = Number.parseFloat(styles.paddingLeft);
      const right = Number.parseFloat(styles.paddingRight);
      const top = Number.parseFloat(styles.paddingTop);
      const bottom = Number.parseFloat(styles.paddingBottom);
      const width = strip.clientWidth - left - right;
      const height = strip.clientHeight - top - bottom;
      const stripRect = strip.getBoundingClientRect();
      const bars = Array.from(strip.querySelectorAll<HTMLElement>('.sleep-rhythm-bar'));
      if (width <= 0 || height <= 0 || bars.length !== sleepRhythm.length) return;
      const points = bars.map((bar, index) => {
        const rhythm = sleepRhythm[index];
        const rect = bar.getBoundingClientRect();
        return {
          id: rhythm.record.id,
          x: rect.left - stripRect.left - left + rect.width / 2,
          y: height * (1 - Math.min(1, rhythm.sma7 / (10 * 60))),
        };
      });
      setSleepSmaGeometry({ sourceKey: sleepRhythmKey, left, top, width, height, points });
    };
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateGeometry);
    };
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(strip);
    scheduleUpdate();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [sleepRhythm, sleepRhythmKey]);

  useEffect(() => {
    if (!periodMenuOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!periodSelectorRef.current?.contains(event.target as Node)) setPeriodMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPeriodMenuOpen(false);
    };
    window.addEventListener('pointerdown', closeOnPointerDown);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnPointerDown);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [periodMenuOpen]);

  useEffect(() => {
    if (!graceMenuOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!graceFilterRef.current?.contains(event.target as Node)) setGraceMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGraceMenuOpen(false);
    };
    window.addEventListener('pointerdown', closeOnPointerDown);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnPointerDown);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [graceMenuOpen]);

  return <section className="life-dashboard" aria-label="长期生活战绩 Dashboard">
    <header className="campaign-header">
      <div className="campaign-title"><span>00 / LIFE PERFORMANCE ARCHIVE</span><h2>CAMPAIGN<br /><em>RECORD</em></h2><p><strong>{username}</strong><span aria-hidden="true">·</span><span className="campaign-brand-status">Sword Art Online <i aria-label="社交链路在线"><span className="campaign-online-mark" aria-hidden="true"><b /><b /><b /><em /></span><span className="campaign-online-copy" aria-hidden="true"><small>SOCIAL LINK</small><b>ONLINE</b></span><u aria-hidden="true">{'///'}</u></i></span></p></div>
      <div className="campaign-scale" role="group" aria-label="选择战役时间维度">{(Object.entries(SCALE_META) as [DashboardCampaignScale, typeof SCALE_META[DashboardCampaignScale]][]).map(([key, meta]) => <button type="button" key={key} className={`campaign-scale-${key}`} aria-pressed={scale === key} onClick={() => selectScale(key)}><strong>{meta.title}</strong><span>{meta.subtitle}</span></button>)}</div>
      <div className="period-selector" ref={periodSelectorRef}>
        <span>SELECT CAMPAIGN / 选择战役</span>
        <div className="period-control"><button type="button" disabled={effectiveIndex === 0} onClick={() => movePeriod(-1)} aria-label="上一个周期">‹</button><div className="period-menu"><button type="button" className="period-select-trigger" aria-haspopup="listbox" aria-expanded={periodMenuOpen} onClick={() => setPeriodMenuOpen((open) => !open)}><span>{scale === 'week' ? period.compactLabel : period.label}</span><i>▼</i></button>{periodMenuOpen && <div className="period-options" role="listbox" aria-label="选择具体周期">{[...periods].reverse().map((item) => <button type="button" role="option" aria-selected={period.id === item.id} className={period.id === item.id ? 'is-selected' : ''} key={item.id} onClick={() => { onCampaignWindowChange(scale, item.id); setPeriodMenuOpen(false); }}><i>{period.id === item.id ? '◆' : '◇'}</i><span>{item.label}</span></button>)}</div>}</div><button type="button" disabled={effectiveIndex === periods.length - 1} onClick={() => movePeriod(1)} aria-label="下一个周期">›</button></div>
        <small>{rollingWindowLabel}</small>
      </div>
    </header>

    <section className="discipline-arena">
      <article className="discipline-kpi in-time-kpi">
        <header><span>01 / FINAL DEADLINE</span><strong>IN-TIME RATE</strong><div className="in-time-header-tools"><div className={`grace-filter${graceMenuOpen ? ' is-open' : ''}`} ref={graceFilterRef}><button type="button" className="grace-filter-trigger" aria-haspopup="menu" aria-expanded={graceMenuOpen} onClick={() => setGraceMenuOpen((open) => !open)}><span>GRACE</span><strong>{graceLabel}</strong><i>⌄</i></button>{graceMenuOpen && <div className="grace-filter-menu" role="menu" aria-label="准时完成宽限规则"><span>DEADLINE BUFFER</span>{GRACE_OPTIONS.map((option, index) => <button key={option.value} type="button" role="menuitemradio" aria-checked={graceMinutes === option.value} className={graceMinutes === option.value ? 'active' : ''} onClick={() => { setGraceMinutes(option.value); setGraceMenuOpen(false); }}><i>{String(index + 1).padStart(2, '0')}</i><strong>{option.detail}</strong><b>{graceMinutes === option.value ? '◆' : '◇'}</b></button>)}</div>}</div><small>准时完成率</small></div></header>
        <div className="kpi-snapshot is-actionable" role="button" tabIndex={0} aria-label="查看本周期准时完成率明细" onClick={() => openInTimeDrilldown(period)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openInTimeDrilldown(period); } }}><strong>{metrics.inTimeRate === null ? '--' : metrics.inTimeRate.toFixed(1)}<i>{metrics.inTimeRate === null ? '' : '%'}</i></strong><p>{metrics.inTimeCount} IN TIME / {metrics.inTimeSample} DEADLINE CLEARS</p><small className="drilldown-callout">OPEN VERDICT ▶</small></div>
        <MetricTrend title={`IN-TIME · ${rollingWindowLabel}`} tone="yellow" values={trendMetrics.map((item) => ({ label: item.period.compactLabel, value: item.metrics.inTimeRate, period: item.period }))} onPointSelect={openInTimeDrilldown} />
      </article>
      <article className="discipline-kpi deadline-kpi">
        <header><span>02 / APPROVED DEADLINE</span><strong>CHANGE RATE</strong><small>Must 截止日期变更率</small></header>
        <div className="kpi-snapshot is-actionable" role="button" tabIndex={0} aria-label="查看本周期截止日期变更率明细" onClick={() => openDeadlineDrilldown(period)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDeadlineDrilldown(period); } }}><strong>{metrics.deadlineChangeRate === null ? '--' : metrics.deadlineChangeRate.toFixed(1)}<i>{metrics.deadlineChangeRate === null ? '' : '%'}</i></strong><p>{metrics.changedMustCount} CHANGED / {metrics.mustCount} MUST MISSIONS · {metrics.deadlineChangeCount} EVENTS</p><small className="drilldown-callout">OPEN REVISION LOG ▶</small></div>
        <MetricTrend title={`DEADLINE CHANGE · ${rollingWindowLabel}`} tone="orange" values={trendMetrics.map((item) => ({ label: item.period.compactLabel, value: item.metrics.deadlineChangeRate, period: item.period }))} onPointSelect={openDeadlineDrilldown} />
      </article>
    </section>

    <div className="dashboard-story-grid">
      <div className="dashboard-left-rail">
      <section className="mission-load-panel">
        <header><div><span>03 / MISSION LEDGER</span><h3>OPERATION LOAD</h3></div><div className="operation-load-mode" role="group" aria-label="选择任务负载分类方式"><button type="button" aria-pressed={loadMode === 'factions'} onClick={() => setLoadMode('factions')}>FACTIONS</button><button type="button" aria-pressed={loadMode === 'priority'} onClick={() => setLoadMode('priority')}>PRIORITY</button></div></header>
        <div className={`mission-load-chart load-${scale}`} role="group" aria-label={loadMode === 'factions' ? '周期内四颜色阵营任务负载' : '周期内各优先级任务负载'}>
          {loadBuckets.map((bucket, index) => {
            const showLabel = scale === 'week' || (scale === 'quarter' ? index % 2 === 0 || index === loadBuckets.length - 1 : bucket.label.endsWith('/1') || bucket.label.endsWith('/15'));
            const groups = loadMode === 'factions'
              ? TONES.map((tone) => ({ key: tone, label: TONE_META[tone].signal.split(' / ')[0], count: bucket.tones[tone], tone: `tone-${tone}` }))
              : PRIORITIES.map((priority) => ({ key: priority, label: PRIORITY_META[priority].label, count: bucket.priorities[priority], tone: PRIORITY_META[priority].tone }));
            const detail = groups.map((group) => `${group.label} ${group.count}`).join(' · ');
            return <div key={bucket.key} className="is-actionable" role="button" tabIndex={0} aria-label={`${bucket.label}，共 ${bucket.total} 个任务，查看明细`} data-tooltip={`${bucket.label}｜TOTAL ${bucket.total}｜${detail}`} onClick={() => openLoadDrilldown(bucket)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openLoadDrilldown(bucket); } }}><span>{bucket.total || ''}</span><i style={{ height: `${Math.max(bucket.total ? 9 : 2, bucket.total / maxLoad * 100)}%` }}>{groups.map((group) => <b key={group.key} className={group.tone} style={{ height: `${bucket.total ? group.count / bucket.total * 100 : 0}%` }} />)}</i><small>{showLabel ? bucket.label : '·'}</small></div>;
          })}
        </div>
        <footer>{loadMode === 'factions' ? TONES.map((tone) => <span key={tone} className={`tone-${tone}`}><i />{TONE_META[tone].signal.split(' / ')[0]}</span>) : PRIORITIES.map((priority) => <span key={priority} className={PRIORITY_META[priority].tone}><i />{PRIORITY_META[priority].label}</span>)}<strong>{scale === 'quarter' ? '1 WEEK / BAR' : '1 DAY / BAR'}</strong></footer>
      </section>

      <section className="recovery-panel">
        <header><div><span>04 / REST ARCHIVE</span><h3>RECOVERY RHYTHM</h3></div></header>
        <div className="recovery-score"><article><span>SLEEP AVG</span><strong>{metrics.sleepAverage === null ? '--' : formatDuration(metrics.sleepAverage)}</strong><small>{metrics.sleepCount} NIGHT RECORDS</small></article><article><span>ACTIVE DAYS</span><strong>{metrics.activeDays}<i>/{periodDays}</i></strong><small>{period.label}</small></article></div>
        <div className="sleep-rhythm-strip" ref={sleepRhythmRef}>
          {sleepRhythm.map(({ record, minutes, sma7 }) => <i className="sleep-rhythm-bar" key={record.id} style={{ height: `${Math.min(100, minutes / (10 * 60) * 100)}%` }} data-tooltip={`${dateKey(new Date(record.wakeAt))}｜睡眠 ${formatDuration(minutes)}｜7D SMA ${formatDuration(sma7)}`} />)}
          {activeSleepSmaGeometry && <><svg className="sleep-sma-overlay" style={{ left: activeSleepSmaGeometry.left, top: activeSleepSmaGeometry.top, width: activeSleepSmaGeometry.width, height: activeSleepSmaGeometry.height }} viewBox={`0 0 ${activeSleepSmaGeometry.width} ${activeSleepSmaGeometry.height}`} preserveAspectRatio="none" role="img" aria-label="睡眠时长 7 天简单移动平均">{activeSleepSmaGeometry.points.length > 1 && <><polyline className="sleep-sma-keyline" points={sleepSmaPointList} /><polyline className="sleep-sma-signal" points={sleepSmaPointList} /></>}{activeSleepSmaGeometry.points.map((point) => <circle key={point.id} cx={point.x} cy={point.y} r="3" />)}</svg><span className="sleep-sma-label" aria-hidden="true">7D SMA</span></>}
        </div>
        <footer><span>ZERO</span><strong>REST RECORDS / 睡眠时长分布</strong><span>10H+</span></footer>
      </section>
      </div>

      <section className="allocation-panel">
        <header><div><span>05 / TIME FACTIONS</span><h3>ALLOCATION MAP</h3></div></header>
        <div className="allocation-pies">
          <PieChart title="FACTION SHARE" subtitle="4 COLOR FACTIONS" segments={colorSegments} headingControl={<div className="faction-time-mode" role="group" aria-label="四色阵营耗时计算方式"><button type="button" title="同色重叠时间只计算一次" aria-pressed={factionTimeMode === 'merged'} onClick={() => setFactionTimeMode('merged')}>MERGED</button><button type="button" title="每个任务耗时分别累计" aria-pressed={factionTimeMode === 'stacked'} onClick={() => setFactionTimeMode('stacked')}>STACKED</button></div>} onSegmentSelect={(segment) => openAllocationDrilldown('tone', segment.id, factionTimeMode)} />
          <PieChart title="TYPE SHARE" subtitle="ALL TASK TYPES" segments={typeSegments} onSegmentSelect={(segment) => openAllocationDrilldown('type', segment.id)} />
        </div>
      </section>

      <section className="time-rank-panel">
        <header><div><span>06 / PERFORMANCE SCAN</span><h3>TIME INTELLIGENCE</h3></div><div className="type-rank-mode" role="group" aria-label="选择任务类型排名依据"><button type="button" aria-pressed={typeRankMode === 'total'} onClick={() => setTypeRankMode('total')}>TOTAL 排名</button><button type="button" aria-pressed={typeRankMode === 'average'} onClick={() => setTypeRankMode('average')}>AVG 排名</button></div></header>
        <div className="color-time-roster">{metrics.tones.map((tone) => <article key={tone.tone} className={`tone-${tone.tone} is-actionable`} role="button" tabIndex={0} aria-label={`${TONE_META[tone.tone].label}耗时明细`} onClick={() => openAllocationDrilldown('tone', tone.tone, 'stacked', true)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAllocationDrilldown('tone', tone.tone, 'stacked', true); } }}><i /><div><span>{TONE_META[tone.tone].signal}</span><strong>{TONE_META[tone.tone].label}</strong></div><dl><div><dt>TOTAL</dt><dd>{formatDuration(tone.minutes)}</dd></div><div><dt>AVG / TASK</dt><dd>{formatDuration(tone.average)}</dd></div><div><dt>TASKS</dt><dd>{tone.count}</dd></div></dl></article>)}</div>
        <div className="type-rank-head"><span>RANK / TYPE</span><span>{typeRankMode === 'total' ? 'TOTAL SCALE' : 'AVG SCALE'}</span><span>TOTAL</span><span>AVG</span><span>SHARE</span></div>
        <div className="type-rank-list">{rankedTypes.map((type, index) => {
          const metric = typeRankMode === 'total' ? type.minutes : type.average;
          const totalMinutes = metrics.types.reduce((sum, item) => sum + item.minutes, 0);
          return <article key={type.label} className={`tone-${type.tone} is-actionable`} role="button" tabIndex={0} aria-label={`${type.label}耗时排名明细`} data-tooltip={`${type.label}｜总计 ${formatDuration(type.minutes)}｜平均 ${formatDuration(type.average)}｜占比 ${totalMinutes ? (type.minutes / totalMinutes * 100).toFixed(1) : '0.0'}%`} onClick={() => openAllocationDrilldown('type', type.label)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAllocationDrilldown('type', type.label); } }}><span>{String(index + 1).padStart(2, '0')}</span><strong>{type.label}<small>{type.count} TASKS</small></strong><div><i style={{ width: `${metric / maxTypeMetric * 100}%` }} /></div><b>{formatDuration(type.minutes)}</b><u>{formatDuration(type.average)}</u><em>{totalMinutes ? (type.minutes / totalMinutes * 100).toFixed(1) : '0.0'}%</em></article>;
        })}{!rankedTypes.length && <div className="dashboard-empty">NO TIME DATA / 本周期尚无可计算耗时</div>}</div>
      </section>

      <nav className="campaign-shortcuts" aria-label="功能页快捷入口">
        <button type="button" onClick={() => onNavigate('board')}><span>01</span><div><strong>DAILY OPS</strong><small>回到今天，立即行动</small></div><i>▶</i></button>
        <button type="button" onClick={() => onNavigate('table')}><span>02</span><div><strong>MISSION ARCHIVE</strong><small>检查完整任务档案</small></div><i>▦</i></button>
        <button type="button" onClick={() => onNavigate('sleep')}><span>03</span><div><strong>NIGHT LOG</strong><small>查看完整睡眠节奏</small></div><i>☾</i></button>
        <button type="button" onClick={() => onNavigate('calendar')}><span>04</span><div><strong>CALENDAR</strong><small>进入月度行动地图</small></div><i>◆</i></button>
      </nav>
    </div>
    {drilldown && <DashboardDrilldown data={drilldown} onClose={() => setDrilldown(null)} />}
  </section>;
}
