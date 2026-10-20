import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { HttpError } from "./http-error";

export type BlobEntry<T> = { data: T; etag: string };
export type JsonStore = {
  getWithMetadata(
    key: string,
    options: { type: "json" },
  ): Promise<BlobEntry<unknown> | null>;
  setJSON(
    key: string,
    data: unknown,
    options: { onlyIfNew: true } | { onlyIfMatch: string },
  ): Promise<{ modified: boolean }>;
};

let db: Database.Database | null = null;
function database(): Database.Database {
  if (db) return db;
  const path = resolve(process.env.DATABASE_PATH || "data/app.db");
  mkdirSync(dirname(path), { recursive: true });
  db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(
    "CREATE TABLE IF NOT EXISTS blobs (key TEXT PRIMARY KEY, data TEXT NOT NULL, etag TEXT NOT NULL)",
  );
  return db;
}

export function appStore(): JsonStore {
  const d = database();
  const getStmt = d.prepare("SELECT data, etag FROM blobs WHERE key = ?");
  const insertStmt = d.prepare(
    "INSERT INTO blobs (key, data, etag) VALUES (?, ?, ?)",
  );
  const updateStmt = d.prepare(
    "UPDATE blobs SET data = ?, etag = ? WHERE key = ? AND etag = ?",
  );
  return {
    getWithMetadata: async (key) => {
      const row = getStmt.get(key) as
        | { data: string; etag: string }
        | undefined;
      if (!row) return null;
      return { data: JSON.parse(row.data), etag: row.etag };
    },
    setJSON: async (key, value, options) => {
      const json = JSON.stringify(value);
      if ("onlyIfNew" in options) {
        try {
          insertStmt.run(key, json, randomUUID());
          return { modified: true };
        } catch {
          // PRIMARY KEY conflict: a record already exists at this key.
          return { modified: false };
        }
      }
      const result = updateStmt.run(json, randomUUID(), key, options.onlyIfMatch);
      return { modified: result.changes > 0 };
    },
  };
}

export async function initializeRecord<T>(
  store: JsonStore,
  key: string,
  create: () => T,
): Promise<T> {
  let record = await store.getWithMetadata(key, { type: "json" });
  if (!record) {
    await store.setJSON(key, create(), { onlyIfNew: true });
    record = await store.getWithMetadata(key, { type: "json" });
  }
  if (!record)
    throw new HttpError("Data storage could not be initialized.", 503);
  return record.data as T;
}

export async function replaceRevision<T extends { revision: number }>(
  store: JsonStore,
  key: string,
  next: T,
  expected: number,
) {
  const current = (await store.getWithMetadata(key, {
    type: "json",
  })) as BlobEntry<T> | null;
  const conflict = () =>
    new HttpError(
      "Another operator updated this workflow. Refresh and retry; your input has been kept.",
      409,
    );
  if (!current || current.data.revision !== expected) throw conflict();
  const result = await store.setJSON(
    key,
    { ...next, revision: expected + 1 },
    { onlyIfMatch: current.etag },
  );
  if (!result.modified) throw conflict();
  next.revision = expected + 1;
}
