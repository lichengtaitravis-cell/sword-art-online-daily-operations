import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

const workspace = process.cwd();
const sourcePath = resolve(workspace, process.env.SAO_DB_PATH || 'data/sword-art-online.sqlite');
const backupDir = resolve(workspace, 'backups');
const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const destinationPath = resolve(backupDir, `sword-art-online-${timestamp}.sqlite`);

mkdirSync(backupDir, { recursive: true });
const database = new DatabaseSync(sourcePath, { readOnly: true });
await backup(database, destinationPath);
database.close();

console.log(`Database backup created: ${destinationPath}`);
