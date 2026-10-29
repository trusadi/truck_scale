import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { appStore, initializeRecord, replaceRevision } from "./blob-storage";
import { HttpError } from "./http-error";
import type { AccessDirection, Direction, Role } from "./operations";
import type { PlantScope, SessionPayload, UserRecord, UsersDoc } from "./auth";

export const SESSION_COOKIE_NAME = "smf_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return "scrypt:" + salt.toString("hex") + ":" + hash.toString("hex");
}
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
// Fixed hash so a login for a non-existent email takes the same time as a wrong password.
const DUMMY_HASH = hashPassword("not-a-real-password");

function seedUsers(): UserRecord[] {
  const accounts: [string, string, string, Role, PlantScope][] = [
    ["admin@smf.local", "System Administrator", "Admin#12345", "admin", "ALL"],
    ["pagbilao.supervisor@smf.local", "Pagbilao Supervisor", "Supervisor#12345", "supervisor", "PAG"],
    ["pagbilao.operator@smf.local", "Pagbilao Operator", "Operator#12345", "operator", "PAG"],
    ["cebu.supervisor@smf.local", "Cebu Supervisor", "Supervisor#12345", "supervisor", "CEB"],
    ["cebu.operator@smf.local", "Cebu Operator", "Operator#12345", "operator", "CEB"],
    ["davao.supervisor@smf.local", "Davao Supervisor", "Supervisor#12345", "supervisor", "DAV"],
    ["davao.operator@smf.local", "Davao Operator", "Operator#12345", "operator", "DAV"],
  ];
  return accounts.map(([email, name, password, role, plant]) => ({
    email,
    name,
    passwordHash: hashPassword(password),
    role,
    plant: role === "admin" ? "ALL" : plant,
    direction: "both",
    active: true,
  }));
}

export async function loadUsers(): Promise<UsersDoc> {
  return await initializeRecord(appStore(), "users", () => ({
    schemaVersion: 1,
    revision: 0,
    users: seedUsers(),
  }));
}
export async function saveUsers(next: UsersDoc, expectedRevision: number) {
  await replaceRevision(appStore(), "users", next, expectedRevision);
}
export type LoginHistoryEvent = {
  email: string;
  name: string;
  role: Role;
  plant: PlantScope;
  direction: AccessDirection;
  at: string;
};
type LoginHistoryDocument = { events: LoginHistoryEvent[] };
const LOGIN_HISTORY_KEY = "login-history";
const LOGIN_HISTORY_LIMIT = 500;

export async function loadLoginHistory(): Promise<LoginHistoryEvent[]> {
  const doc = await initializeRecord<LoginHistoryDocument>(appStore(), LOGIN_HISTORY_KEY, () => ({ events: [] }));
  return Array.isArray(doc.events) ? doc.events : [];
}

export async function recordLogin(user: UserRecord) {
  const store = appStore();
  const event: LoginHistoryEvent = {
    email: user.email,
    name: user.name,
    role: user.role,
    plant: user.plant,
    direction: user.direction,
    at: new Date().toISOString(),
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await store.getWithMetadata(LOGIN_HISTORY_KEY, { type: "json" });
    if (!current) {
      const created = await store.setJSON(LOGIN_HISTORY_KEY, { events: [event] }, { onlyIfNew: true });
      if (created.modified) return;
      continue;
    }
    const history = current.data as LoginHistoryDocument;
    const updated = await store.setJSON(
      LOGIN_HISTORY_KEY,
      { events: [event, ...(Array.isArray(history.events) ? history.events : [])].slice(0, LOGIN_HISTORY_LIMIT) },
      { onlyIfMatch: current.etag },
    );
    if (updated.modified) return;
  }
  throw new HttpError("Login history could not be saved. Please try signing in again.", 503);
}
export async function verifyLogin(email: string, password: string) {
  const doc = await loadUsers();
  const user = doc.users.find((u) => u.email === email.trim().toLowerCase());
  const ok = verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.active || !ok) return null;
  return user;
}

let cachedSecret: string | null = null;
async function signingSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const doc = await initializeRecord<{ revision: number; secret: string }>(
    appStore(),
    "auth-secret",
    () => ({ revision: 0, secret: randomBytes(32).toString("hex") }),
  );
  cachedSecret = doc.secret;
  return cachedSecret;
}
function sign(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("base64url");
}
function secureCookie(): boolean {
  if (process.env.SECURE_COOKIE === "true") return true;
  if (process.env.SECURE_COOKIE === "false") return false;
  return process.env.NODE_ENV === "production";
}
export async function createSessionCookie(payload: Omit<SessionPayload, "exp">) {
  const secret = await signingSecret();
  const full: SessionPayload = { ...payload, exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  return {
    name: SESSION_COOKIE_NAME,
    value: body + "." + sign(body, secret),
    options: {
      httpOnly: true as const,
      sameSite: "lax" as const,
      secure: secureCookie(),
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
  };
}
export async function verifySessionCookie(
  value: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!value) return null;
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  const secret = await signingSecret();
  const expected = sign(body, secret);
  if (
    expected.length !== signature.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  )
    return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name)
      return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export type UserCommand =
  | { kind: "create"; email: string; name: string; password: string; role: Role; plant: PlantScope; direction: AccessDirection }
  | { kind: "set_active"; email: string; active: boolean }
  | { kind: "update_access"; email: string; role: Role; plant: PlantScope; direction: AccessDirection }
  | { kind: "reset_password"; email: string; password: string };

export function applyUserCommand(doc: UsersDoc, cmd: UserCommand): UsersDoc {
  const next = structuredClone(doc);
  const email = cmd.email.trim().toLowerCase();
  if (cmd.kind === "create") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new HttpError("Enter a valid email address.");
    if (next.users.some((u) => u.email === email))
      throw new HttpError("A user with this email already exists.");
    if (!cmd.name.trim()) throw new HttpError("Enter a name.");
    if (cmd.password.length < 8)
      throw new HttpError("Password must be at least 8 characters.");
    if (!["admin", "supervisor", "operator"].includes(cmd.role))
      throw new HttpError("Select a valid role.");
    next.users.push({
      email,
      name: cmd.name.trim(),
      passwordHash: hashPassword(cmd.password),
      role: cmd.role,
      plant: cmd.role === "admin" ? "ALL" : cmd.plant,
      direction: cmd.direction,
      active: true,
    });
    return next;
  }
  const user = next.users.find((u) => u.email === email);
  if (!user) throw new HttpError("User was not found.", 404);
  if (cmd.kind === "set_active") {
    if (!cmd.active && user.active && user.role === "admin" &&
      !next.users.some((candidate) => candidate.email !== email && candidate.active && candidate.role === "admin"))
      throw new HttpError("The last active administrator cannot be deactivated.");
    user.active = cmd.active;
  }
  if (cmd.kind === "update_access") {
    if (!(["admin", "supervisor", "operator"] as string[]).includes(cmd.role))
      throw new HttpError("Select a valid role.");
    if (!( ["ALL", "PAG", "CEB", "DAV"] as string[]).includes(cmd.plant))
      throw new HttpError("Select a valid site.");
    if (!( ["both", "inbound", "outbound", "return"] as string[]).includes(cmd.direction))
      throw new HttpError("Select a valid delivery direction.");
    if (user.active && user.role === "admin" && cmd.role !== "admin" &&
      !next.users.some((candidate) => candidate.email !== email && candidate.active && candidate.role === "admin"))
      throw new HttpError("The last active administrator cannot be changed to another role.");
    user.role = cmd.role;
    user.plant = cmd.role === "admin" ? "ALL" : cmd.plant;
    user.direction = cmd.direction;
  }
  if (cmd.kind === "reset_password") {
    if (cmd.password.length < 8)
      throw new HttpError("Password must be at least 8 characters.");
    user.passwordHash = hashPassword(cmd.password);
  }
  return next;
}
