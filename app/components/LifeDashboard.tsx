'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { DeadlineEvent } from '../lib/deadline-store';
import type { SleepRecord } from '../lib/sleep-store';

type DashboardStatus = 'pending' | 'inProgress' | 'completed';
type DashboardTone = 'purple' | 'blue' | 'green' | 'yellow';
type DashboardPriority = 'must' | 'high' | 'medium' | 'low';
export type DashboardCampaignScale = 'week' | 'month' | 'quarter';
type TypeRankMode = 'total' | 'average';
type LoadMode = 'factions' | 'priority';

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

function intervalMinutes(task: DashboardTask, period: CampaignPeriod, now: Date) {
  const taskStart = validDate(task.startedAt);
  if (!taskStart || task.status === 'pending') return 0;
  const rawEnd = task.status === 'completed' ? validDate(task.completedAt) : now;
  if (!rawEnd) return 0;
  return Math.max(0, Math.min(+rawEnd, +period.end, +now) - Math.max(+taskStart, +period.start)) / MINUTE_MS;
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

function periodMetrics(period: CampaignPeriod, tasks: DashboardTask[], events: DeadlineEvent[], sleepRecords: SleepRecord[], now: Date) {
  const periodTasks = tasks.filter((task) => taskBelongsToPeriod(task, period));
  const mustTasks = periodTasks.filter((task) => task.priority === 'must');
  const clears = tasks.filter((task) => inPeriod(task.completedAt, period));
  const deadlineClears = clears.filter((task) => validDate(task.dueAt));
  const inTimeCount = deadlineClears.filter((task) => {
    const completedAt = validDate(task.completedAt);
    const dueAt = validDate(task.dueAt);
    return completedAt && dueAt && +completedAt <= +dueAt;
  }).length;
  const periodEvents = events.filter((event) => inPeriod(event.changedAt, period));
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
  const activeDays = new Set<string>();
  trackedTasks.forEach((task) => {
    const taskStart = validDate(task.startedAt);
    const taskEnd = task.status === 'completed' ? validDate(task.completedAt) : now;
    if (!taskStart || !taskEnd) return;
    const cursor = startOfDay(new Date(Math.max(+taskStart, +period.start)));
    const final = startOfDay(new Date(Math.min(+taskEnd, +period.end - 1, +now)));
    while (+cursor <= +final) {
      activeDays.add(dateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  });
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
  const buckets: { key: string; label: string; total: number; tones: Record<DashboardTone, number>; priorities: Record<DashboardPriority, number> }[] = [];
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
      total: matching.length,
      tones: TONES.reduce((counts, tone) => ({ ...counts, [tone]: matching.filter((task) => task.tone === tone).length }), {} as Record<DashboardTone, number>),
      priorities: PRIORITIES.reduce((counts, priority) => ({ ...counts, [priority]: matching.filter((task) => task.priority === priority).length }), {} as Record<DashboardPriority, number>),
    });
    cursor = end;
  }
  return buckets;
}

function PieChart({ title, subtitle, segments }: {
  title: string;
  subtitle: string;
  segments: { label: string; value: number; color: string }[];
}) {
  const [hoveredSegment, setHoveredSegment] = useState<{ label: string; ratio: number; value: number } | null>(null);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const visibleSegments = segments.filter((segment) => segment.value > 0);
  let cursor = 0;
  return <figure className="p4-pie-figure">
    <div className="p4-pie-heading"><span>{subtitle}</span><strong>{title}</strong></div>
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
            return <circle key={segment.label} className={`p4-pie-segment ${hoveredSegment ? hoveredSegment.label === segment.label ? 'is-highlighted' : 'is-muted' : ''}`} cx="120" cy="120" r={PIE_RADIUS} strokeDasharray={`${dash} ${PIE_CIRCUMFERENCE - dash}`} strokeDashoffset={offset} style={{ '--segment-color': segment.color } as CSSProperties} transform="rotate(-90 120 120)" tabIndex={0} aria-label={`${segment.label}，${(ratio * 100).toFixed(1)}%，${formatDuration(segment.value)}`} onMouseEnter={() => setHoveredSegment(tooltip)} onMouseLeave={() => setHoveredSegment(null)} onFocus={() => setHoveredSegment(tooltip)} onBlur={() => setHoveredSegment(null)} />;
          })}
        </svg>
      </div>
      {hoveredSegment && <div className="p4-chart-tooltip pie-tooltip" role="status"><span>{hoveredSegment.label}</span><strong>{(hoveredSegment.ratio * 100).toFixed(1)}%</strong><small>{formatDuration(hoveredSegment.value)}</small></div>}
    </div>
    <figcaption>{visibleSegments.slice(0, 8).map((segment) => {
      const tooltip = { label: segment.label, ratio: total ? segment.value / total : 0, value: segment.value };
      return <span key={segment.label} className={hoveredSegment?.label === segment.label ? 'is-active' : ''} tabIndex={0} onMouseEnter={() => setHoveredSegment(tooltip)} onMouseLeave={() => setHoveredSegment(null)} onFocus={() => setHoveredSegment(tooltip)} onBlur={() => setHoveredSegment(null)}><i style={{ background: segment.color }} /><strong>{segment.label}</strong><small>{(tooltip.ratio * 100).toFixed(1)}%</small></span>;
    })}</figcaption>
  </figure>;
}

function MetricTrend({ title, values, tone }: { title: string; values: { label: string; value: number | null }[]; tone: 'yellow' | 'orange' }) {
  const [hoveredPoint, setHoveredPoint] = useState<{ label: string; value: number; x: number; y: number } | null>(null);
  const points = values.flatMap((item, index) => item.value === null ? [] : [{
    x: values.length === 1 ? 150 : 12 + index * 276 / Math.max(1, values.length - 1),
    y: 96 - item.value * .78,
    ...item,
  }]);
  return <div className={`metric-trend trend-${tone}`}>
    <span>{title}</span>
    <svg viewBox="0 0 300 112" preserveAspectRatio="none" role="img" aria-label={title}>
      <path d="M12 18H288M12 57H288M12 96H288" />
      {points.length > 1 && <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} />}
      {points.map((point) => <circle key={point.label} cx={point.x} cy={point.y} r="5" tabIndex={0} aria-label={`${point.label}，${point.value.toFixed(1)}%`} onMouseEnter={() => setHoveredPoint(point)} onMouseLeave={() => setHoveredPoint(null)} onFocus={() => setHoveredPoint(point)} onBlur={() => setHoveredPoint(null)} />)}
    </svg>
    {hoveredPoint && <div className="p4-chart-tooltip trend-tooltip" role="status" style={{ left: `${hoveredPoint.x / 3}%`, top: `${Math.max(30, hoveredPoint.y)}px` }}><span>{hoveredPoint.label}</span><strong>{hoveredPoint.value.toFixed(1)}%</strong></div>}
    <div><small>{values[0]?.label ?? '—'}</small><small>{values.at(-1)?.label ?? '—'}</small></div>
  </div>;
}

export function LifeDashboard({ username, now, tasks, sleepRecords, deadlineEvents, campaignScale: scale, selectedPeriodId, onCampaignWindowChange, onNavigate }: LifeDashboardProps) {
  const [typeRankMode, setTypeRankMode] = useState<TypeRankMode>('total');
  const [loadMode, setLoadMode] = useState<LoadMode>('factions');
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const periodSelectorRef = useRef<HTMLDivElement>(null);
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
  const metrics = useMemo(() => periodMetrics(period, tasks, deadlineEvents, sleepRecords, now), [deadlineEvents, now, period, sleepRecords, tasks]);
  const trendPeriods = periods.slice(Math.max(0, effectiveIndex - SCALE_META[scale].trendCount + 1), effectiveIndex + 1);
  const trendMetrics = trendPeriods.map((item) => ({ period: item, metrics: periodMetrics(item, tasks, deadlineEvents, sleepRecords, now) }));
  const loadBuckets = buildLoadBuckets(period, scale, tasks);
  const maxLoad = Math.max(1, ...loadBuckets.map((bucket) => bucket.total));
  const colorSegments = metrics.tones.map((tone) => ({ label: TONE_META[tone.tone].label, value: tone.minutes, color: `var(--dashboard-${tone.tone})` }));
  const typeSegments = metrics.types.map((type, index) => ({ label: type.label, value: type.minutes, color: `color-mix(in srgb,var(--dashboard-${type.tone}) ${58 + index % 4 * 10}%,${index % 2 ? 'var(--color-paper)' : 'var(--color-ink)'})` }));
  const rankedTypes = [...metrics.types].sort((a, b) => typeRankMode === 'total' ? b.minutes - a.minutes : b.average - a.average);
  const maxTypeMetric = Math.max(1, ...rankedTypes.map((type) => typeRankMode === 'total' ? type.minutes : type.average));
  const periodDays = Math.round((+period.end - +period.start) / DAY_MS);
  const rollingWindowLabel = scale === 'week' ? 'ROLLING 12 WEEKS' : scale === 'month' ? 'ROLLING 12 MONTHS' : 'ROLLING 4 QUARTERS';

  const selectScale = (nextScale: DashboardCampaignScale) => {
    onCampaignWindowChange(nextScale, '');
  };
  const movePeriod = (direction: number) => {
    const next = periods[effectiveIndex + direction];
    if (next) onCampaignWindowChange(scale, next.id);
  };

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

  return <section className="life-dashboard" aria-label="长期生活战绩 Dashboard">
    <header className="campaign-header">
      <div className="campaign-title"><span>00 / LIFE PERFORMANCE ARCHIVE</span><h2>CAMPAIGN<br /><em>RECORD</em></h2><p><strong>{username}</strong> · 黄金战役编年史</p></div>
      <div className="campaign-scale" role="group" aria-label="选择战役时间维度">{(Object.entries(SCALE_META) as [DashboardCampaignScale, typeof SCALE_META[DashboardCampaignScale]][]).map(([key, meta]) => <button type="button" key={key} className={`campaign-scale-${key}`} aria-pressed={scale === key} onClick={() => selectScale(key)}><strong>{meta.title}</strong><span>{meta.subtitle}</span></button>)}</div>
      <div className="period-selector" ref={periodSelectorRef}>
        <span>SELECT CAMPAIGN / 选择战役</span>
        <div className="period-control"><button type="button" disabled={effectiveIndex === 0} onClick={() => movePeriod(-1)} aria-label="上一个周期">‹</button><div className="period-menu"><button type="button" className="period-select-trigger" aria-haspopup="listbox" aria-expanded={periodMenuOpen} onClick={() => setPeriodMenuOpen((open) => !open)}><span>{scale === 'week' ? period.compactLabel : period.label}</span><i>▼</i></button>{periodMenuOpen && <div className="period-options" role="listbox" aria-label="选择具体周期">{[...periods].reverse().map((item) => <button type="button" role="option" aria-selected={period.id === item.id} className={period.id === item.id ? 'is-selected' : ''} key={item.id} onClick={() => { onCampaignWindowChange(scale, item.id); setPeriodMenuOpen(false); }}><i>{period.id === item.id ? '◆' : '◇'}</i><span>{item.label}</span></button>)}</div>}</div><button type="button" disabled={effectiveIndex === periods.length - 1} onClick={() => movePeriod(1)} aria-label="下一个周期">›</button></div>
        <small>{rollingWindowLabel}</small>
      </div>
    </header>

    <section className="discipline-arena">
      <article className="discipline-kpi in-time-kpi">
        <header><span>01 / FINAL DEADLINE</span><strong>IN-TIME RATE</strong><small>准时完成率</small></header>
        <div className="kpi-snapshot"><strong>{metrics.inTimeRate === null ? '--' : metrics.inTimeRate.toFixed(1)}<i>{metrics.inTimeRate === null ? '' : '%'}</i></strong><p>{metrics.inTimeCount} IN TIME / {metrics.inTimeSample} DEADLINE CLEARS</p></div>
        <MetricTrend title={`IN-TIME · ${rollingWindowLabel}`} tone="yellow" values={trendMetrics.map((item) => ({ label: item.period.compactLabel, value: item.metrics.inTimeRate }))} />
      </article>
      <article className="discipline-kpi deadline-kpi">
        <header><span>02 / APPROVED DEADLINE</span><strong>CHANGE RATE</strong><small>Must 截止日期变更率</small></header>
        <div className="kpi-snapshot"><strong>{metrics.deadlineChangeRate === null ? '--' : metrics.deadlineChangeRate.toFixed(1)}<i>{metrics.deadlineChangeRate === null ? '' : '%'}</i></strong><p>{metrics.changedMustCount} CHANGED / {metrics.mustCount} MUST MISSIONS · {metrics.deadlineChangeCount} EVENTS</p></div>
        <MetricTrend title={`DEADLINE CHANGE · ${rollingWindowLabel}`} tone="orange" values={trendMetrics.map((item) => ({ label: item.period.compactLabel, value: item.metrics.deadlineChangeRate }))} />
      </article>
    </section>

    <div className="dashboard-story-grid">
      <div className="dashboard-left-rail">
      <section className="mission-load-panel">
        <header><div><span>03 / MISSION LEDGER</span><h3>OPERATION LOAD</h3></div><div className="operation-load-mode" role="group" aria-label="选择任务负载分类方式"><button type="button" aria-pressed={loadMode === 'factions'} onClick={() => setLoadMode('factions')}>FACTIONS</button><button type="button" aria-pressed={loadMode === 'priority'} onClick={() => setLoadMode('priority')}>PRIORITY</button></div></header>
        <div className={`mission-load-chart load-${scale}`} role="img" aria-label={loadMode === 'factions' ? '周期内四颜色阵营任务负载' : '周期内各优先级任务负载'}>
          {loadBuckets.map((bucket, index) => {
            const showLabel = scale === 'week' || (scale === 'quarter' ? index % 2 === 0 || index === loadBuckets.length - 1 : bucket.label.endsWith('/1') || bucket.label.endsWith('/15'));
            const groups = loadMode === 'factions'
              ? TONES.map((tone) => ({ key: tone, label: TONE_META[tone].signal.split(' / ')[0], count: bucket.tones[tone], tone: `tone-${tone}` }))
              : PRIORITIES.map((priority) => ({ key: priority, label: PRIORITY_META[priority].label, count: bucket.priorities[priority], tone: PRIORITY_META[priority].tone }));
            const detail = groups.map((group) => `${group.label} ${group.count}`).join(' · ');
            return <div key={bucket.key} data-tooltip={`${bucket.label}｜TOTAL ${bucket.total}｜${detail}`}><span>{bucket.total || ''}</span><i style={{ height: `${Math.max(bucket.total ? 9 : 2, bucket.total / maxLoad * 100)}%` }}>{groups.map((group) => <b key={group.key} className={group.tone} style={{ height: `${bucket.total ? group.count / bucket.total * 100 : 0}%` }} />)}</i><small>{showLabel ? bucket.label : '·'}</small></div>;
          })}
        </div>
        <footer>{loadMode === 'factions' ? TONES.map((tone) => <span key={tone} className={`tone-${tone}`}><i />{TONE_META[tone].signal.split(' / ')[0]}</span>) : PRIORITIES.map((priority) => <span key={priority} className={PRIORITY_META[priority].tone}><i />{PRIORITY_META[priority].label}</span>)}<strong>{scale === 'quarter' ? '1 WEEK / BAR' : '1 DAY / BAR'}</strong></footer>
      </section>

      <section className="recovery-panel">
        <header><div><span>04 / REST ARCHIVE</span><h3>RECOVERY RHYTHM</h3></div></header>
        <div className="recovery-score"><article><span>SLEEP AVG</span><strong>{metrics.sleepAverage === null ? '--' : formatDuration(metrics.sleepAverage)}</strong><small>{metrics.sleepCount} NIGHT RECORDS</small></article><article><span>ACTIVE DAYS</span><strong>{metrics.activeDays}<i>/{periodDays}</i></strong><small>{period.label}</small></article></div>
        <div className="sleep-rhythm-strip">{sleepRecords.filter((record) => inPeriod(record.wakeAt, period)).sort((a, b) => +new Date(a.wakeAt) - +new Date(b.wakeAt)).map((record) => {
          const minutes = Math.max(0, +new Date(record.wakeAt) - +new Date(record.sleepStartedAt)) / MINUTE_MS;
          return <i key={record.id} style={{ height: `${Math.min(100, minutes / (10 * 60) * 100)}%` }} data-tooltip={`${dateKey(new Date(record.wakeAt))}｜睡眠 ${formatDuration(minutes)}`} />;
        })}</div>
        <footer><span>ZERO</span><strong>REST RECORDS / 睡眠时长分布</strong><span>10H+</span></footer>
      </section>
      </div>

      <section className="allocation-panel">
        <header><div><span>05 / TIME FACTIONS</span><h3>ALLOCATION MAP</h3></div></header>
        <div className="allocation-pies">
          <PieChart title="FACTION SHARE" subtitle="4 COLOR FACTIONS" segments={colorSegments} />
          <PieChart title="TYPE SHARE" subtitle="ALL TASK TYPES" segments={typeSegments} />
        </div>
      </section>

      <section className="time-rank-panel">
        <header><div><span>06 / PERFORMANCE SCAN</span><h3>TIME INTELLIGENCE</h3></div><div className="type-rank-mode" role="group" aria-label="选择任务类型排名依据"><button type="button" aria-pressed={typeRankMode === 'total'} onClick={() => setTypeRankMode('total')}>TOTAL 排名</button><button type="button" aria-pressed={typeRankMode === 'average'} onClick={() => setTypeRankMode('average')}>AVG 排名</button></div></header>
        <div className="color-time-roster">{metrics.tones.map((tone) => <article key={tone.tone} className={`tone-${tone.tone}`}><i /><div><span>{TONE_META[tone.tone].signal}</span><strong>{TONE_META[tone.tone].label}</strong></div><dl><div><dt>TOTAL</dt><dd>{formatDuration(tone.minutes)}</dd></div><div><dt>AVG / TASK</dt><dd>{formatDuration(tone.average)}</dd></div><div><dt>TASKS</dt><dd>{tone.count}</dd></div></dl></article>)}</div>
        <div className="type-rank-head"><span>RANK / TYPE</span><span>{typeRankMode === 'total' ? 'TOTAL SCALE' : 'AVG SCALE'}</span><span>TOTAL</span><span>AVG</span><span>SHARE</span></div>
        <div className="type-rank-list">{rankedTypes.map((type, index) => {
          const metric = typeRankMode === 'total' ? type.minutes : type.average;
          const totalMinutes = metrics.types.reduce((sum, item) => sum + item.minutes, 0);
          return <article key={type.label} className={`tone-${type.tone}`} data-tooltip={`${type.label}｜总计 ${formatDuration(type.minutes)}｜平均 ${formatDuration(type.average)}｜占比 ${totalMinutes ? (type.minutes / totalMinutes * 100).toFixed(1) : '0.0'}%`}><span>{String(index + 1).padStart(2, '0')}</span><strong>{type.label}<small>{type.count} TASKS</small></strong><div><i style={{ width: `${metric / maxTypeMetric * 100}%` }} /></div><b>{formatDuration(type.minutes)}</b><u>{formatDuration(type.average)}</u><em>{totalMinutes ? (type.minutes / totalMinutes * 100).toFixed(1) : '0.0'}%</em></article>;
        })}{!rankedTypes.length && <div className="dashboard-empty">NO TIME DATA / 本周期尚无可计算耗时</div>}</div>
      </section>

      <nav className="campaign-shortcuts" aria-label="功能页快捷入口">
        <button type="button" onClick={() => onNavigate('board')}><span>01</span><div><strong>DAILY OPS</strong><small>回到今天，立即行动</small></div><i>▶</i></button>
        <button type="button" onClick={() => onNavigate('table')}><span>02</span><div><strong>MISSION ARCHIVE</strong><small>检查完整任务档案</small></div><i>▦</i></button>
        <button type="button" onClick={() => onNavigate('sleep')}><span>03</span><div><strong>NIGHT LOG</strong><small>查看完整睡眠节奏</small></div><i>☾</i></button>
        <button type="button" onClick={() => onNavigate('calendar')}><span>04</span><div><strong>CALENDAR</strong><small>进入月度行动地图</small></div><i>◆</i></button>
      </nav>
    </div>
  </section>;
}
