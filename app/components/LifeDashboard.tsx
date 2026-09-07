'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import type { SleepRecord } from '../lib/sleep-store';

type DashboardStatus = 'pending' | 'inProgress' | 'completed';
type DashboardTone = 'purple' | 'blue' | 'green' | 'yellow';
type CampaignRange = 'week' | 'month' | 'quarter';

export type DashboardTask = {
  id: string;
  title: string;
  status: DashboardStatus;
  taskType: string;
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
  onNavigate: (view: 'board' | 'table' | 'calendar' | 'sleep') => void;
};

type TimeBucket = {
  key: string;
  label: string;
  clears: number;
  tones: Record<DashboardTone, number>;
  total: number;
};

const DAY_MS = 24 * 60 * 60_000;
const MINUTE_MS = 60_000;
const TONES: DashboardTone[] = ['purple', 'blue', 'green', 'yellow'];
const RANGE_META: Record<CampaignRange, { days: number; buckets: number; title: string; subtitle: string }> = {
  week: { days: 7, buckets: 7, title: '7D', subtitle: '周战役' },
  month: { days: 30, buckets: 6, title: '30D', subtitle: '月战役' },
  quarter: { days: 90, buckets: 9, title: '90D', subtitle: '季度战役' },
};
const TONE_META: Record<DashboardTone, { label: string; signal: string }> = {
  purple: { label: '成长阵营', signal: 'GROWTH' },
  blue: { label: '事务阵营', signal: 'TACTICS' },
  green: { label: '生活阵营', signal: 'LIFE' },
  yellow: { label: '恢复阵营', signal: 'RECOVERY' },
};

function validDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function intervalMinutes(task: DashboardTask, start: Date, end: Date, now: Date) {
  const taskStart = validDate(task.startedAt);
  if (!taskStart || task.status === 'pending') return 0;
  const rawEnd = task.status === 'completed' ? validDate(task.completedAt) : now;
  if (!rawEnd) return 0;
  return Math.max(0, Math.min(+rawEnd, +end) - Math.max(+taskStart, +start)) / MINUTE_MS;
}

function formatDuration(minutes: number) {
  if (minutes < 1) return '0m';
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return hours ? `${hours}h${rest ? ` ${rest}m` : ''}` : `${rest}m`;
}

function inRange(value: string, start: Date, end: Date) {
  const date = validDate(value);
  return Boolean(date && +date >= +start && +date < +end);
}

function buildBuckets(tasks: DashboardTask[], rangeStart: Date, rangeEnd: Date, count: number, now: Date): TimeBucket[] {
  const span = +rangeEnd - +rangeStart;
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(+rangeStart + span * index / count);
    const end = new Date(+rangeStart + span * (index + 1) / count);
    const tones = { purple: 0, blue: 0, green: 0, yellow: 0 } satisfies Record<DashboardTone, number>;
    tasks.forEach((task) => { tones[task.tone] += intervalMinutes(task, start, end, now); });
    const clears = tasks.filter((task) => inRange(task.completedAt, start, end)).length;
    const label = count === 7
      ? new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(start).toUpperCase()
      : `${start.getMonth() + 1}/${start.getDate()}`;
    return { key: start.toISOString(), label, clears, tones, total: TONES.reduce((sum, tone) => sum + tones[tone], 0) };
  });
}

function sleepAverage(records: SleepRecord[], start: Date, end: Date) {
  const matching = records.filter((record) => inRange(record.wakeAt, start, end));
  if (!matching.length) return { minutes: 0, count: 0 };
  return {
    minutes: matching.reduce((sum, record) => sum + Math.max(0, +new Date(record.wakeAt) - +new Date(record.sleepStartedAt)) / MINUTE_MS, 0) / matching.length,
    count: matching.length,
  };
}

export function LifeDashboard({ username, now, tasks, sleepRecords, onNavigate }: LifeDashboardProps) {
  const [range, setRange] = useState<CampaignRange>('month');
  const data = useMemo(() => {
    const meta = RANGE_META[range];
    const rangeEnd = new Date(+now + 1_000);
    const rangeStart = startOfDay(new Date(+now - (meta.days - 1) * DAY_MS));
    const trackedTasks = tasks.filter((task) => intervalMinutes(task, rangeStart, rangeEnd, now) > 0);
    const clearedTasks = tasks.filter((task) => inRange(task.completedAt, rangeStart, rangeEnd));
    const scopedTasks = tasks.filter((task) => trackedTasks.includes(task) || inRange(task.startedAt, rangeStart, rangeEnd) || inRange(task.dueAt, rangeStart, rangeEnd) || inRange(task.completedAt, rangeStart, rangeEnd));
    const buckets = buildBuckets(tasks, rangeStart, rangeEnd, meta.buckets, now);
    const toneMinutes = { purple: 0, blue: 0, green: 0, yellow: 0 } satisfies Record<DashboardTone, number>;
    const typeMinutes = new Map<string, { label: string; tone: DashboardTone; minutes: number }>();
    trackedTasks.forEach((task) => {
      const minutes = intervalMinutes(task, rangeStart, rangeEnd, now);
      toneMinutes[task.tone] += minutes;
      const type = typeMinutes.get(task.taskType) ?? { label: task.taskType, tone: task.tone, minutes: 0 };
      type.minutes += minutes;
      typeMinutes.set(task.taskType, type);
    });
    const totalMinutes = TONES.reduce((sum, tone) => sum + toneMinutes[tone], 0);
    const activeDates = new Set<string>();
    trackedTasks.forEach((task) => {
      const taskStart = validDate(task.startedAt);
      const taskEnd = task.status === 'completed' ? validDate(task.completedAt) : now;
      if (!taskStart || !taskEnd) return;
      let cursor = startOfDay(new Date(Math.max(+taskStart, +rangeStart)));
      const finalDay = startOfDay(new Date(Math.min(+taskEnd, +rangeEnd)));
      while (+cursor <= +finalDay) {
        activeDates.add(cursor.toISOString());
        cursor = new Date(+cursor + DAY_MS);
      }
    });
    return {
      meta,
      rangeStart,
      buckets,
      toneMinutes,
      totalMinutes,
      activeDays: Math.min(meta.days, activeDates.size),
      clearCount: clearedTasks.length,
      completionRate: scopedTasks.length ? Math.round(clearedTasks.length / scopedTasks.length * 100) : 0,
      types: [...typeMinutes.values()].sort((a, b) => b.minutes - a.minutes),
      sleep: sleepAverage(sleepRecords, rangeStart, rangeEnd),
    };
  }, [now, range, sleepRecords, tasks]);

  const maxBucketMinutes = Math.max(1, ...data.buckets.map((bucket) => bucket.total));
  const maxTypeMinutes = Math.max(1, ...data.types.map((type) => type.minutes));
  const maxClears = Math.max(1, ...data.buckets.map((bucket) => bucket.clears));
  const trendCoordinates = data.buckets.map((bucket, index) => ({
    x: data.buckets.length === 1 ? 300 : 24 + index * 552 / (data.buckets.length - 1),
    y: 134 - bucket.clears / maxClears * 104,
  }));
  const trendPoints = trendCoordinates.map((point) => `${point.x},${point.y}`).join(' ');
  let donutCursor = 0;
  const donutSegments = data.totalMinutes ? TONES.map((tone) => {
    const start = donutCursor;
    donutCursor += data.toneMinutes[tone] / data.totalMinutes * 100;
    return `var(--dashboard-${tone}) ${start}% ${donutCursor}%`;
  }).join(',') : 'rgba(17,18,15,.16) 0 100%';
  const periodLabel = `${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(data.rangeStart)} — ${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(now)}`;

  return <section className="life-dashboard" aria-label="长期生活战绩 Dashboard">
    <header className="campaign-header">
      <div className="campaign-title"><span>00 / PERFORMANCE ARCHIVE</span><h2>CAMPAIGN<br /><em>RECORD</em></h2><p><strong>{username}</strong> · 跨周期生活战绩监控</p></div>
      <div className="campaign-range" role="group" aria-label="选择分析时间范围">
        {(Object.entries(RANGE_META) as [CampaignRange, typeof RANGE_META[CampaignRange]][]).map(([key, meta]) => <button type="button" key={key} aria-pressed={range === key} onClick={() => setRange(key)}><strong>{meta.title}</strong><span>{meta.subtitle}</span></button>)}
      </div>
      <div className="campaign-period"><span>OBSERVATION WINDOW</span><strong>{periodLabel}</strong><small>{data.meta.days} DAYS OF BATTLE DATA</small></div>
    </header>

    <section className="campaign-scoreboard" aria-live="polite">
      <article><span>TRACKED TIME</span><strong>{formatDuration(data.totalMinutes)}</strong><small>区间内行动耗时</small></article>
      <article><span>MISSION CLEAR</span><strong>{data.clearCount}</strong><small>区间内完成任务</small></article>
      <article><span>CLEAR RATE</span><strong>{data.completionRate}<i>%</i></strong><small>有时间信号任务完成率</small></article>
      <article><span>ACTIVE DAYS</span><strong>{data.activeDays}<i>/{data.meta.days}</i></strong><small>产生行动记录的天数</small></article>
      <article><span>REST AVG</span><strong>{data.sleep.count ? formatDuration(data.sleep.minutes) : '--'}</strong><small>{data.sleep.count ? `${data.sleep.count} 条睡眠记录` : '暂无区间记录'}</small></article>
    </section>

    <div className="campaign-grid">
      <section className="battle-timeline-panel">
        <header><div><span>01 / TIME FRONTLINE</span><h3>耗时战线</h3></div><p>每根立体柱代表一个时间分段，颜色显示投入结构。</p></header>
        <div className="battle-legend">{TONES.map((tone) => <span key={tone} className={`tone-${tone}`}><i />{TONE_META[tone].label}</span>)}</div>
        <div className="battle-towers" role="img" aria-label={`${data.meta.days} 日不同颜色任务耗时堆叠图`}>
          {data.buckets.map((bucket) => <div className="battle-tower-unit" key={bucket.key} title={`${bucket.label} · ${formatDuration(bucket.total)} · ${bucket.clears} CLEAR`}>
            <span>{formatDuration(bucket.total)}</span>
            <div className="battle-tower" style={{ '--tower-height': `${Math.max(bucket.total ? 12 : 3, bucket.total / maxBucketMinutes * 100)}%` } as CSSProperties}>
              <div>{TONES.map((tone) => bucket.tones[tone] > 0 && <i key={tone} className={`tone-${tone}`} style={{ height: `${bucket.tones[tone] / bucket.total * 100}%` }} />)}</div>
            </div>
            <strong>{bucket.label}</strong><small>{bucket.clears} CLEAR</small>
          </div>)}
        </div>
      </section>

      <section className="faction-panel">
        <header><span>02 / COLOR FACTIONS</span><h3>颜色阵营占比</h3></header>
        <div className="faction-orbit-wrap">
          <div className="faction-orbit" style={{ '--faction-ring': `conic-gradient(${donutSegments})` } as CSSProperties}><span><strong>{formatDuration(data.totalMinutes)}</strong><small>TOTAL TIME</small></span></div>
        </div>
        <div className="faction-list">{TONES.map((tone, index) => {
          const share = data.totalMinutes ? data.toneMinutes[tone] / data.totalMinutes * 100 : 0;
          return <article key={tone} className={`tone-${tone}`}><span>0{index + 1}</span><i /><div><strong>{TONE_META[tone].signal}</strong><small>{TONE_META[tone].label}</small></div><b>{share.toFixed(1)}%</b><em>{formatDuration(data.toneMinutes[tone])}</em></article>;
        })}</div>
      </section>

      <section className="clear-trend-panel">
        <header><span>03 / CLEAR VELOCITY</span><h3>完成趋势</h3><strong>{data.clearCount} TOTAL</strong></header>
        <div className="clear-trend-chart" role="img" aria-label={`${data.meta.days} 日任务完成数量趋势`}>
          <svg viewBox="0 0 600 165" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="clear-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--color-signal)" stopOpacity=".62" /><stop offset="1" stopColor="var(--color-signal)" stopOpacity=".04" /></linearGradient></defs>
            <path className="clear-grid" d="M24 30H576M24 82H576M24 134H576" />
            {data.buckets.length > 1 && <><polygon className="clear-area" points={`24,134 ${trendPoints} 576,134`} /><polyline className="clear-line" points={trendPoints} /></>}
            {data.buckets.map((bucket, index) => <g key={bucket.key}><circle cx={trendCoordinates[index].x} cy={trendCoordinates[index].y} r="7" /><text x={trendCoordinates[index].x} y={trendCoordinates[index].y - 13}>{bucket.clears}</text></g>)}
          </svg>
          <div>{data.buckets.map((bucket) => <span key={bucket.key}>{bucket.label}</span>)}</div>
        </div>
      </section>

      <section className="type-league-panel">
        <header><div><span>04 / TYPE LEAGUE</span><h3>任务类型耗时排名</h3></div><p>比较具体任务类型，而不只是颜色大类。</p></header>
        <div className="type-league-list">{data.types.slice(0, 10).map((type, index) => {
          const share = data.totalMinutes ? type.minutes / data.totalMinutes * 100 : 0;
          return <article key={type.label} className={`tone-${type.tone}`}><span>{String(index + 1).padStart(2, '0')}</span><strong>{type.label}</strong><div><i style={{ width: `${type.minutes / maxTypeMinutes * 100}%` }} /></div><b>{formatDuration(type.minutes)}</b><em>{share.toFixed(1)}%</em></article>;
        })}{!data.types.length && <div className="campaign-empty"><strong>NO BATTLE DATA</strong><span>完成或开始任务后，这里会形成任务类型排名。</span></div>}</div>
      </section>

      <nav className="campaign-shortcuts" aria-label="功能页快捷入口">
        <button type="button" onClick={() => onNavigate('board')}><span>01</span><div><strong>DAILY OPS</strong><small>回到今天，立即行动</small></div><i>▶</i></button>
        <button type="button" onClick={() => onNavigate('table')}><span>02</span><div><strong>MISSION ARCHIVE</strong><small>检查完整任务档案</small></div><i>▦</i></button>
        <button type="button" onClick={() => onNavigate('sleep')}><span>03</span><div><strong>NIGHT LOG</strong><small>查看恢复与睡眠节奏</small></div><i>☾</i></button>
        <button type="button" onClick={() => onNavigate('calendar')}><span>04</span><div><strong>CALENDAR</strong><small>进入月度行动地图</small></div><i>◆</i></button>
      </nav>
    </div>
  </section>;
}
