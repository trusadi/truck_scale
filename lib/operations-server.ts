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

const SEED_OWNER = "system@smf.demo";
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
      "This request must come from the truck scale demo.",
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
    throw new HttpError("The demo workflow is not yet available.", 404);
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
export async function resetDemo(expectedRevision: number, actor: Actor) {
  if (!actor.isAdmin)
    throw new HttpError("Only the administrator can reset the demo.", 403);
  const current = await loadState();
  if (current.revision !== expectedRevision)
    throw new HttpError(
      "The demo changed. Refresh and try the reset again.",
      409,
    );
  const reset = createOperations(todayPHT(), SEED_OWNER);
  await saveState(reset, expectedRevision);
  return await operatorView(await loadState(), actor);
}
export async function sendNotification(
  id: string,
  revision: number,
  actor?: Actor,
) {
  const state = await loadState();
  const notification = state.notifications.find((item) => item.id === id);
  if (!notification) throw new HttpError("Notification was not found.", 404);
  const visit = state.visits.find((item) => item.id === notification.visitId);
  if (!visit || (actor && !canApprove(actor, visit)))
    throw new HttpError("This demo action is unavailable.", 403);
  if (!notification.to.length)
    throw new HttpError("No supervisor is configured for this site and direction.", 503);
  if (!state.emailEnabled || !(await mailerConfigured()))
    throw new HttpError(
      "Email sending is not turned on. Configure and enable it in Settings.",
      503,
    );
  if (state.revision !== revision)
    throw new HttpError(
      "Another visitor updated the demo. Refresh and retry; your input has been kept.",
      409,
    );
  await sendMail({
    to: notification.to.join(","),
    subject: notification.subject,
    text: notification.body,
  });
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
  if (body.source === "simulator") {
    const factor =
      body.scenario === "shortage"
        ? 0.965
        : body.scenario === "excess"
          ? 1.025
          : 1.001;
    const current = v.productTickets[v.activeTicket];
    if (!current)
      throw new HttpError("No product weighing ticket is available.", 400);
    const baseline = v.direction === "inbound" ? 10420 : 9200;
    const previous = v.readings.at(-1)?.kg;
    const simulated =
      v.stage === "first_weigh"
        ? v.direction === "inbound"
          ? baseline +
            v.productTickets.reduce((sum, item) => sum + item.expectedKg, 0)
          : baseline
        : previous == null
          ? NaN
          : v.direction === "inbound"
            ? previous - current.expectedKg * factor
            : previous + current.expectedKg * factor;
    return {
      kg: Math.round(simulated * 100) / 100,
      at,
      source: "simulator",
      device: "Demo weighbridge",
      by: actor.email,
      reason:
        "Simulated reading · " +
        (v.stage === "first_weigh"
          ? v.direction === "inbound"
            ? "initial loaded truck"
            : "initial empty truck"
          : "product " +
            current.sequence +
            " " +
            current.line.material +
            " · " +
            (body.scenario ?? "within")),
    };
  }
  if (body.source === "scale")
    throw new HttpError(
      "The physical weighbridge is not connected in this demo.",
      503,
    );
  throw new HttpError("Select a weight capture method.");
}
export async function mutate(command: Command, actor: Actor, revision: number) {
  const state = await loadState();
  requireViewer(state, actor);
  if (revision !== state.revision)
    throw new HttpError(
      "Another visitor updated the demo. Refresh and retry; your input has been kept.",
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
      "Truck scale demo failure",
      error instanceof Error ? error.message : "Unknown error",
    );
  const status = error instanceof HttpError ? error.status : 503;
  return Response.json(
    {
      error:
        error instanceof HttpError
          ? error.message
          : "The demo service is unavailable. Please try again.",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
