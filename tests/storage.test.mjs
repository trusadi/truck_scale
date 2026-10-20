import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const uri = (source) =>
  "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const compile = (name) =>
  ts.transpileModule(
    fs.readFileSync(new URL("../lib/" + name + ".ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
const errorURI = uri(compile("http-error"));
const blobStorageURI = uri(
  compile("blob-storage")
    .replace('"./http-error"', JSON.stringify(errorURI))
    .replace(
      '"better-sqlite3"',
      JSON.stringify(import.meta.resolve("better-sqlite3")),
    ),
);
const storage = await import(blobStorageURI);

class MemoryStore {
  records = new Map();
  sequence = 0;

  async getWithMetadata(key) {
    return structuredClone(this.records.get(key) || null);
  }

  async setJSON(key, data, options) {
    const old = this.records.get(key);
    if (
      (options.onlyIfNew && old) ||
      (options.onlyIfMatch && old?.etag !== options.onlyIfMatch)
    )
      return { modified: false };
    this.records.set(key, {
      data: structuredClone(data),
      etag: String(++this.sequence),
    });
    return { modified: true };
  }
}

test("concurrent initialization keeps one record and conflicting writes cannot both succeed", async () => {
  const store = new MemoryStore();
  const states = await Promise.all(
    Array.from({ length: 8 }, () =>
      storage.initializeRecord(store, "operations", () => ({
        revision: 0,
        id: randomBytes(12).toString("hex"),
      })),
    ),
  );
  assert.equal(new Set(states.map((state) => state.id)).size, 1);

  const outcomes = await Promise.allSettled(
    ["A", "B"].map((value) =>
      storage.replaceRevision(store, "operations", { revision: 0, value }, 0),
    ),
  );
  assert.equal(
    outcomes.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    outcomes.find((result) => result.status === "rejected").reason.status,
    409,
  );
  assert.equal((await store.getWithMetadata("operations")).data.revision, 1);
  await assert.rejects(
    storage.replaceRevision(store, "operations", { revision: 0 }, 0),
    (error) => error.status === 409,
  );
});

test("sqlite-backed appStore implements create-if-missing and CAS semantics", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smf-storage-test-"));
  process.env.DATABASE_PATH = join(dir, "app.db");
  try {
    const store = storage.appStore();
    assert.equal(await store.getWithMetadata("widgets", { type: "json" }), null);

    const created = await store.setJSON(
      "widgets",
      { revision: 0, count: 1 },
      { onlyIfNew: true },
    );
    assert.equal(created.modified, true);

    // create-if-missing must not overwrite an existing record
    const alreadyExists = await store.setJSON(
      "widgets",
      { revision: 0, count: 99 },
      { onlyIfNew: true },
    );
    assert.equal(alreadyExists.modified, false);

    const record = await store.getWithMetadata("widgets", { type: "json" });
    assert.deepEqual(record.data, { revision: 0, count: 1 });
    assert.ok(record.etag);

    const staleUpdate = await store.setJSON(
      "widgets",
      { revision: 1, count: 2 },
      { onlyIfMatch: "not-the-real-etag" },
    );
    assert.equal(staleUpdate.modified, false);

    const okUpdate = await store.setJSON(
      "widgets",
      { revision: 1, count: 2 },
      { onlyIfMatch: record.etag },
    );
    assert.equal(okUpdate.modified, true);

    const updated = await store.getWithMetadata("widgets", { type: "json" });
    assert.deepEqual(updated.data, { revision: 1, count: 2 });
    assert.notEqual(updated.etag, record.etag);
  } finally {
    delete process.env.DATABASE_PATH;
    // appStore() holds its SQLite connection open for the process lifetime
    // (the same singleton is reused across requests in production), so on
    // Windows the file can't be unlinked here — best-effort cleanup only.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

test("login exists but stays dependency-light and never exposes password hashes", () => {
  const root = new URL("../", import.meta.url);
  assert.equal(fs.existsSync(new URL("app/login/page.tsx", root)), true);
  assert.equal(fs.existsSync(new URL("app/api/login/route.ts", root)), true);
  assert.equal(fs.existsSync(new URL("lib/auth.ts", root)), true);

  // Login itself needs no env vars/secrets and no auth dependency — sessions
  // are signed with a secret generated and persisted in the same local
  // storage as everything else, and password hashing uses only Node's
  // built-in crypto.
  const packageJson = fs.readFileSync(new URL("package.json", root), "utf8");
  for (const dep of ["jose", "next-auth", "bcrypt", "bcryptjs", "jsonwebtoken"])
    assert.equal(packageJson.includes('"' + dep + '"'), false);

  const authSource = fs.readFileSync(new URL("lib/auth.ts", root), "utf8");
  assert.match(authSource, /passwordHash/);
  const publicUserSource = fs.readFileSync(
    new URL("lib/auth.ts", root),
    "utf8",
  );
  assert.match(publicUserSource, /publicUser/);
  // The exported helper must destructure passwordHash out, not just rename it.
  assert.match(authSource, /passwordHash,\s*\.\.\.rest/);
});

test("credentials email is optional SMTP configuration, documented in .env.example", () => {
  const root = new URL("../", import.meta.url);
  assert.equal(fs.existsSync(new URL("lib/mailer.ts", root)), true);
  assert.equal(fs.existsSync(new URL(".env.example", root)), true);
  const envExample = fs.readFileSync(new URL(".env.example", root), "utf8");
  for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"])
    assert.match(envExample, new RegExp(key));
});

// blob-storage's db handle is a module-level singleton that only reads
// DATABASE_PATH once. Give the mailer test its own copy of the module (a
// distinct data: URL, not the same `storage` instance above) so setting
// DATABASE_PATH here isn't silently ignored because `storage` already
// initialized the singleton in an earlier test.
const mailerBlobStorageURI = uri(
  compile("blob-storage")
    .replace('"./http-error"', JSON.stringify(errorURI))
    .replace(
      '"better-sqlite3"',
      JSON.stringify(import.meta.resolve("better-sqlite3")),
    ) + "\n// separate module instance for the mailer test\n",
);
const mailer = await import(
  uri(
    compile("mailer")
      .replace('"nodemailer"', JSON.stringify(import.meta.resolve("nodemailer")))
      .replace('"./blob-storage"', JSON.stringify(mailerBlobStorageURI))
      .replace('"./http-error"', JSON.stringify(errorURI)),
  )
);

test("mailer degrades gracefully without SMTP configuration, and DB settings override env vars", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smf-mailer-test-"));
  process.env.DATABASE_PATH = join(dir, "app.db");
  try {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    assert.equal(await mailer.mailerConfigured(), false);

    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "demo";
    process.env.SMTP_PASSWORD = "secret";
    assert.equal(await mailer.mailerConfigured(), true);

    // A saved DB record with no host must not shadow the env var config.
    let doc = await mailer.loadSmtpSettings();
    assert.equal(doc.settings, null);

    const next = mailer.applySmtpCommand(doc, {
      kind: "save",
      host: "db-smtp.example.com",
      port: 587,
      user: "db-user",
      password: "db-secret",
      from: "db-user@example.com",
      secure: false,
      allowSelfSigned: true,
    });
    await mailer.saveSmtpSettings(next, doc.revision);
    doc = await mailer.loadSmtpSettings();
    assert.equal(doc.settings.host, "db-smtp.example.com");
    assert.equal(doc.settings.allowSelfSigned, true);
    assert.equal(mailer.publicSmtpSettings(doc.settings).passwordSet, true);
    assert.equal("password" in mailer.publicSmtpSettings(doc.settings), false);

    // Saving again without a password keeps the previously stored one.
    const kept = mailer.applySmtpCommand(doc, {
      kind: "save",
      host: "db-smtp.example.com",
      port: 2525,
      user: "db-user",
      from: "db-user@example.com",
      secure: false,
      allowSelfSigned: false,
    });
    assert.equal(kept.settings.password, "db-secret");
    assert.equal(kept.settings.port, 2525);

    const cleared = mailer.applySmtpCommand(doc, { kind: "clear" });
    assert.equal(cleared.settings, null);

    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
  } finally {
    delete process.env.DATABASE_PATH;
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});
