import Database from "better-sqlite3";
import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const sourcePath = resolve(process.env.DATABASE_PATH || "data/app.db");
const backupDir = resolve(process.env.BACKUP_DIR || "backups");
const keep = Number(process.env.BACKUP_KEEP || 30);

mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destPath = join(backupDir, `app-${stamp}.db`);

const db = new Database(sourcePath, { readonly: true });
try {
  await db.backup(destPath);
} finally {
  db.close();
}
console.log(`Backup written to ${destPath}`);

const backups = readdirSync(backupDir)
  .filter((name) => /^app-.*\.db$/.test(name))
  .map((name) => ({ name, path: join(backupDir, name), mtime: statSync(join(backupDir, name)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);

for (const old of backups.slice(keep)) {
  unlinkSync(old.path);
  console.log(`Removed old backup ${old.name} (keeping the newest ${keep})`);
}
