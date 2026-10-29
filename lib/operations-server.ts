import { appStore, initializeRecord, replaceRevision } from "./blob-storage";
import { HttpError } from "./http-error";
export { HttpError } from "./http-error";
import {
  applyCommand,
  canApprove,
  createOperations,
  matchScope,
  normalizeOperations,
  type Actor,
  type Command,
  type Operations,
  type Reading,
  type Visit,
} from "./operations";
import { loadUsers, readCookie, verifySessionCookie, SESSION_COOKIE_NAME } from "./auth-server";
import { mailerConfigured, sendMail } from "./mailer";
import { issueEmailApprovalLinks } from "./email-approval";

const SEED_OWNER = "system@smf.local";
export async function identity(request: Request): Promise<Actor> {
  const session = await verifySessionCookie(readCookie(request, SESSION_COOKIE_NAME));
  if (!session) throw new HttpError("Please sign in to continue.", 401);
  const doc = await loadUsers();
  const user = doc.users.find((u) => u.email === session.email && u.active);
  if (!user) throw new HttpError("Please sign in to continue.", 401);
  return {
    email: user.email,
    name: user.name,
    isAdmin: user.role === "admin",
    role: user.role,
    plant: user.role === "admin" ? "ALL" : user.plant,
    direction: user.direction,
  };
}
function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim().toLowerCase() ?? "";
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  let originUrl: URL | null = null;
  try {
    originUrl = origin ? new URL(origin) : null;
  } catch {}
  const requestUrl = new URL(request.url);
  const allowedHosts = new Set(
    [
      firstHeaderValue(request.headers.get("x-forwarded-host")),
      firstHeaderValue(request.headers.get("host")),
      requestUrl.host.toLowerCase(),
    ].filter(Boolean),
  );
  const invalid =
    !originUrl ||
    !["http:", "https:"].includes(originUrl.protocol) ||
    !allowedHosts.has(originUrl.host.toLowerCase()) ||
    request.headers.get("sec-fetch-site") === "cross-site";
  if (invalid)
    throw new HttpError(
      "This request must come from the truck scale.",
      403,
    );
}
export const capabilities = async () => ({
  emailConfigured: await mailerConfigured(),
  scaleConfigured: false,
  sapConnected: false,
  externalDriverAccess: true,
});
function todayPHT() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export async function loadState(initialize = true): Promise<Operations> {
  const store = appStore();
  if (initialize)
    await initializeRecord(store, "operations", () =>
      createOperations(todayPHT(), SEED_OWNER),
    );
  const record = await store.getWithMetadata("operations", { type: "json" });
  if (!record)
    throw new HttpError("The service is not yet available.", 404);
  const original = record.data as Operations;
  const state = normalizeOperations(original);
  if ((original.schemaVersion ?? 0) < state.schemaVersion) {
    try {
      await replaceRevision(store, "operations", state, original.revision);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 409) throw error;
      const latest = await store.getWithMetadata("operations", { type: "json" });
      if (!latest) throw error;
      return normalizeOperations(latest.data as Operations);
    }
  }
  return state;
}
export function requireViewer(_state: Operations, _actor: Actor) {
  /* Reserved: identity() already requires a valid session. */
}
export async function operatorView(state: Operations, actor: Actor) {
  const visits = actor.isAdmin
    ? state.visits
    : state.visits.filter((v) => matchScope(actor, v));
  return { ...state, visits, actor, capabilities: await capabilities() };
}
export async function saveState(next: Operations, expectedRevision: number) {
  await replaceRevision(appStore(), "operations", next, expectedRevision);
}
export async function sendNotification(
  id: string,
  revision: number,
  actor?: Actor,
  origin = "",
) {
  const state = await loadState();
  const notification = state.notifications.find((item) => item.id === id);
  if (!notification) throw new HttpError("Notification was not found.", 404);
  const visit = state.visits.find((item) => item.id === notification.visitId);
  if (!visit || (actor && !canApprove(actor, visit)))
    throw new HttpError("This action is unavailable.", 403);
  if (!notification.to.length)
    throw new HttpError("No supervisor is configured for this site and direction.", 503);
  if (!state.emailEnabled || !(await mailerConfigured()))
    throw new HttpError(
      "Email sending is not turned on. Configure and enable it in Settings.",
      503,
    );
  if (state.revision !== revision)
    throw new HttpError(
      "Another user made a change. Refresh and retry; your input has been kept.",
      409,
    );
  for (const recipient of notification.to) {
    const links = await issueEmailApprovalLinks(visit.id, recipient, origin);
    const text = [
      "Review the delivery and submit your decision using one of these secure links:",
      "Approve: " + links.approve,
      "Reject: " + links.reject,
      "These links expire in 48 hours and can be used once. A decision reason is required.",
    ].join("\n");
    await sendMail({ to: recipient, subject: notification.subject, text });
  }
  const next = structuredClone(state);
  const target = next.notifications.find((item) => item.id === id)!;
  target.status = "sent";
  target.sentAt = new Date().toISOString();
  await saveState(next, revision);
}
export async function getReading(
  v: Visit,
  body: {
    source?: string;
    weightKg?: number;
    reason?: string;
    scenario?: string;
  },
  actor: Actor,
): Promise<Reading> {
  const at = new Date().toISOString();
  if (body.source === "manual")
    return {
      kg: Math.round((body.weightKg ?? NaN) * 100) / 100,
      at,
      source: "manual",
      device: "Manual entry",
      by: actor.email,
      reason: (body.reason ?? "").trim(),
    };
  if (body.source === "scale")
    throw new HttpError(
      "The weighbridge is not connected.",
      503,
    );
  throw new HttpError("Select a weight capture method.");
}
export async function mutate(command: Command, actor: Actor, revision: number) {
  const state = await loadState();
  requireViewer(state, actor);
  if (revision !== state.revision)
    throw new HttpError(
      "Another user made a change. Refresh and retry; your input has been kept.",
      409,
    );
  let next: Operations;
  try {
    next = applyCommand(
      state,
      command,
      actor,
      new Date().toISOString(),
      await mailerConfigured(),
    );
  } catch (error) {
    throw new HttpError(
      error instanceof Error
        ? error.message
        : "The operation could not be completed.",
    );
  }
  await saveState(next, revision);
  return await operatorView(await loadState(), actor);
}
export function apiError(error: unknown) {
  if (!(error instanceof HttpError))
    console.error(
      "Truck scale error",
      error instanceof Error ? error.message : "Unknown error",
    );
  const status = error instanceof HttpError ? error.status : 503;
  return Response.json(
    {
      error:
        error instanceof HttpError
          ? error.message
          : "The service is unavailable. Please try again.",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}



