'use client';

import type { CSSProperties } from 'react';
import type { SleepRecord } from '../lib/sleep-store';

type DashboardStatus = 'pending' | 'inProgress' | 'completed';
type DashboardTone = 'purple' | 'blue' | 'green' | 'yellow';

export type DashboardTask = {
  id: string;
  title: string;
  description: string;
  status: DashboardStatus;
  taskType: string;
  priority: 'must' | 'high' | 'medium' | 'low';
  location: string;
  startedAt: string;
  completedAt: string;
  dueAt: string;
  tone: DashboardTone;
};

type LifeDashboardProps = {
  username: string;
  now: Date;
  tasks: DashboardTask[];
  todayTasks: DashboardTask[];
  sleepRecords: SleepRecord[];
  onOpenTask: (id: string) => void;
  onStartTask: (id: string) => void;
  onNewTask: () => void;
  onNavigate: (view: 'board' | 'table' | 'calendar' | 'sleep') => void;
};

const DAY_MS = 24 * 60 * 60_000;
const MINUTE_MS = 60_000;

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function validDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function durationWithinDay(task: DashboardTask, day: Date, now: Date) {
  const start = validDate(task.startedAt);
  if (!start || task.status === 'pending') return 0;
  const rawEnd = task.status === 'completed' ? validDate(task.completedAt) : now;
  if (!rawEnd) return 0;
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = new Date(+dayStart + DAY_MS);
  return Math.max(0, Math.min(+rawEnd, +dayEnd) - Math.max(+start, +dayStart)) / MINUTE_MS;
}

function formatDuration(minutes: number) {
  if (minutes < 1) return '0m';
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return hours ? `${hours}h ${rest ? `${rest}m` : ''}`.trim() : `${rest}m`;
}

function formatClock(value: string) {
  const date = validDate(value);
  return date ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date) : '--:--';
}

function priorityRank(priority: DashboardTask['priority']) {
  return { must: 0, high: 1, medium: 2, low: 3 }[priority];
}

function nextTask(tasks: DashboardTask[], now: Date) {
  const active = tasks.filter((task) => task.status === 'inProgress')
    .sort((a, b) => +(validDate(b.startedAt) ?? 0) - +(validDate(a.startedAt) ?? 0));
  if (active[0]) return active[0];
  return tasks.filter((task) => task.status === 'pending').sort((a, b) => {
    const aTime = validDate(a.startedAt) ?? validDate(a.dueAt);
    const bTime = validDate(b.startedAt) ?? validDate(b.dueAt);
    const aFuture = aTime && +aTime >= +now ? +aTime : Number.MAX_SAFE_INTEGER;
    const bFuture = bTime && +bTime >= +now ? +bTime : Number.MAX_SAFE_INTEGER;
    return aFuture - bFuture || priorityRank(a.priority) - priorityRank(b.priority);
  })[0] ?? null;
}

function taskSignalTime(task: DashboardTask) {
  return validDate(task.startedAt) ?? validDate(task.dueAt) ?? validDate(task.completedAt);
}

export function LifeDashboard({ username, now, tasks, todayTasks, sleepRecords, onOpenTask, onStartTask, onNewTask, onNavigate }: LifeDashboardProps) {
  const completed = todayTasks.filter((task) => task.status === 'completed');
  const active = todayTasks.filter((task) => task.status === 'inProgress');
  const pending = todayTasks.filter((task) => task.status === 'pending');
  const completionRate = todayTasks.length ? Math.round(completed.length / todayTasks.length * 100) : 0;
  const trackedMinutes = todayTasks.reduce((total, task) => total + durationWithinDay(task, now, now), 0);
  const focus = nextTask(todayTasks, now);
  const latestSleep = sleepRecords[0] ?? null;
  const latestSleepMinutes = latestSleep ? (+new Date(latestSleep.wakeAt) - +new Date(latestSleep.sleepStartedAt)) / MINUTE_MS : 0;

  const categoryTotals = new Map<string, { label: string; minutes: number; tone: DashboardTone }>();
  todayTasks.forEach((task) => {
    const minutes = durationWithinDay(task, now, now);
    if (!minutes) return;
    const current = categoryTotals.get(task.taskType) ?? { label: task.taskType, minutes: 0, tone: task.tone };
    current.minutes += minutes;
    categoryTotals.set(task.taskType, current);
  });
  const categories = [...categoryTotals.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 4);
  const maxCategoryMinutes = Math.max(1, ...categories.map((category) => category.minutes));

  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - index));
    const key = dayKey(date);
    const cleared = tasks.filter((task) => task.completedAt && dayKey(new Date(task.completedAt)) === key);
    return {
      key,
      date,
      count: cleared.length,
      minutes: cleared.reduce((total, task) => total + durationWithinDay(task, date, now), 0),
    };
  });
  const maxDailyCount = Math.max(1, ...lastSevenDays.map((day) => day.count));
  const totalSevenDayClears = lastSevenDays.reduce((total, day) => total + day.count, 0);

  const agenda = [...todayTasks].sort((a, b) => +(taskSignalTime(a) ?? Number.MAX_SAFE_INTEGER) - +(taskSignalTime(b) ?? Number.MAX_SAFE_INTEGER)).slice(0, 5);
  const hour = now.getHours();
  const phase = hour < 6 ? 'MIDNIGHT CHANNEL' : hour < 12 ? 'MORNING PHASE' : hour < 18 ? 'DAYLIGHT PHASE' : 'EVENING PHASE';

  return <section className="life-dashboard" aria-label="生活监控 Dashboard">
    <header className="dashboard-command">
      <div className="dashboard-command-copy">
        <span>00 / HOME SIGNAL · {phase}</span>
        <h2>LIFE<br /><em>COMMAND</em></h2>
        <p><strong>{username}</strong>，今天的行动信号已接通。</p>
      </div>
      <div className="dashboard-clock" aria-label="当前时间">
        <time>{new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now)}</time>
        <span>{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(now)}</span>
        <i aria-hidden="true" />
      </div>
      <div className="dashboard-score">
        <span>TODAY&apos;S SYNC</span>
        <strong>{completionRate}<small>%</small></strong>
        <div><i style={{ width: `${completionRate}%` }} /></div>
        <p>{completed.length} CLEAR · {active.length} ACTIVE · {pending.length} WAITING</p>
      </div>
    </header>

    <div className="dashboard-grid">
      <section className="dashboard-focus-panel">
        <header><span>▶ CURRENT OBJECTIVE</span><strong>当前战况</strong></header>
        {focus ? <div className={`dashboard-focus-card tone-${focus.tone}`}>
          <div className="dashboard-focus-status"><span>{focus.status === 'inProgress' ? 'IN BATTLE' : 'NEXT MISSION'}</span><i>{focus.status === 'inProgress' ? 'LIVE' : focus.priority.toUpperCase()}</i></div>
          <h3>{focus.title}</h3>
          <p>{focus.description || `${focus.taskType} · ${focus.location}`}</p>
          <dl>
            <div><dt>START</dt><dd>{formatClock(focus.startedAt)}</dd></div>
            <div><dt>DEADLINE</dt><dd>{formatClock(focus.dueAt)}</dd></div>
            <div><dt>TYPE</dt><dd>{focus.taskType}</dd></div>
          </dl>
          <div className="dashboard-focus-actions">
            {focus.status === 'pending' && <button type="button" onClick={() => onStartTask(focus.id)}>▶ MISSION START</button>}
            <button type="button" onClick={() => onOpenTask(focus.id)}>OPEN DATA <span>›</span></button>
          </div>
        </div> : <button type="button" className="dashboard-free-state" onClick={onNewTask}><strong>FREE TIME!</strong><span>今日没有待处理任务 · 创建新的行动</span></button>}
      </section>

      <section className="dashboard-stat-panel">
        <header><span>REAL-TIME READOUT</span><strong>今日读数</strong></header>
        <div className="dashboard-stat-grid">
          <article><span>TRACKED TIME</span><strong>{formatDuration(trackedMinutes)}</strong><small>已记录行动耗时</small></article>
          <article><span>MISSION CLEAR</span><strong>{completed.length}<i>/{todayTasks.length}</i></strong><small>今日完成任务</small></article>
          <article><span>REST SIGNAL</span><strong>{latestSleep ? formatDuration(latestSleepMinutes) : '--'}</strong><small>{latestSleep ? '最近一次睡眠' : '暂无睡眠记录'}</small></article>
          <article><span>7D COMBO</span><strong>{totalSevenDayClears}</strong><small>近七日完成总数</small></article>
        </div>
      </section>

      <section className="dashboard-allocation-panel">
        <header><span>TIME DISTRIBUTION</span><strong>时间投入</strong></header>
        <div className="dashboard-allocation-list">
          {categories.map((category) => <article key={category.label} className={`tone-${category.tone}`}>
            <div><strong>{category.label}</strong><span>{formatDuration(category.minutes)}</span></div>
            <i><b style={{ width: `${category.minutes / maxCategoryMinutes * 100}%` }} /></i>
          </article>)}
          {!categories.length && <div className="dashboard-data-empty"><strong>NO TIME SIGNAL</strong><span>开始任务后，投入时间会出现在这里。</span></div>}
        </div>
      </section>

      <section className="dashboard-week-panel">
        <header><span>RESULT ARCHIVE</span><strong>七日战果</strong></header>
        <div className="dashboard-week-chart" role="img" aria-label={`近七日完成 ${totalSevenDayClears} 个任务`}>
          {lastSevenDays.map((day) => <div key={day.key} className={day.key === dayKey(now) ? 'is-today' : ''}>
            <span>{day.count}</span>
            <i style={{ '--bar-height': `${Math.max(day.count ? 18 : 4, day.count / maxDailyCount * 100)}%` } as CSSProperties}><b /></i>
            <small>{new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(day.date).toUpperCase()}</small>
          </div>)}
        </div>
      </section>

      <section className="dashboard-agenda-panel">
        <header><span>TODAY&apos;S CHANNEL</span><strong>行动序列</strong><button type="button" onClick={() => onNavigate('board')}>FULL OPS ›</button></header>
        <div className="dashboard-agenda-list">
          {agenda.map((task, index) => <button type="button" key={task.id} onClick={() => onOpenTask(task.id)} className={`tone-${task.tone}`}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <time>{formatClock((task.status === 'completed' ? task.completedAt : task.startedAt) || task.dueAt)}</time>
            <div><strong>{task.title}</strong><small>{task.taskType} · {task.status === 'completed' ? 'CLEAR' : task.status === 'inProgress' ? 'IN BATTLE' : 'STANDBY'}</small></div>
            <i>›</i>
          </button>)}
          {!agenda.length && <div className="dashboard-data-empty"><strong>OPEN CHANNEL</strong><span>今天的行动序列还是空的。</span></div>}
        </div>
      </section>

      <nav className="dashboard-shortcuts" aria-label="Dashboard 快速入口">
        <button type="button" onClick={() => onNavigate('board')}><span>01</span><strong>DAILY OPS</strong><small>每日作战计划</small><i>▶</i></button>
        <button type="button" onClick={() => onNavigate('calendar')}><span>04</span><strong>CALENDAR</strong><small>月度行动地图</small><i>◆</i></button>
        <button type="button" onClick={() => onNavigate('sleep')}><span>03</span><strong>NIGHT LOG</strong><small>夜间状态档案</small><i>☾</i></button>
        <button type="button" onClick={() => onNavigate('table')}><span>02</span><strong>ARCHIVE</strong><small>完整任务档案</small><i>▦</i></button>
      </nav>
    </div>
  </section>;
}
