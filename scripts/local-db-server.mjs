import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const workspace = process.cwd();
const databasePath = resolve(workspace, process.env.SAO_DB_PATH || 'data/sword-art-online.sqlite');
const port = Number(process.env.SAO_DB_PORT || 43110);
const host = '127.0.0.1';

mkdirSync(dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = FULL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS planner_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    task_index INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'inProgress', 'completed')),
    task_type TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    due_at TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('must', 'high', 'medium', 'low')),
    location TEXT NOT NULL,
    recurrence TEXT NOT NULL CHECK (recurrence IN ('none', 'daily', 'weekdays', 'weekly')),
    series_id TEXT NOT NULL,
    manual_order INTEGER,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS migration_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    imported_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_status_manual_order
  ON tasks(status, manual_order);

  CREATE INDEX IF NOT EXISTS idx_tasks_due_at
  ON tasks(due_at)
  WHERE due_at != '';
`);
db.exec('PRAGMA optimize');

const readMeta = db.prepare('SELECT value FROM app_meta WHERE key = ?');
const writeMeta = db.prepare(`
  INSERT INTO app_meta (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);
const readTasks = db.prepare('SELECT payload_json FROM tasks ORDER BY task_index ASC');
const deleteTasks = db.prepare('DELETE FROM tasks');
const insertTask = db.prepare(`
  INSERT INTO tasks (
    id, task_index, title, description, status, task_type, started_at,
    completed_at, due_at, priority, location, recurrence, series_id,
    manual_order, payload_json, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const readSettings = db.prepare('SELECT value_json FROM planner_settings WHERE id = 1');
const writeSettings = db.prepare(`
  INSERT INTO planner_settings (id, value_json, updated_at) VALUES (1, ?, ?)
  ON CONFLICT(id) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
`);
const writeBackup = db.prepare(`
  INSERT INTO migration_backups (source, payload_json, imported_at) VALUES (?, ?, ?)
`);

function getMeta(key, fallback) {
  return readMeta.get(key)?.value ?? fallback;
}

function getState() {
  const settingsRow = readSettings.get();
  return {
    initialized: getMeta('initialized', 'false') === 'true',
    revision: Number(getMeta('revision', '0')),
    tasks: readTasks.all().map((row) => JSON.parse(row.payload_json)),
    settings: settingsRow ? JSON.parse(settingsRow.value_json) : null,
    theme: getMeta('theme', 'day'),
    updatedAt: getMeta('updated_at', ''),
  };
}

function assertState(value) {
  if (!value || typeof value !== 'object') throw new Error('State payload must be an object');
  if (!Array.isArray(value.tasks)) throw new Error('State tasks must be an array');
  if (!value.settings || typeof value.settings !== 'object' || Array.isArray(value.settings)) throw new Error('State settings must be an object');
  if (value.theme !== 'day' && value.theme !== 'night') throw new Error('State theme must be day or night');

  const ids = new Set();
  for (const task of value.tasks) {
    if (!task || typeof task !== 'object' || typeof task.id !== 'string' || !task.id) throw new Error('Every task must have a non-empty id');
    if (ids.has(task.id)) throw new Error(`Duplicate task id: ${task.id}`);
    ids.add(task.id);
    if (!['pending', 'inProgress', 'completed'].includes(task.status)) throw new Error(`Invalid task status: ${task.status}`);
    if (!['must', 'high', 'medium', 'low'].includes(task.priority)) throw new Error(`Invalid task priority: ${task.priority}`);
    if (!['none', 'daily', 'weekdays', 'weekly'].includes(task.recurrence)) throw new Error(`Invalid task recurrence: ${task.recurrence}`);
  }
}

function saveState(payload) {
  assertState(payload);
  const currentRevision = Number(getMeta('revision', '0'));
  const expectedRevision = Number(payload.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision !== currentRevision) {
    return { conflict: true, state: getState() };
  }

  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    if (payload.migrationSource) {
      writeBackup.run(String(payload.migrationSource), JSON.stringify({
        tasks: payload.tasks,
        settings: payload.settings,
        theme: payload.theme,
      }), now);
    }

    deleteTasks.run();
    for (const task of payload.tasks) {
      insertTask.run(
        task.id,
        Number(task.index) || 0,
        String(task.title ?? ''),
        String(task.description ?? ''),
        task.status,
        String(task.taskType ?? ''),
        String(task.startedAt ?? ''),
        String(task.completedAt ?? ''),
        String(task.dueAt ?? ''),
        task.priority,
        String(task.location ?? ''),
        task.recurrence,
        String(task.seriesId ?? task.id),
        task.manualOrder === null || task.manualOrder === undefined ? null : Number(task.manualOrder),
        JSON.stringify(task),
        now,
      );
    }

    writeSettings.run(JSON.stringify(payload.settings), now);
    writeMeta.run('theme', payload.theme);
    writeMeta.run('initialized', 'true');
    writeMeta.run('revision', String(currentRevision + 1));
    writeMeta.run('updated_at', now);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { conflict: false, state: getState() };
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

function sendJson(response, status, value, origin = '') {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin || '*' : 'null',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 2_000_000) throw new Error('Request body is too large');
  }
  return JSON.parse(body || '{}');
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin || '';
  if (!isAllowedOrigin(origin)) return sendJson(response, 403, { error: 'Origin is not allowed' }, origin);
  if (request.method === 'OPTIONS') return sendJson(response, 204, {}, origin);

  try {
    if (request.method === 'GET' && request.url === '/health') {
      return sendJson(response, 200, { ok: true }, origin);
    }
    if (request.method === 'GET' && request.url === '/v1/state') {
      return sendJson(response, 200, getState(), origin);
    }
    if (request.method === 'PUT' && request.url === '/v1/state') {
      const result = saveState(await readJson(request));
      return sendJson(response, result.conflict ? 409 : 200, result.state, origin);
    }
    return sendJson(response, 404, { error: 'Not found' }, origin);
  } catch (error) {
    console.error(error);
    return sendJson(response, 400, { error: error instanceof Error ? error.message : 'Unknown database error' }, origin);
  }
});

server.listen(port, host, () => {
  console.log(`SQLite API: http://${host}:${port}`);
  console.log(`SQLite file: ${databasePath}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
