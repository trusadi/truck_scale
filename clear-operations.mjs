// Clears all truck/operations data and resets to an empty queue.
// User accounts are untouched.
// Run from the app folder: node clear-operations.mjs

import Database from "better-sqlite3";
import { resolve } from "node:path";

const path = resolve(process.env.DATABASE_PATH || "data/app.db");
const db = new Database(path);

const before = db.prepare("SELECT key FROM blobs").all();
console.log("Keys in database:", before.map(r => r.key).join(", "));

const result = db.prepare("DELETE FROM blobs WHERE key = 'operations'").run();

if (result.changes > 0) {
  console.log("✓ Operations data cleared. The app will start with an empty queue on next launch.");
} else {
  console.log("Nothing to clear — no operations data was found.");
}

db.close();
