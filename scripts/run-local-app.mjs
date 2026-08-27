import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const mode = process.argv[2];
const webPort = process.env.SAO_WEB_PORT || '1998';
if (mode !== 'dev' && mode !== 'start') {
  console.error('Usage: node scripts/run-local-app.mjs <dev|start>');
  process.exit(1);
}

const workspace = process.cwd();
const databaseScript = resolve(workspace, 'scripts/local-db-server.mjs');
const vinextBin = resolve(workspace, 'node_modules/.bin/vinext');
const children = new Set();
let closing = false;

function launch(command, args) {
  const child = spawn(command, args, { cwd: workspace, env: process.env, stdio: 'inherit' });
  children.add(child);
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!closing) shutdown(code ?? (signal ? 1 : 0));
  });
  return child;
}

function shutdown(exitCode = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill('SIGTERM');
  const timer = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
    process.exit(exitCode);
  }, 2_000);
  timer.unref();
  Promise.all([...children].map((child) => new Promise((resolveExit) => child.once('exit', resolveExit))))
    .finally(() => process.exit(exitCode));
}

const database = launch(process.execPath, [databaseScript]);

async function waitForDatabase() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (database.exitCode !== null) throw new Error('SQLite API stopped before becoming ready');
    try {
      const response = await fetch('http://127.0.0.1:43110/health');
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('SQLite API did not become ready');
}

try {
  await waitForDatabase();
  launch(vinextBin, [mode, '--port', webPort]);
} catch (error) {
  console.error(error);
  shutdown(1);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
