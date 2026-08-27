'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { BrandLockup } from './components/BrandLockup';
import { loadPlannerState, savePlannerState } from './lib/planner-store';

type Status = 'pending' | 'inProgress' | 'completed';
type Priority = 'must' | 'high' | 'medium' | 'low';
type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly';
type View = 'board' | 'table' | 'calendar' | 'settings';
type ChoiceFieldName = 'status' | 'priority' | 'taskType' | 'location' | 'recurrence';
type DateFieldName = 'startedAt' | 'completedAt' | 'dueAt';
type TypeColor = 'purple' | 'blue' | 'green' | 'yellow';
type StartUrgency = 'oneHour' | 'halfHour' | 'fifteen' | 'five' | 'finalMinute' | 'finalTen' | 'overdue';
type ArchiveFilterOption = { value: string; label: string; tone?: string };
type ScheduleVariant = 'pending-start' | 'pending-deadline' | 'in-progress' | 'completed';
type DayScheduleBlock = { id: string; task: Task; startMinute: number; endMinute: number; labelStartMinute: number; labelEndMinute: number; lane: number; laneCount: number; offline: boolean; variant: ScheduleVariant; continuesBefore: boolean; continuesAfter: boolean; terminal: boolean };

type Task = {
  id: string;
  index: number;
  title: string;
  description: string;
  status: Status;
  taskType: string;
  startedAt: string;
  completedAt: string;
  dueAt: string;
  priority: Priority;
  location: string;
  recurrence: Recurrence;
  recurrenceDays: number[];
  seriesId: string;
  seriesHead: boolean;
  lastGeneratedDate: string;
  manualOrder: number | null;
};

type PlannerSettings = {
  username: string;
  taskTypes: { value: string; color: TypeColor; custom?: boolean }[];
  locations: { value: string; custom?: boolean }[];
  defaultTaskType: string;
  defaultLocation: string;
};

const BASE_TYPES: PlannerSettings['taskTypes'] = [
  ...['🧬 个人', '📚 学业', '🎯 复习', '✍️ 考试', '💼 工作', '📕 阅读', '🎓 证书', '🧠 复盘'].map((value) => ({ value, color: 'purple' as const })),
  ...['⏰ 作息', '✉️ 邮件', '📅 会议', '🚪 出行'].map((value) => ({ value, color: 'blue' as const })),
  ...['🍽️ 饮食', '🛒 购物', '📋 杂事', '🧹 家务', '🫧 卫生'].map((value) => ({ value, color: 'green' as const })),
  ...['🏃‍➡️ 运动', '🧘 冥想', '🎈 聚会', '🎮 娱乐', '🛏️ 休息'].map((value) => ({ value, color: 'yellow' as const })),
];
const BASE_LOCATIONS = ['🏠 家', '🏢 公司', '🏫 学校', '💻 线上', '🏃 户外', '✈️ 机场', '🚉 车站', '🛒 超市', '📍 其他'].map((value) => ({ value }));
const DEFAULT_SETTINGS: PlannerSettings = { username: '2DimensionalM', taskTypes: BASE_TYPES, locations: BASE_LOCATIONS, defaultTaskType: '🧬 个人', defaultLocation: '🏠 家' };
const TASK_KEY = 'sao-planner-tasks-v2';
const LEGACY_TASK_KEY = 'sao-planner-tasks-v1';
const SETTINGS_KEY = 'sao-planner-settings-v1';
const THEME_KEY = 'sao-planner-theme-v1';
const VIEW_SESSION_KEY = 'sao-planner-active-view-v1';
const VISIBLE_LIMIT: Record<Status, number> = { pending: 5, inProgress: 5, completed: 5 };
const STATUS_ORDER: Record<Status, number> = { inProgress: 0, pending: 1, completed: 2 };
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const TYPE_COLOR_ORDER: Record<TypeColor, number> = { purple: 0, blue: 1, green: 2, yellow: 3 };
const ACTION_DAY_START = 7 * 60;
const ACTION_DAY_NIGHT_END = 2 * 60;
const ACTION_DAY_MAIN_MINUTES = 19 * 60;
const ACTION_DAY_OFFLINE_DISPLAY_MINUTES = 120;
const ACTION_DAY_DISPLAY_MINUTES = ACTION_DAY_MAIN_MINUTES + ACTION_DAY_OFFLINE_DISPLAY_MINUTES;

function sortedTaskTypes(taskTypes: PlannerSettings['taskTypes']) {
  return [...taskTypes].sort((a, b) => TYPE_COLOR_ORDER[a.color] - TYPE_COLOR_ORDER[b.color]);
}

function normalizeSettings(raw: Partial<PlannerSettings> | null | undefined): PlannerSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  return {
    ...merged,
    username: typeof merged.username === 'string' && merged.username.trim() ? merged.username.trim() : DEFAULT_SETTINGS.username,
    taskTypes: sortedTaskTypes(Array.isArray(merged.taskTypes) ? merged.taskTypes : BASE_TYPES),
    locations: Array.isArray(merged.locations) ? merged.locations : BASE_LOCATIONS,
  };
}

const boardMeta: { id: Status; index: string; title: string; subtitle: string }[] = [
  { id: 'pending', index: '01', title: 'PENDING', subtitle: '等待行动' },
  { id: 'inProgress', index: '02', title: 'IN PROGRESS', subtitle: '正在攻略' },
  { id: 'completed', index: '03', title: 'COMPLETED', subtitle: '今日战果' },
];

const navItems: { id: View; no: string; title: string; subtitle: string; mark: string }[] = [
  { id: 'board', no: '01', title: 'DAILY OPS', subtitle: '每日作战计划', mark: '▶' },
  { id: 'table', no: '02', title: 'MISSION ARCHIVE', subtitle: '任务档案表', mark: '▦' },
  { id: 'calendar', no: '03', title: 'CALENDAR', subtitle: '月度行动日历', mark: '◆' },
  { id: 'settings', no: '04', title: 'DESIGN', subtitle: '默认设置', mark: '✦' },
];

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateAt(offset: number, hour: number, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function newTask(settings: PlannerSettings, index: number): Task {
  const id = crypto.randomUUID();
  return {
    id, index, title: '', description: '', status: 'pending', taskType: settings.defaultTaskType,
    startedAt: '', completedAt: '', dueAt: '', priority: 'medium', location: settings.defaultLocation,
    recurrence: 'none', recurrenceDays: [new Date().getDay()], seriesId: id, seriesHead: false,
    lastGeneratedDate: localDateKey(new Date()), manualOrder: null,
  };
}

function seedTasks(): Task[] {
  const today = localDateKey(new Date());
  const make = (index: number) => newTask(DEFAULT_SETTINGS, index);
  return [
    { ...make(1), id: 'seed-build', seriesId: 'seed-build', title: '完善 Sword Art Online 计划页', description: '完成三栏看板的核心交互与视觉基线。', taskType: '🧬 个人', priority: 'high', dueAt: dateAt(0, 22), lastGeneratedDate: today },
    { ...make(2), id: 'seed-review', seriesId: 'seed-review', title: '复盘本周行动与计划偏差', taskType: '🧠 复盘', priority: 'medium', dueAt: dateAt(1, 10, 30), location: '💻 线上', recurrence: 'weekly', recurrenceDays: [new Date().getDay()], seriesHead: true, lastGeneratedDate: today },
    { ...make(3), id: 'seed-email', seriesId: 'seed-email', title: '回复项目邮件', taskType: '✉️ 邮件', priority: 'high', dueAt: dateAt(0, 18, 30), location: '🏢 公司', lastGeneratedDate: today },
    { ...make(4), id: 'seed-cert', seriesId: 'seed-cert', title: '学习 Data Engineering 课程', taskType: '🎓 证书', priority: 'low', location: '💻 线上', lastGeneratedDate: today },
    { ...make(5), id: 'seed-work', seriesId: 'seed-work', title: '整理数据管道需求', description: '把散落的需求合并为一个可执行清单。', status: 'inProgress', taskType: '💼 工作', priority: 'high', startedAt: dateAt(0, Math.max(0, new Date().getHours() - 2), 5), location: '🏢 公司', lastGeneratedDate: today },
    { ...make(6), id: 'seed-lunch', seriesId: 'seed-lunch', title: '吃午饭并离开屏幕', status: 'completed', taskType: '🍽️ 饮食', priority: 'medium', startedAt: dateAt(0, 12, 30), completedAt: dateAt(0, 13, 10), location: '🏠 家', recurrence: 'daily', seriesHead: true, lastGeneratedDate: today },
  ];
}

function normalizeTasks(raw: Partial<Task>[]): Task[] {
  const today = localDateKey(new Date());
  return raw.map((task, position) => ({
    ...newTask(DEFAULT_SETTINGS, position + 1),
    ...task,
    index: task.index ?? position + 1,
    recurrenceDays: task.recurrenceDays ?? [Number((task as Partial<Task> & { recurrenceDay?: number }).recurrenceDay ?? new Date().getDay())],
    seriesId: task.seriesId ?? task.id ?? crypto.randomUUID(),
    seriesHead: task.seriesHead ?? (task.recurrence !== undefined && task.recurrence !== 'none'),
    lastGeneratedDate: task.lastGeneratedDate ?? (task as Partial<Task> & { lastResetDate?: string }).lastResetDate ?? today,
    manualOrder: task.manualOrder ?? null,
  }));
}

function typeColor(type: string, settings: PlannerSettings) {
  return settings.taskTypes.find((item) => item.value === type)?.color ?? 'purple';
}

function sortTasks(tasks: Task[], status: Status) {
  return [...tasks].sort((a, b) => {
    const hasManualOrder = tasks.some((task) => task.manualOrder !== null);
    if (status !== 'completed' && hasManualOrder) return (a.manualOrder ?? Number.MAX_SAFE_INTEGER) - (b.manualOrder ?? Number.MAX_SAFE_INTEGER);
    if (status === 'pending') return b.index - a.index;
    if (status === 'inProgress') return +new Date(b.startedAt || 0) - +new Date(a.startedAt || 0);
    return +new Date(b.completedAt || 0) - +new Date(a.completedAt || 0);
  });
}

function transitionTask(task: Task, next: Status): Task {
  if (task.status === next) return task;
  const now = new Date().toISOString();
  if (next === 'pending') return { ...task, status: next, startedAt: '', completedAt: '', manualOrder: null };
  if (next === 'inProgress') return { ...task, status: next, startedAt: now, completedAt: '', manualOrder: null };
  return { ...task, status: next, startedAt: task.startedAt || now, completedAt: now, manualOrder: null };
}

function shouldGenerate(task: Task, now: Date) {
  if (task.recurrence === 'daily') return true;
  if (task.recurrence === 'weekdays') return now.getDay() > 0 && now.getDay() < 6;
  if (task.recurrence === 'weekly') return task.recurrenceDays.includes(now.getDay());
  return false;
}

function processRecurring(tasks: Task[]) {
  const now = new Date();
  const today = localDateKey(now);
  let nextIndex = tasks.reduce((max, task) => Math.max(max, task.index), 0) + 1;
  const generated: Task[] = [];
  const updated = tasks.map((task) => {
    if (!task.seriesHead || task.recurrence === 'none' || task.lastGeneratedDate === today || !shouldGenerate(task, now)) return task;
    let dueAt = task.dueAt;
    if (dueAt) {
      const due = new Date(dueAt);
      due.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
      dueAt = due.toISOString();
    }
    const next: Task = {
      ...task, id: crypto.randomUUID(), index: nextIndex++, status: 'pending', startedAt: '', completedAt: '', dueAt,
      seriesHead: true, lastGeneratedDate: today, manualOrder: null,
    };
    generated.push(next);
    return { ...task, seriesHead: false, lastGeneratedDate: today };
  });
  if (!generated.length) return tasks;
  const existingPending = sortTasks(updated.filter((task) => task.status === 'pending'), 'pending');
  if (!existingPending.some((task) => task.manualOrder !== null)) return [...updated, ...generated];
  const orderedPending = [...generated, ...existingPending];
  const ranks = new Map(orderedPending.map((task, index) => [task.id, index]));
  return [...updated, ...generated].map((task) => task.status === 'pending' ? { ...task, manualOrder: ranks.get(task.id) ?? null } : task);
}

function formatTime(value: string, includeDate = true) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', includeDate
    ? { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }
    : { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

function statusLabel(status: Status) {
  return status === 'pending' ? 'PENDING' : status === 'inProgress' ? 'IN PROGRESS' : 'COMPLETED';
}

function priorityLabel(priority: Priority) {
  if (priority === 'must') return '必 · MUST';
  if (priority === 'high') return '高 · HIGH';
  if (priority === 'medium') return '中 · MID';
  return '低 · LOW';
}

function recurrenceLabel(task: Task) {
  if (task.recurrence === 'none') return '不循环';
  if (task.recurrence === 'daily') return '每天';
  if (task.recurrence === 'weekdays') return '工作日';
  return `每周 · ${task.recurrenceDays.map((day) => `周${WEEKDAYS[day]}`).join(' / ')}`;
}

function taskScheduleRange(task: Task, referenceNow = new Date()) {
  if (task.status === 'pending') {
    if (task.startedAt) {
      const start = new Date(task.startedAt);
      return { start, end: new Date(+start + 75 * 60_000), variant: 'pending-start' as const };
    }
    if (task.dueAt) {
      const end = new Date(task.dueAt);
      return { start: new Date(+end - 75 * 60_000), end, variant: 'pending-deadline' as const };
    }
    return null;
  }
  if (task.status === 'inProgress') {
    const start = new Date(task.startedAt || task.dueAt || referenceNow.toISOString());
    const end = +referenceNow > +start ? referenceNow : new Date(+start + 60_000);
    return { start, end, variant: 'in-progress' as const };
  }
  const end = new Date(task.completedAt || task.dueAt || task.startedAt);
  if (Number.isNaN(+end)) return null;
  const start = task.startedAt ? new Date(task.startedAt) : new Date(+end - 45 * 60_000);
  return { start, end: +end > +start ? end : new Date(+start + 45 * 60_000), variant: 'completed' as const };
}

function calendarTaskDate(task: Task, referenceNow = new Date()) {
  return taskScheduleRange(task, referenceNow)?.start.toISOString() || '';
}

function taskOccursOnCalendarDay(task: Task, dayKey: string, referenceNow = new Date()) {
  if (task.status === 'pending') {
    const marker = task.startedAt || task.dueAt;
    return Boolean(marker) && localDateKey(new Date(marker)) === dayKey;
  }
  const range = taskScheduleRange(task, referenceNow);
  if (!range) return false;
  const dayStart = new Date(`${dayKey}T00:00:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return +range.start < +dayEnd && +range.end > +dayStart;
}

function taskOccursInActionDay(task: Task, dayKey: string, referenceNow = new Date()) {
  const range = taskScheduleRange(task, referenceNow);
  if (!range) return false;
  const actionStart = new Date(`${dayKey}T00:00:00`);
  const actionEnd = new Date(actionStart);
  actionEnd.setDate(actionEnd.getDate() + 1);
  actionEnd.setHours(2, 0, 0, 0);
  return +range.start < +actionEnd && +range.end > +actionStart;
}

function minuteLabel(minutes: number) {
  const total = ((Math.max(0, Math.round(minutes)) % (24 * 60)) + (24 * 60)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function scheduleTimeLabel(variant: ScheduleVariant, startMinute: number, endMinute: number, terminal = true) {
  if (variant === 'pending-start') return `START ${minuteLabel(startMinute)}`;
  if (variant === 'pending-deadline') return `DEADLINE ${minuteLabel(endMinute)}`;
  if (variant === 'in-progress') return terminal ? `${minuteLabel(startMinute)} → NOW ${minuteLabel(endMinute)}` : `${minuteLabel(startMinute)}–${minuteLabel(endMinute)}`;
  return `${minuteLabel(startMinute)}–${minuteLabel(endMinute)}`;
}

function taskWindowOnDay(task: Task, dayKey: string, referenceNow = new Date()) {
  const dayStart = new Date(`${dayKey}T00:00:00`);
  const calendarEnd = new Date(dayStart);
  calendarEnd.setDate(calendarEnd.getDate() + 1);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  dayEnd.setHours(2, 0, 0, 0);
  const range = taskScheduleRange(task, referenceNow);
  if (!range) return null;
  const start = new Date(Math.max(+range.start, +dayStart));
  const end = new Date(Math.min(+range.end, +dayEnd));
  if (+end <= +start) return null;
  const realDuration = +range.end - +range.start;
  const canCrossDay = range.variant === 'in-progress' || range.variant === 'completed';
  return { startMinute: (+start - +dayStart) / 60_000, endMinute: (+end - +dayStart) / 60_000, variant: range.variant, continuesBefore: canCrossDay && +range.start < +dayStart && realDuration > 0, continuesAfter: canCrossDay && +range.start < +calendarEnd && +range.end > +calendarEnd && realDuration > 0, endsAfterWindow: +range.end > +dayEnd };
}

function actionDayMinute(minute: number) {
  if (minute <= ACTION_DAY_START) return minute * ACTION_DAY_OFFLINE_DISPLAY_MINUTES / ACTION_DAY_START;
  if (minute <= 24 * 60) return ACTION_DAY_OFFLINE_DISPLAY_MINUTES + minute - ACTION_DAY_START;
  return ACTION_DAY_OFFLINE_DISPLAY_MINUTES + ACTION_DAY_MAIN_MINUTES - ACTION_DAY_NIGHT_END + minute - 24 * 60;
}

function layoutDaySchedule(tasks: Task[], dayKey: string, referenceNow = new Date()): DayScheduleBlock[] {
  const windows = tasks.flatMap((task) => {
    const window = taskWindowOnDay(task, dayKey, referenceNow);
    if (!window) return [];
    if (window.variant === 'pending-start' || window.variant === 'pending-deadline') {
      const anchor = window.variant === 'pending-start' ? window.startMinute : window.endMinute;
      const anchorDisplay = actionDayMinute(anchor);
      const markerSize = 75;
      const markerStart = Math.max(0, Math.min(ACTION_DAY_DISPLAY_MINUTES - markerSize, window.variant === 'pending-start' ? anchorDisplay : anchorDisplay - markerSize));
      return [{ id: `${task.id}-marker`, task, startMinute: markerStart, endMinute: markerStart + markerSize, labelStartMinute: window.startMinute, labelEndMinute: window.endMinute, lane: 0, laneCount: 1, offline: anchor >= ACTION_DAY_NIGHT_END && anchor < ACTION_DAY_START, variant: window.variant, continuesBefore: false, continuesAfter: false, terminal: true }];
    }
    return [{
      id: `${task.id}-range`,
      task,
      startMinute: actionDayMinute(window.startMinute),
      endMinute: actionDayMinute(window.endMinute),
      labelStartMinute: window.startMinute,
      labelEndMinute: window.endMinute,
      lane: 0,
      laneCount: 1,
      offline: window.endMinute <= ACTION_DAY_START,
      variant: window.variant,
      continuesBefore: window.continuesBefore,
      continuesAfter: window.continuesAfter,
      terminal: !window.endsAfterWindow,
    }];
  }).sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  const laidOut: DayScheduleBlock[] = [];
  let group: DayScheduleBlock[] = [];
  let groupEnd = -1;
  const flushGroup = () => {
    const laneEnds: number[] = [];
    group.forEach((block) => {
      const lane = laneEnds.findIndex((end) => end <= block.startMinute);
      block.lane = lane === -1 ? laneEnds.length : lane;
      laneEnds[block.lane] = block.endMinute;
    });
    group.forEach((block) => { block.laneCount = laneEnds.length; });
    laidOut.push(...group);
    group = [];
    groupEnd = -1;
  };
  windows.forEach((block) => {
    if (group.length && block.startMinute >= groupEnd) flushGroup();
    group.push(block);
    groupEnd = Math.max(groupEnd, block.endMinute);
  });
  if (group.length) flushGroup();
  return laidOut;
}

function startUrgency(task: Task, now: Date): StartUrgency | null {
  if (task.status !== 'pending' || !task.startedAt) return null;
  const remaining = +new Date(task.startedAt) - +now;
  if (remaining <= 0) return 'overdue';
  if (remaining <= 10_000) return 'finalTen';
  if (remaining <= 60_000) return 'finalMinute';
  if (remaining <= 5 * 60_000) return 'five';
  if (remaining <= 15 * 60_000) return 'fifteen';
  if (remaining <= 30 * 60_000) return 'halfHour';
  if (remaining <= 60 * 60_000) return 'oneHour';
  return null;
}

function countdownText(task: Task, now: Date) {
  const difference = +new Date(task.startedAt) - +now;
  const absoluteSeconds = Math.max(0, Math.floor(Math.abs(difference) / 1000));
  const hours = Math.floor(absoluteSeconds / 3600);
  const minutes = Math.floor((absoluteSeconds % 3600) / 60);
  const seconds = absoluteSeconds % 60;
  const clock = `${hours ? `${String(hours).padStart(2, '0')}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return difference <= 0 ? `+${clock}` : `T−${clock}`;
}

function startUrgencyLabel(urgency: StartUrgency) {
  if (urgency === 'overdue') return 'START WINDOW BREACHED / 立即开始';
  if (urgency === 'finalTen') return 'DANGER · 最后十秒';
  if (urgency === 'finalMinute') return 'FINAL MINUTE / 最后一分钟';
  if (urgency === 'five') return '5 MIN ALERT / 五分钟提醒';
  if (urgency === 'fifteen') return '15 MIN ALERT / 十五分钟提醒';
  if (urgency === 'halfHour') return '30 MIN ALERT / 半小时提醒';
  if (urgency === 'oneHour') return '1 HOUR ALERT / 一小时提醒';
  return '1 HOUR ALERT / 一小时提醒';
}

function ChoiceField({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return <button type="button" className="choice-field" onClick={onClick}><span>{label}</span><strong>{value}</strong><i>›</i></button>;
}

function DateChoice({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return <button type="button" className="choice-field date-choice" onClick={onClick}><span>{label}</span><strong>{value ? formatTime(value) : '未设置'}</strong><i>◷</i></button>;
}

function ArchiveFilterMenu({ label, mark, value, options, onChange }: {
  label: string; mark: string; value: string; options: ArchiveFilterOption[]; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return <div className={`archive-filter ${open ? 'is-open' : ''}`} ref={rootRef}>
    <span>{label}</span>
    <button type="button" className="archive-filter-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <i aria-hidden="true">{mark}</i><strong>{selected.label}</strong><em aria-hidden="true">⌄</em>
    </button>
    {open && <div className="archive-filter-menu" role="listbox" aria-label={`${label} 筛选`}>
      <small>SELECT / 选择</small>
      {options.map((option, index) => <button type="button" role="option" aria-selected={option.value === value} className={`archive-filter-option ${option.value === value ? 'active' : ''} ${option.tone ? `tone-${option.tone}` : ''}`} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>
        <span>{String(index + 1).padStart(2, '0')}</span><strong>{option.label}</strong><i aria-hidden="true">{option.value === value ? '◆' : '›'}</i>
      </button>)}
    </div>}
  </div>;
}

function TaskCard({ task, color, now, dragging, landed, onOpen, onStart, onDragStart, onDragEnd, onDragOver, onDrop }: {
  task: Task; color: TypeColor; now: Date; dragging: boolean; landed: boolean; onOpen: () => void;
  onStart: () => void;
  onDragStart: (event: React.DragEvent<HTMLElement>) => void; onDragEnd: () => void;
  onDragOver: (event: React.DragEvent<HTMLElement>) => void; onDrop: (event: React.DragEvent<HTMLElement>) => void;
}) {
  const urgency = startUrgency(task, now);
  return <article className={`task-card status-${task.status} type-${color} priority-${task.priority} ${urgency ? `has-start-countdown start-${urgency}` : ''} ${dragging ? 'is-dragging' : ''} ${landed ? 'is-landed' : ''}`}
    draggable tabIndex={0} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver} onDrop={onDrop} onClick={onOpen}
    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } }}>
    <div className="card-stripe" />
    <div className="card-topline"><span className="task-type">{task.taskType}</span><div className="task-flags">{task.recurrence !== 'none' && <span title={recurrenceLabel(task)} className="repeat-icon">↻</span>}<span className="priority-label">{task.priority === 'must' ? 'MUST' : task.priority === 'high' ? 'HIGH' : task.priority === 'medium' ? 'MID' : 'LOW'}</span></div></div>
    <h3>{task.title}</h3>
    <p className={`card-description ${task.description ? '' : 'is-empty'}`} aria-hidden={task.description ? undefined : true}>{task.description || '\u00a0'}</p>
    {task.status === 'inProgress' && <span className="mission-state-signal" aria-hidden="true">LIVE</span>}
    {task.status === 'completed' && <span className="mission-state-signal" aria-hidden="true">CLEAR</span>}
    {urgency && <div className={`start-countdown urgency-${urgency}`} role={urgency === 'overdue' || urgency === 'finalTen' ? 'alert' : 'status'}><div><span>{startUrgencyLabel(urgency)}</span><strong>{countdownText(task, now)}</strong><small>{formatTime(task.startedAt, false)} START</small></div><button type="button" onClick={(event) => { event.stopPropagation(); onStart(); }}>▶ ENGAGE</button></div>}
    <div className="card-meta"><span>{task.location}</span>
      {task.status === 'pending' && <span className={task.dueAt && +new Date(task.dueAt) < +now ? 'is-overdue' : ''}>⌁ {task.dueAt ? formatTime(task.dueAt) : 'NO DEADLINE'}</span>}
      {task.status === 'inProgress' && <span>▶ {formatTime(task.startedAt)}</span>}
      {task.status === 'completed' && <span>✓ {formatTime(task.completedAt)}</span>}
    </div><span className="drag-hint" aria-hidden="true">⋮⋮</span>
  </article>;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>(seedTasks);
  const [settings, setSettings] = useState<PlannerSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveRetry, setSaveRetry] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  const databaseRevision = useRef(0);
  const lastPersistedSnapshot = useRef('');
  const saveQueue = useRef(Promise.resolve());
  const startReminderBands = useRef(new Map<string, StartUrgency>());
  const startRemindersReady = useRef(false);
  const [view, setView] = useState<View>('board');
  const [viewRestored, setViewRestored] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);
  const [introMinimumMet, setIntroMinimumMet] = useState(false);
  const [introProgress, setIntroProgress] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const [theme, setTheme] = useState<'day' | 'night'>('day');
  const [pageMotion, setPageMotion] = useState<'idle' | 'exit' | 'enter'>('idle');
  const [pageDirection, setPageDirection] = useState<'forward' | 'backward'>('forward');
  const [showAll, setShowAll] = useState<Record<Status, boolean>>({ pending: false, inProgress: false, completed: false });
  const [showCompletedHistory, setShowCompletedHistory] = useState(false);
  const [draggingId, setDraggingId] = useState('');
  const [dropTarget, setDropTarget] = useState<Status | ''>('');
  const [landedId, setLandedId] = useState('');
  const [impact, setImpact] = useState<{ title: string; subtitle: string; tier?: StartUrgency | 'action' } | null>(null);
  const [draft, setDraft] = useState<Task | null>(null);
  const [choiceField, setChoiceField] = useState<ChoiceFieldName | null>(null);
  const [dateField, setDateField] = useState<DateFieldName | null>(null);
  const [pickerDate, setPickerDate] = useState(localDateKey(new Date()));
  const [pickerTime, setPickerTime] = useState('12:00');
  const [pickerMonth, setPickerMonth] = useState(() => { const date = new Date(); date.setDate(1); return date; });
  const [toast, setToast] = useState('');
  const [tableQuery, setTableQuery] = useState('');
  const [tableStatus, setTableStatus] = useState<Status | 'all'>('all');
  const [tableType, setTableType] = useState('all');
  const [tablePriority, setTablePriority] = useState<Priority | 'all'>('all');
  const [calendarMonth, setCalendarMonth] = useState(() => { const date = new Date(); date.setDate(1); return date; });
  const [selectedDay, setSelectedDay] = useState(localDateKey(new Date()));
  const [dayAgendaOpen, setDayAgendaOpen] = useState(false);
  const [customType, setCustomType] = useState('');
  const [customTypeColor, setCustomTypeColor] = useState<TypeColor>('purple');
  const [customLocation, setCustomLocation] = useState('');

  useEffect(() => {
    const savedView = window.sessionStorage.getItem(VIEW_SESSION_KEY);
    const restoredView = navItems.some((item) => item.id === savedView) ? savedView as View : navItems[0].id;
    const timers = [window.setTimeout(() => {
      setView(restoredView);
      setViewRestored(true);
      if (restoredView === navItems[0].id) {
        setIntroVisible(true);
        setIntroProgress(8);
      }
    }, 0)];
    if (restoredView === navItems[0].id) timers.push(
      window.setTimeout(() => setIntroProgress(27), 260),
      window.setTimeout(() => setIntroProgress(51), 620),
      window.setTimeout(() => setIntroProgress(73), 1_020),
      window.setTimeout(() => setIntroProgress(89), 1_430),
      window.setTimeout(() => setIntroMinimumMet(true), 1_850),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (!viewRestored) return;
    window.sessionStorage.setItem(VIEW_SESSION_KEY, view);
  }, [view, viewRestored]);

  useEffect(() => {
    if (!introVisible || !introMinimumMet || !hydrated) return;
    const progressTimer = window.setTimeout(() => setIntroProgress(100), 0);
    const finishTimer = window.setTimeout(() => setIntroVisible(false), 380);
    return () => { window.clearTimeout(progressTimer); window.clearTimeout(finishTimer); };
  }, [hydrated, introMinimumMet, introVisible]);

  useEffect(() => {
    let cancelled = false;

    const hydrateFromDatabase = async () => {
      try {
        let databaseState = await loadPlannerState<Task, PlannerSettings>();
        if (cancelled) return;

        if (!databaseState.initialized) {
          const savedTasks = localStorage.getItem(TASK_KEY) || localStorage.getItem(LEGACY_TASK_KEY);
          const savedSettings = localStorage.getItem(SETTINGS_KEY);
          const savedTheme = localStorage.getItem(THEME_KEY);
          const importedSettings = normalizeSettings(savedSettings ? JSON.parse(savedSettings) : null);
          const importedTheme = savedTheme === 'night' ? 'night' : 'day';
          const importedTasks = processRecurring(savedTasks ? normalizeTasks(JSON.parse(savedTasks)) : seedTasks());
          const imported = await savePlannerState<Task, PlannerSettings>({
            expectedRevision: databaseState.revision,
            tasks: importedTasks,
            settings: importedSettings,
            theme: importedTheme,
            migrationSource: `localStorage@${window.location.origin}`,
          });
          databaseState = imported.state;
          localStorage.removeItem(TASK_KEY);
          localStorage.removeItem(LEGACY_TASK_KEY);
          localStorage.removeItem(SETTINGS_KEY);
          localStorage.removeItem(THEME_KEY);
        }

        if (cancelled) return;
        const normalizedSettings = normalizeSettings(databaseState.settings);
        const normalizedTasks = normalizeTasks(databaseState.tasks);
        const recurringTasks = processRecurring(normalizedTasks);
        databaseRevision.current = databaseState.revision;
        lastPersistedSnapshot.current = JSON.stringify({
          tasks: normalizedTasks,
          settings: normalizedSettings,
          theme: databaseState.theme,
        });
        setSettings(normalizedSettings);
        setTheme(databaseState.theme);
        setTasks(recurringTasks);
        setHydrated(true);
      } catch (error) {
        if (!cancelled) setStorageError(error instanceof Error ? error.message : '无法连接本地数据库');
      }
    };

    void hydrateFromDatabase();
    return () => { cancelled = true; };
  }, [loadAttempt]);

  useEffect(() => {
    if (!hydrated) return;
    const snapshot = JSON.stringify({ tasks, settings, theme });
    if (snapshot === lastPersistedSnapshot.current) return;
    const timer = window.setTimeout(() => {
      saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
        if (snapshot === lastPersistedSnapshot.current) return;
        try {
          const pending = JSON.parse(snapshot) as { tasks: Task[]; settings: PlannerSettings; theme: 'day' | 'night' };
          const result = await savePlannerState<Task, PlannerSettings>({
            expectedRevision: databaseRevision.current,
            ...pending,
          });
          databaseRevision.current = result.state.revision;
          if (result.conflicted) {
            const currentSettings = normalizeSettings(result.state.settings);
            const currentTasks = normalizeTasks(result.state.tasks);
            lastPersistedSnapshot.current = JSON.stringify({ tasks: currentTasks, settings: currentSettings, theme: result.state.theme });
            setTasks(currentTasks);
            setSettings(currentSettings);
            setTheme(result.state.theme);
            setToast('DATABASE UPDATED · 已载入较新的数据');
            return;
          }
          lastPersistedSnapshot.current = snapshot;
        } catch {
          setToast('DATABASE OFFLINE · 修改尚未保存，正在等待重试');
          window.setTimeout(() => setSaveRetry((current) => current + 1), 1_500);
        }
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [tasks, settings, theme, hydrated, saveRetry]);
  useEffect(() => { const interval = window.setInterval(() => setTasks((current) => processRecurring(current)), 60_000); return () => window.clearInterval(interval); }, []);
  useEffect(() => { const interval = window.setInterval(() => setClock(new Date()), 1_000); return () => window.clearInterval(interval); }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2200); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!impact) return;
    const duration = impact.tier === 'finalTen' ? 1_600 : impact.tier === 'finalMinute' ? 1_300 : impact.tier === 'five' ? 1_100 : 900;
    const timer = window.setTimeout(() => { setImpact(null); setLandedId(''); }, duration);
    return () => window.clearTimeout(timer);
  }, [impact]);
  useEffect(() => {
    if (!hydrated) return;
    const activeIds = new Set(tasks.filter((task) => task.status === 'pending' && task.startedAt).map((task) => task.id));
    for (const id of startReminderBands.current.keys()) if (!activeIds.has(id)) startReminderBands.current.delete(id);
    const reminding = tasks
      .filter((task) => task.status === 'pending' && task.startedAt)
      .map((task) => ({ task, urgency: startUrgency(task, clock) }))
      .filter((item): item is { task: Task; urgency: StartUrgency } => Boolean(item.urgency))
      .sort((a, b) => +new Date(a.task.startedAt) - +new Date(b.task.startedAt));
    if (!startRemindersReady.current) {
      for (const { task, urgency } of reminding) startReminderBands.current.set(task.id, urgency);
      startRemindersReady.current = true;
      return;
    }
    const changed = reminding.find(({ task, urgency }) => startReminderBands.current.get(task.id) !== urgency);
    for (const { task, urgency } of reminding) startReminderBands.current.set(task.id, urgency);
    if (!changed || changed.urgency === 'oneHour' || changed.urgency === 'halfHour') return;
    setImpact({
      title: changed.urgency === 'overdue' ? 'MISSION START NOW!' : changed.urgency === 'finalTen' ? 'DANGER: 10 SECONDS!' : changed.urgency === 'finalMinute' ? 'FINAL MINUTE!' : changed.urgency === 'five' ? '5 MINUTES!' : '15 MINUTES!',
      subtitle: `${changed.task.title} · ${startUrgencyLabel(changed.urgency)}`,
      tier: changed.urgency,
    });
  }, [clock, hydrated, tasks]);

  const grouped = useMemo(() => boardMeta.reduce((result, board) => {
    const today = localDateKey(new Date());
    const boardTasks = tasks.filter((task) => task.status === board.id && (board.id !== 'completed' || showCompletedHistory || (task.completedAt && localDateKey(new Date(task.completedAt)) === today)));
    result[board.id] = sortTasks(boardTasks, board.id);
    return result;
  }, {} as Record<Status, Task[]>), [tasks, showCompletedHistory]);

  const filteredTable = useMemo(() => tasks.filter((task) => {
    const query = tableQuery.trim().toLowerCase();
    return (!query || `${task.title} ${task.description} ${task.taskType} ${task.location}`.toLowerCase().includes(query))
      && (tableStatus === 'all' || task.status === tableStatus)
      && (tableType === 'all' || task.taskType === tableType)
      && (tablePriority === 'all' || task.priority === tablePriority);
  }).sort((a, b) => {
    const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (statusDiff) return statusDiff;
    if (Boolean(a.dueAt) !== Boolean(b.dueAt)) return a.dueAt ? -1 : 1;
    if (a.dueAt && b.dueAt) return +new Date(a.dueAt) - +new Date(b.dueAt);
    return b.index - a.index;
  }), [tasks, tableQuery, tableStatus, tableType, tablePriority]);

  const calendarDays = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
  }, [calendarMonth]);

  const pickerCalendarDays = useMemo(() => {
    const first = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
  }, [pickerMonth]);

  const choiceOptions = useMemo(() => {
    if (!choiceField) return [] as { value: string; label: string; color?: TypeColor }[];
    if (choiceField === 'status') return [{ value: 'pending', label: 'PENDING · 等待行动' }, { value: 'inProgress', label: 'IN PROGRESS · 正在攻略' }, { value: 'completed', label: 'COMPLETED · 今日战果' }];
    if (choiceField === 'priority') return [{ value: 'must', label: 'MUST · 必须完成' }, { value: 'high', label: 'HIGH · 高优先级' }, { value: 'medium', label: 'MID · 中优先级' }, { value: 'low', label: 'LOW · 低优先级' }];
    if (choiceField === 'taskType') return sortedTaskTypes(settings.taskTypes).map((item) => ({ value: item.value, label: item.value, color: item.color }));
    if (choiceField === 'location') return settings.locations.map((item) => ({ value: item.value, label: item.value }));
    return [{ value: 'none', label: '不循环' }, { value: 'daily', label: '每天' }, { value: 'weekdays', label: '工作日' }, { value: 'weekly', label: '每周' }];
  }, [choiceField, settings]);

  const moveTask = (id: string, status: Status) => {
    const task = tasks.find((item) => item.id === id);
    if (!task || task.status === status) { setDraggingId(''); setDropTarget(''); return; }
    setTasks((current) => {
      const moving = current.find((item) => item.id === id);
      if (!moving) return current;
      const targetTasks = sortTasks(current.filter((item) => item.status === status), status);
      const transitioned = transitionTask(moving, status);
      const manualTarget = status === 'pending' || targetTasks.some((item) => item.manualOrder !== null);
      if (!manualTarget || status === 'completed') return current.map((item) => item.id === id ? transitioned : item);
      const order = [transitioned, ...targetTasks];
      const ranks = new Map(order.map((item, index) => [item.id, index]));
      return current.map((item) => item.id === id ? { ...transitioned, manualOrder: 0 } : item.status === status ? { ...item, manualOrder: ranks.get(item.id) ?? null } : item);
    });
    setLandedId(id);
    setImpact(status === 'completed' ? { title: 'MISSION CLEAR!', subtitle: '任务完成 · 战果已记录', tier: 'action' } : status === 'inProgress' ? { title: 'MISSION START!', subtitle: '开始时间已自动记录', tier: 'action' } : { title: 'MISSION RESET', subtitle: '任务已返回等待区', tier: 'action' });
    setDropTarget('');
    setDraggingId('');
  };

  const reorderWithin = (status: Status, draggedId: string, targetId: string) => {
    if (status === 'completed' || draggedId === targetId) return;
    setTasks((current) => {
      const ordered = sortTasks(current.filter((task) => task.status === status), status);
      const from = ordered.findIndex((task) => task.id === draggedId);
      const to = ordered.findIndex((task) => task.id === targetId);
      if (from < 0 || to < 0) return current;
      const [moved] = ordered.splice(from, 1);
      ordered.splice(to, 0, moved);
      const ranks = new Map(ordered.map((task, index) => [task.id, index]));
      return current.map((task) => task.status === status ? { ...task, manualOrder: ranks.get(task.id) ?? null } : task);
    });
    setLandedId(draggedId);
    setImpact({ title: 'ORDER LOCKED!', subtitle: '自定义任务顺序已保存' });
    setDraggingId('');
    setDropTarget('');
  };

  const saveDraft = (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !draft.title.trim()) return;
    setTasks((current) => {
      const existing = current.find((task) => task.id === draft.id);
      let saved = existing && existing.status !== draft.status ? transitionTask({ ...draft, status: existing.status }, draft.status) : draft;
      saved = { ...saved, seriesHead: saved.recurrence !== 'none' ? (existing?.seriesHead ?? true) : false, recurrenceDays: saved.recurrence === 'weekly' && !saved.recurrenceDays.length ? [new Date().getDay()] : saved.recurrenceDays };
      const enteringBoard = !existing || existing.status !== saved.status;
      const targetTasks = sortTasks(current.filter((task) => task.status === saved.status && task.id !== saved.id), saved.status);
      const shouldInsertManually = saved.status !== 'completed' && enteringBoard && (saved.status === 'pending' || targetTasks.some((task) => task.manualOrder !== null));
      if (shouldInsertManually) {
        const order = [saved, ...targetTasks];
        const ranks = new Map(order.map((task, index) => [task.id, index]));
        const updated = current.map((task) => task.id === saved.id ? { ...saved, manualOrder: 0 } : task.status === saved.status ? { ...task, manualOrder: ranks.get(task.id) ?? null } : task);
        return existing ? updated : [...updated, { ...saved, manualOrder: 0 }];
      }
      return existing ? current.map((task) => task.id === draft.id ? saved : task) : [...current, saved];
    });
    setDraft(null);
    setToast('任务已保存');
  };

  const deleteDraft = () => {
    if (!draft || !tasks.some((task) => task.id === draft.id)) return;
    setTasks((current) => current.filter((task) => task.id !== draft.id));
    setDraft(null);
    setToast('任务已删除');
  };

  const openNewTask = (status: Status = 'pending', dueAt = '') => setDraft({ ...newTask(settings, tasks.reduce((max, task) => Math.max(max, task.index), 0) + 1), status, dueAt });

  const openDatePicker = (field: DateFieldName) => {
    if (!draft) return;
    const value = draft[field] ? new Date(draft[field]) : new Date();
    setPickerDate(localDateKey(value));
    setPickerTime(`${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`);
    setPickerMonth(new Date(value.getFullYear(), value.getMonth(), 1));
    setDateField(field);
  };

  const applyDatePicker = () => {
    if (!draft || !dateField || !pickerDate || !pickerTime) return;
    setDraft({ ...draft, [dateField]: new Date(`${pickerDate}T${pickerTime}`).toISOString() });
    setDateField(null);
  };

  const selectChoice = (value: string) => {
    if (!draft || !choiceField) return;
    if (choiceField === 'status') setDraft({ ...draft, status: value as Status });
    if (choiceField === 'priority') setDraft({ ...draft, priority: value as Priority });
    if (choiceField === 'taskType') setDraft({ ...draft, taskType: value });
    if (choiceField === 'location') setDraft({ ...draft, location: value });
    if (choiceField === 'recurrence') setDraft({ ...draft, recurrence: value as Recurrence, recurrenceDays: value === 'weekly' && !draft.recurrenceDays.length ? [new Date().getDay()] : draft.recurrenceDays, seriesHead: value !== 'none' });
    setChoiceField(null);
  };

  const choiceValue = draft && choiceField ? (choiceField === 'status' ? draft.status : choiceField === 'priority' ? draft.priority : choiceField === 'taskType' ? draft.taskType : choiceField === 'location' ? draft.location : draft.recurrence) : '';
  const [pickerHour = 0, pickerMinute = 0] = pickerTime ? pickerTime.split(':').map(Number) : [0, 0];
  const closeMenu = () => {
    if (!menuOpen) return;
    setMenuOpen(false);
    setMenuClosing(true);
    window.setTimeout(() => setMenuClosing(false), 560);
  };
  const navigateTo = (nextView: View) => {
    setDayAgendaOpen(false);
    setDraft(null);
    setChoiceField(null);
    setDateField(null);
    if (nextView === view) { closeMenu(); return; }
    const currentIndex = navItems.findIndex((item) => item.id === view);
    const nextIndex = navItems.findIndex((item) => item.id === nextView);
    setPageDirection(nextIndex > currentIndex ? 'forward' : 'backward');
    setPageMotion('exit');
    closeMenu();
    window.setTimeout(() => {
      setView(nextView);
      setPageMotion('enter');
      window.setTimeout(() => setPageMotion('idle'), 520);
    }, 420);
  };
  const now = clock;
  const completedToday = tasks.filter((task) => task.completedAt && localDateKey(new Date(task.completedAt)) === localDateKey(now)).length;
  const selectedDayTasks = tasks.filter((task) => taskOccursInActionDay(task, selectedDay, now)).sort((a, b) => +new Date(calendarTaskDate(a, now)) - +new Date(calendarTaskDate(b, now)));
  const dayScheduleBlocks = useMemo(() => layoutDaySchedule(selectedDayTasks, selectedDay, now), [selectedDayTasks, selectedDay, now]);
  const dayTimelineEntries = useMemo(() => selectedDayTasks.flatMap((task) => {
    const window = taskWindowOnDay(task, selectedDay, now);
    return window ? [{ task, ...window, displayStartMinute: actionDayMinute(window.startMinute) }] : [];
  }).sort((a, b) => a.displayStartMinute - b.displayStartMinute), [selectedDayTasks, selectedDay, now]);
  const activeNav = navItems.find((item) => item.id === view)!;
  const activeStartAlert = tasks
    .filter((task) => task.status === 'pending' && task.startedAt && +new Date(task.startedAt) - +now <= 15 * 60_000)
    .sort((a, b) => +new Date(a.startedAt) - +new Date(b.startedAt))[0];
  const activeStartUrgency = activeStartAlert ? startUrgency(activeStartAlert, now) : null;

  if (storageError) return <main className="app-shell boot-screen"><div className="boot-mark database-fault"><span>DATABASE OFFLINE</span><strong>LOCAL DATA<br />LINK LOST</strong><p>{storageError}</p><button type="button" onClick={() => { setStorageError(''); setLoadAttempt((current) => current + 1); }}>RETRY CONNECTION / 重试</button></div></main>;
  if (!viewRestored) return <main className="app-shell boot-screen boot-prime" aria-label="正在准备界面" />;
  if (introVisible) return <main className="app-shell opening-sequence" aria-label="Sword Art Online 启动画面">
    <div className="opening-broadcast" aria-hidden="true"><span className="opening-antenna" /><span className="opening-screen"><i /><b>CH 04</b></span><span className="opening-controls"><i /><i /><b /></span></div>
    <div className="opening-rays" aria-hidden="true" />
    <section className="opening-copy">
      <span>MIDNIGHT OPERATIONS NETWORK</span>
      <strong>SWORD ART<br /><em>ONLINE</em></strong>
      <p>DAILY MISSION SIGNAL · 本地作战频道</p>
      <div className="opening-load"><i style={{ width: `${introProgress}%` }} /></div>
      <small>{introProgress === 100 ? 'SIGNAL LOCKED · READY' : hydrated ? 'CALIBRATING CHANNEL' : 'LINKING LOCAL DATABASE'} <b>{String(introProgress).padStart(3, '0')}%</b></small>
    </section>
  </main>;
  if (!hydrated) return <main className="app-shell boot-screen boot-prime" aria-label={`正在恢复 ${activeNav.title} 页面`} />;

  return <main className={`app-shell view-${view} theme-${theme} page-motion-${pageMotion} page-direction-${pageDirection}`}>
    <div className="tv-noise" aria-hidden="true" />
    <div className="persona-fx" aria-hidden="true"><div className="background-tv"><span className="background-tv-antenna" /><span className="background-tv-screen"><i /><b>04</b></span><span className="background-tv-controls"><i /><i /><b /></span></div><span className="fx-rainbow" /><span className="fx-dots" /><strong>MOVE! / TRUTH / NOW!</strong></div>
    <button className={`menu-trigger ${menuOpen ? 'is-open' : ''}`} onClick={() => { if (menuOpen) closeMenu(); else { setMenuClosing(false); setMenuOpen(true); } }} aria-label={menuOpen ? '关闭主菜单' : '打开主菜单'}><span /><span /><span /><strong>MENU</strong></button>

    <aside className={`game-menu ${menuOpen ? 'is-open' : ''} ${menuClosing ? 'is-closing' : ''}`} aria-hidden={!menuOpen}>
      <button className="menu-close" onClick={closeMenu}>×</button>
      <div className="menu-title"><span>MAIN MENU</span><strong>SELECT<br />YOUR MOVE</strong><small>选择下一步行动</small></div>
      <nav>{navItems.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigateTo(item.id)}><span className="menu-no">{item.no}</span><i>{item.mark}</i><div><strong>{item.title}</strong><small>{item.subtitle}</small></div><em>›</em></button>)}</nav>
      <footer><span>{settings.username}</span><i />SWORD ART ONLINE</footer>
      <button className={`theme-toggle theme-toggle-${theme}`} onClick={() => setTheme((current) => current === 'day' ? 'night' : 'day')}><span className="theme-orb"><i /><b /></span><strong>{theme === 'day' ? 'NIGHT MODE' : 'DAY MODE'}</strong><small>{theme === 'day' ? '夜间模式' : '白天模式'}</small></button>
    </aside>
    {(menuOpen || menuClosing) && <button className={`menu-scrim ${menuClosing ? 'is-closing' : ''}`} aria-label="关闭菜单" onClick={closeMenu} />}

    <header className="hero">
      <BrandLockup sectionTitle={activeNav.title} sectionSubtitle={activeNav.subtitle} username={settings.username} />
      <div className="day-card" aria-label="今日日期"><span>{new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now).toUpperCase()}</span><strong>{String(now.getDate()).padStart(2, '0')}</strong><em>{new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(now).toUpperCase()}</em></div>
      <div className="mission-summary"><span>TODAY&apos;S CLEAR</span><strong>{completedToday}<small> / {tasks.length}</small></strong><div className="summary-track"><i style={{ width: `${tasks.length ? Math.min(100, completedToday / tasks.length * 100) : 0}%` }} /></div></div>
      {view !== 'settings' && <button className="add-task" onClick={() => openNewTask()}><span>＋</span><strong>NEW MISSION</strong><small>添加任务</small></button>}
    </header>

    {view === 'board' && activeStartAlert && activeStartUrgency && <section className={`start-alert-hud urgency-${activeStartUrgency}`} aria-live="assertive"><span>{startUrgencyLabel(activeStartUrgency)}</span><div><strong>{activeStartAlert.title}</strong><small>{formatTime(activeStartAlert.startedAt, false)} · MOVE TO IN PROGRESS</small></div><time>{countdownText(activeStartAlert, now)}</time><button type="button" onClick={() => moveTask(activeStartAlert.id, 'inProgress')}>▶ START MISSION</button></section>}

    {view === 'board' && <section className="board" aria-label="任务看板">{boardMeta.map((board) => {
      const boardTasks = grouped[board.id];
      const visible = showAll[board.id] ? boardTasks : boardTasks.slice(0, VISIBLE_LIMIT[board.id]);
      const hiddenCount = boardTasks.length - visible.length;
      return <section className={`board-column ${dropTarget === board.id ? 'is-target' : ''}`} key={board.id}
        onDragOver={(event) => { event.preventDefault(); setDropTarget(board.id); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(''); }}
        onDrop={(event) => { event.preventDefault(); if (draggingId) moveTask(draggingId, board.id); }}>
        <header className="column-header"><span className="column-index">{board.index}</span><div><h2>{board.title}</h2><p>{board.subtitle}</p></div><strong>{String(boardTasks.length).padStart(2, '0')}</strong></header>
        <div className="task-stack">{visible.map((task) => <TaskCard key={task.id} task={task} color={typeColor(task.taskType, settings)} now={now} dragging={draggingId === task.id} landed={landedId === task.id}
          onStart={() => moveTask(task.id, 'inProgress')}
          onOpen={() => setDraft(task)} onDragStart={(event) => { setDraggingId(task.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id); }} onDragEnd={() => { setDraggingId(''); setDropTarget(''); }}
          onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (!draggingId) return; const source = tasks.find((item) => item.id === draggingId); if (source?.status === task.status) reorderWithin(task.status, draggingId, task.id); else moveTask(draggingId, task.status); }} />)}
          {boardTasks.length === 0 && <button className="empty-state" onClick={() => openNewTask(board.id)}><span>＋</span><strong>DROP MISSION HERE</strong><small>拖入任务或点击新增</small></button>}
        </div>
        {(hiddenCount > 0 || showAll[board.id]) && <button className="reveal-button" onClick={() => setShowAll((current) => ({ ...current, [board.id]: !current[board.id] }))}>{showAll[board.id] ? '收起任务 ↑' : `显示其余 ${hiddenCount} 个任务 ↓`}</button>}
        {board.id === 'completed' && tasks.some((task) => task.status === 'completed' && task.completedAt && localDateKey(new Date(task.completedAt)) !== localDateKey(now)) && <button className="history-button" onClick={() => { setShowCompletedHistory((current) => !current); setShowAll((current) => ({ ...current, completed: false })); }}>{showCompletedHistory ? '只看今天完成 ✓' : '查看过去完成记录 ↗'}</button>}
      </section>;
    })}</section>}

    {view === 'table' && <section className="archive-page">
      <header className="page-banner"><span>02</span><div><p>COMPLETE MISSION DATABASE</p><h2>MISSION ARCHIVE</h2></div><strong>{filteredTable.length} RECORDS</strong></header>
      <div className="filter-deck"><label className="search-filter"><span>⌕</span><input value={tableQuery} onChange={(e) => setTableQuery(e.target.value)} placeholder="搜索标题、描述、类型或地点…" /></label>
        <ArchiveFilterMenu label="STATUS" mark="◈" value={tableStatus} onChange={(value) => setTableStatus(value as Status | 'all')} options={[{ value: 'all', label: '全部状态 / ALL' }, { value: 'inProgress', label: 'IN PROGRESS / 进行中' }, { value: 'pending', label: 'PENDING / 待处理' }, { value: 'completed', label: 'COMPLETED / 已完成' }]} />
        <ArchiveFilterMenu label="TYPE" mark="▦" value={tableType} onChange={setTableType} options={[{ value: 'all', label: '全部类型 / ALL' }, ...sortedTaskTypes(settings.taskTypes).map((type) => ({ value: type.value, label: type.value, tone: type.color }))]} />
        <ArchiveFilterMenu label="PRIORITY" mark="!" value={tablePriority} onChange={(value) => setTablePriority(value as Priority | 'all')} options={[{ value: 'all', label: '全部优先级 / ALL' }, { value: 'must', label: 'MUST / 必须', tone: 'must' }, { value: 'high', label: 'HIGH / 高', tone: 'high' }, { value: 'medium', label: 'MID / 中', tone: 'medium' }, { value: 'low', label: 'LOW / 低', tone: 'low' }]} />
      </div>
      <div className="archive-table-wrap"><table className="archive-table"><thead><tr><th>INDEX</th><th>任务名称</th><th>任务描述</th><th>状态</th><th>任务类型</th><th>优先级</th><th>截止时间</th><th>开始时间</th><th>完成时间</th><th>地点</th></tr></thead><tbody>{filteredTable.map((task, rowIndex) => <tr key={task.id} onClick={() => setDraft(task)}><td className="table-index">{rowIndex + 1}</td><td><strong>{task.title}</strong>{task.recurrence !== 'none' && <span className="table-repeat">↻</span>}</td><td className="description-data">{task.description || '—'}</td><td><span className={`status-chip status-${task.status}`}>{statusLabel(task.status)}</span></td><td><span className={`type-chip type-${typeColor(task.taskType, settings)}`}><i />{task.taskType}</span></td><td><span className={`priority-chip priority-${task.priority}`}>{task.priority === 'must' ? 'MUST' : task.priority.toUpperCase()}</span></td><td className="time-data">{formatTime(task.dueAt)}</td><td className="time-data">{formatTime(task.startedAt)}</td><td className="time-data">{formatTime(task.completedAt)}</td><td>{task.location}</td></tr>)}</tbody></table>{!filteredTable.length && <div className="no-results">NO MATCHING MISSIONS / 没有匹配任务</div>}</div>
      <p className="sort-note">INDEX 是当前筛选结果的行号；默认先按状态排列，同状态任务再按截止时间排列。</p>
    </section>}

    {view === 'calendar' && <section className="calendar-page">
      <header className="page-banner"><span>03</span><div><p>MONTHLY OPERATION MAP</p><h2>CALENDAR</h2></div><div className="month-nav"><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button><strong>{calendarMonth.getFullYear()} / {String(calendarMonth.getMonth() + 1).padStart(2, '0')}</strong><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button></div></header>
      <div className="calendar-layout"><div className="month-grid"><div className="weekday-row">{WEEKDAYS.map((day) => <span key={day}>周{day}</span>)}</div><div className="calendar-grid">{calendarDays.map((day) => {
        const key = localDateKey(day); const dayTasks = tasks.filter((task) => taskOccursOnCalendarDay(task, key, now));
        return <button key={key} className={`calendar-day ${day.getMonth() !== calendarMonth.getMonth() ? 'outside' : ''} ${key === localDateKey(now) ? 'today' : ''} ${key === selectedDay ? 'selected' : ''}`} onClick={() => { setSelectedDay(key); setDayAgendaOpen(true); }}><span className="day-number">{day.getDate()}</span><div className="day-missions">{dayTasks.slice(0, 3).map((task) => <span key={task.id} className={`calendar-task type-${typeColor(task.taskType, settings)}`}>{task.title}</span>)}{dayTasks.length > 3 && <em>+{dayTasks.length - 3} MORE</em>}</div></button>;
      })}</div></div>
      </div>
    </section>}

    {view === 'settings' && <section className="settings-page">
      <header className="page-banner"><span>04</span><div><p>PERSONAL OPERATION RULES</p><h2>DESIGN</h2></div><strong>AUTO-SAVED</strong></header>
      <div className="settings-grid"><section className="settings-panel profile-panel"><header><span>00</span><div><h3>PLAYER IDENTITY</h3><p>同步更新标题上方与主菜单中的用户名</p></div></header><div className="profile-console"><div className="profile-badge"><span>ACTIVE PLAYER</span><strong>{settings.username}</strong><small>SWORD ART ONLINE · LOCAL PROFILE</small></div><label><span>USERNAME / 用户名</span><input maxLength={32} value={settings.username} onChange={(event) => setSettings({ ...settings, username: event.target.value })} onBlur={() => setSettings((current) => ({ ...current, username: current.username.trim() || DEFAULT_SETTINGS.username }))} placeholder="输入用户名" /><small>最多 32 个字符，修改后自动保存到本地 SQLite。</small></label></div></section><section className="settings-panel loadout-studio"><header><span>01</span><div><h3>NEW MISSION DEFAULTS</h3><p>只决定新建任务时自动填入的内容</p></div></header><div className="loadout-console"><div className={`loadout-preview type-${typeColor(settings.defaultTaskType, settings)}`}><span>PREVIEW</span><strong>下一项新任务</strong><p>{settings.defaultTaskType}</p><small>{settings.defaultLocation} · 中优先级</small></div><div className="loadout-controls"><label><span>TASK TYPE / 默认类型</span><select value={settings.defaultTaskType} onChange={(event) => setSettings({ ...settings, defaultTaskType: event.target.value })}>{sortedTaskTypes(settings.taskTypes).map((type) => <option key={type.value}>{type.value}</option>)}</select></label><label><span>LOCATION / 默认地点</span><select value={settings.defaultLocation} onChange={(event) => setSettings({ ...settings, defaultLocation: event.target.value })}>{settings.locations.map((location) => <option key={location.value}>{location.value}</option>)}</select></label><p>优先级不设默认偏好，新任务统一从“中”开始，随后可在任务详情里调整。</p></div></div></section>
        <section className="settings-panel custom-panel"><header><span>02</span><div><h3>OPTION WORKSHOP</h3><p>扩充你的任务词库</p></div></header><div className="workshop-body"><form onSubmit={(event) => { event.preventDefault(); if (!customType.trim()) return; setSettings({ ...settings, taskTypes: sortedTaskTypes([...settings.taskTypes, { value: customType.trim(), color: customTypeColor, custom: true }]) }); setCustomType(''); }}><label><span>新增任务类型</span><input value={customType} onChange={(e) => setCustomType(e.target.value)} placeholder="例如：🎵 音乐" /></label><div className="color-choices">{(['purple', 'blue', 'green', 'yellow'] as TypeColor[]).map((color) => <button type="button" aria-label={color} className={`${color} ${customTypeColor === color ? 'active' : ''}`} key={color} onClick={() => setCustomTypeColor(color)} />)}</div><button className="settings-add">＋ 添加类型</button></form><form onSubmit={(event) => { event.preventDefault(); if (!customLocation.trim()) return; setSettings({ ...settings, locations: [...settings.locations, { value: customLocation.trim(), custom: true }] }); setCustomLocation(''); }}><label><span>新增地点</span><input value={customLocation} onChange={(e) => setCustomLocation(e.target.value)} placeholder="例如：☕ 咖啡店" /></label><button className="settings-add">＋ 添加地点</button></form></div><div className="custom-list">{sortedTaskTypes(settings.taskTypes).filter((item) => item.custom).map((item) => <button key={item.value} onClick={() => setSettings({ ...settings, taskTypes: settings.taskTypes.filter((type) => type.value !== item.value), defaultTaskType: settings.defaultTaskType === item.value ? '🧬 个人' : settings.defaultTaskType })}>{item.value}<span>×</span></button>)}{settings.locations.filter((item) => item.custom).map((item) => <button key={item.value} onClick={() => setSettings({ ...settings, locations: settings.locations.filter((location) => location.value !== item.value), defaultLocation: settings.defaultLocation === item.value ? '🏠 家' : settings.defaultLocation })}>{item.value}<span>×</span></button>)}</div></section>
      </div>
    </section>}

    <footer className="app-footer"><span>{activeNav.title}</span><i /><span>自动时间戳已开启</span><i /><span>本机自动保存</span></footer>

    {impact && <div className={`impact-feedback impact-${impact.tier ?? 'action'}`}><div className="impact-rays" /><span>{impact.title}</span><strong>{impact.subtitle}</strong></div>}

    {dayAgendaOpen && <div className="modal-backdrop day-schedule-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setDayAgendaOpen(false); }}>
      <section className="day-schedule-modal" role="dialog" aria-modal="true" aria-labelledby="day-schedule-title">
        <header><div><span>SCHOOL LIFE / DAILY FLOW</span><h2 id="day-schedule-title">{selectedDay.replaceAll('-', ' / ')}</h2><p>{selectedDayTasks.length} MISSIONS · 今天如何度过？</p></div><button type="button" className="close-button" aria-label="关闭 DAILY FLOW" onClick={() => setDayAgendaOpen(false)}>×</button></header>
        <div className="day-schedule-body"><section className="schedule-map"><header><span>TIME DISTRIBUTION</span><strong>全天任务分布</strong></header><div className="schedule-stage">
          <div className="schedule-hours"><span>00</span><span>02</span><span>07</span><span>12</span><span>18</span><span>00</span><span>02</span><b>OFF<br />02—07</b></div>
          <div className="schedule-lanes">{dayScheduleBlocks.map((block) => {
            const rawDuration = (block.endMinute - block.startMinute) / (ACTION_DAY_DISPLAY_MINUTES / 100);
            const duration = Math.max(block.variant === 'in-progress' ? 4 : 1.4, rawDuration);
            const crossDay = block.continuesBefore || block.continuesAfter;
            const hideLabel = duration < 5.5 || block.laneCount > 3;
            return <button key={block.id} aria-label={`${scheduleTimeLabel(block.variant, block.labelStartMinute, block.labelEndMinute, block.terminal)} ${block.task.title}`} className={`schedule-block type-${typeColor(block.task.taskType, settings)} variant-${block.variant} ${hideLabel ? 'is-brief' : ''} ${block.offline ? 'is-offline' : ''} ${crossDay ? 'is-cross-day' : ''} ${block.continuesBefore ? 'continues-before' : ''} ${block.continuesAfter ? 'continues-after' : ''}`} style={{ top: `${block.startMinute / (ACTION_DAY_DISPLAY_MINUTES / 100)}%`, height: `${duration}%`, left: `calc(${block.lane / block.laneCount * 100}% + 4px)`, width: `calc(${100 / block.laneCount}% - 8px)` }} onClick={() => setDraft(block.task)}><time>{scheduleTimeLabel(block.variant, block.labelStartMinute, block.labelEndMinute, block.terminal)}</time><strong>{block.task.title}</strong>{crossDay && <span className="schedule-cross-day">{block.continuesBefore && block.continuesAfter ? '↕ THROUGH' : block.continuesBefore ? '↳ FROM PREV' : '↘ NEXT DAY'}</span>}</button>;
          })}</div>
        </div></section><section className="schedule-list"><header><span>AFTER SCHOOL AGENDA</span><strong>当天任务表</strong></header><div className="timeline">{dayTimelineEntries.map((entry) => <button key={entry.task.id} onClick={() => setDraft(entry.task)}><time>{scheduleTimeLabel(entry.variant, entry.startMinute, entry.endMinute, !entry.continuesAfter)}</time><i className={`type-${typeColor(entry.task.taskType, settings)}`} /><div><strong>{entry.task.title}</strong><span>{entry.task.taskType} · {entry.task.location}</span></div></button>)}{!dayTimelineEntries.length && <div className="agenda-empty"><strong>FREE DAY!</strong><span>这一天还没有安排任务</span></div>}</div><button className="schedule-add" onClick={() => openNewTask('pending', new Date(`${selectedDay}T12:00`).toISOString())}>＋ ADD MISSION / 添加任务</button></section></div>
      </section>
    </div>}

    {draft && <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setDraft(null); }}><form className="task-modal" onSubmit={saveDraft} role="dialog" aria-modal="true" aria-labelledby="task-dialog-title">
      <header className={`modal-header type-${typeColor(draft.taskType, settings)}`}><div><span>MISSION DATA</span><h2 id="task-dialog-title">任务详情</h2></div><button type="button" className="close-button" aria-label="关闭" onClick={() => setDraft(null)}>×</button></header>
      <div className="modal-body"><label className="field field-wide"><span>Title / 标题</span><input autoFocus value={draft.title} placeholder="这次要攻略什么？" onChange={(e) => setDraft({ ...draft, title: e.target.value })} required /></label><label className="field field-wide"><span>Description / 描述</span><textarea value={draft.description} placeholder="补充任务背景、完成标准或下一步…" onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
        <div className="form-grid"><ChoiceField label="Status / 状态" value={statusLabel(draft.status)} onClick={() => setChoiceField('status')} /><ChoiceField label="Priority / 优先级" value={priorityLabel(draft.priority)} onClick={() => setChoiceField('priority')} /><ChoiceField label="Task Type / 任务类型" value={draft.taskType} onClick={() => setChoiceField('taskType')} /><ChoiceField label="Location / 地点" value={draft.location} onClick={() => setChoiceField('location')} /><DateChoice label="Start / 开始时间" value={draft.startedAt} onClick={() => openDatePicker('startedAt')} /><DateChoice label="Complete / 完成时间" value={draft.completedAt} onClick={() => openDatePicker('completedAt')} /><DateChoice label="Deadline / 截止时间" value={draft.dueAt} onClick={() => openDatePicker('dueAt')} /><ChoiceField label="Repeat / 循环" value={recurrenceLabel(draft)} onClick={() => setChoiceField('recurrence')} /></div>
        {draft.recurrence === 'weekly' && <div className="weekly-picker"><span>REPEAT DAYS / 循环日（可多选）</span><div>{WEEKDAYS.map((day, index) => <button type="button" key={day} className={draft.recurrenceDays.includes(index) ? 'active' : ''} onClick={() => setDraft({ ...draft, recurrenceDays: draft.recurrenceDays.includes(index) ? draft.recurrenceDays.filter((item) => item !== index) : [...draft.recurrenceDays, index].sort() })}>周{day}</button>)}</div></div>}
        {draft.recurrence !== 'none' && <p className="repeat-note"><span>↻</span> 到达循环日后会生成新的 Pending 任务；已完成的历史任务会完整保留在 Completed。</p>}
      </div><footer className="modal-actions">{tasks.some((task) => task.id === draft.id) && <button type="button" className="delete-button" onClick={deleteDraft}>删除任务</button>}<button type="button" className="cancel-button" onClick={() => setDraft(null)}>取消</button><button type="submit" className="save-button">保存任务 <span>→</span></button></footer>
    </form></div>}

    {choiceField && draft && <div className="selector-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setChoiceField(null); }}><section className="persona-selector" role="dialog" aria-modal="true"><header><span>SELECT OPTION</span><strong>{choiceField === 'taskType' ? '任务类型' : choiceField === 'location' ? '地点' : choiceField === 'priority' ? '优先级' : choiceField === 'recurrence' ? '循环' : '状态'}</strong><button onClick={() => setChoiceField(null)}>×</button></header><div className={`selector-options selector-${choiceField}`}>{choiceOptions.map((option, index) => <button key={option.value} className={`${option.value === choiceValue ? 'active' : ''} ${option.color ? `type-${option.color}` : ''}`} onClick={() => selectChoice(option.value)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{option.label}</strong><i>{option.value === choiceValue ? '●' : '○'}</i></button>)}</div><footer>CHOOSE YOUR MOVE · 选择后自动返回任务详情</footer></section></div>}

    {dateField && draft && <div className="selector-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setDateField(null); }}><section className="persona-selector time-selector" role="dialog" aria-modal="true"><header><span>SET TIME</span><strong>{dateField === 'startedAt' ? '开始时间' : dateField === 'completedAt' ? '完成时间' : '截止时间'}</strong><button onClick={() => setDateField(null)}>×</button></header><div className="time-toolbelt"><button onClick={() => { setDraft({ ...draft, [dateField]: new Date().toISOString() }); setDateField(null); }}><strong>NOW</strong><span>设为现在</span></button><button className="clear-time" onClick={() => { setDraft({ ...draft, [dateField]: '' }); setDateField(null); }}><strong>×</strong><span>清除时间</span></button></div><div className="custom-datetime"><section className="date-board"><header><button onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1))}>‹</button><strong>{pickerMonth.getFullYear()} / {String(pickerMonth.getMonth() + 1).padStart(2, '0')}</strong><button onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1))}>›</button></header><div className="picker-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div><div className="picker-days">{pickerCalendarDays.map((day) => { const key = localDateKey(day); return <button key={key} className={`${day.getMonth() !== pickerMonth.getMonth() ? 'outside' : ''} ${pickerDate === key ? 'active' : ''} ${key === localDateKey(new Date()) ? 'today' : ''}`} onClick={() => { setPickerDate(key); setPickerMonth(new Date(day.getFullYear(), day.getMonth(), 1)); }}>{day.getDate()}</button>; })}</div></section><section className="time-board"><span>SELECT TIME / 选择时间</span><label className="manual-time-input"><span>MANUAL INPUT / 手动输入</span><input type="time" step="60" value={pickerTime} onChange={(event) => setPickerTime(event.target.value)} aria-label="手动输入时间" /></label><strong>{String(pickerHour).padStart(2, '0')}<i>:</i>{String(pickerMinute).padStart(2, '0')}</strong><label>HOUR / 小时</label><div className="hour-grid">{Array.from({ length: 24 }, (_, hour) => <button key={hour} className={pickerHour === hour ? 'active' : ''} onClick={() => setPickerTime(`${String(hour).padStart(2, '0')}:${String(pickerMinute).padStart(2, '0')}`)}>{String(hour).padStart(2, '0')}</button>)}</div><label>MINUTE / 分钟</label><div className="minute-grid">{[0, 15, 30, 45, 59].map((minute) => <button key={minute} className={pickerMinute === minute ? 'active' : ''} onClick={() => setPickerTime(`${String(pickerHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)}>{String(minute).padStart(2, '0')}</button>)}</div></section></div><button className="time-confirm" onClick={applyDatePicker}>CONFIRM · {pickerDate.replaceAll('-', ' / ')} · {pickerTime} <span>→</span></button></section></div>}

    {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
  </main>;
}
