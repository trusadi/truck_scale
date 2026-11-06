import { createHash, randomBytes } from "node:crypto";
import { appStore } from "./blob-storage";
import { canApprove, expectedWeightForLine, type Actor, type Operations, type Visit } from "./operations";
import { HttpError } from "./http-error";
import { loadState, mutate } from "./operations-server";

type Decision = "approve" | "reject";
type LinkRecord = { visitId: string; recipient: string; action: Decision; expiresAt: string; usedAt?: string };
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const recordKey = (token: string) => "email-approval:" + digest(token);

async function issue(visitId: string, recipient: string, action: Decision) {
  const token = randomBytes(32).toString("base64url");
  const record: LinkRecord = {
    visitId,
    recipient,
    action,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  };
  const created = await appStore().setJSON(recordKey(token), record, { onlyIfNew: true });
  if (!created.modified) throw new HttpError("Could not create an approval link.", 503);
  return token;
}

function actorFor(state: Operations, record: LinkRecord, visit: Visit): Actor {
  const supervisor = state.supervisors.find((item) => item.email.toLowerCase() === record.recipient.toLowerCase());
  if (!supervisor) throw new HttpError("This approval link is no longer authorized.", 403);
  const actor: Actor = {
    email: supervisor.email,
    name: supervisor.name,
    isAdmin: false,
    role: "supervisor",
    plant: supervisor.plant as Actor["plant"],
    direction: supervisor.direction,
  };
  if (!canApprove(actor, visit)) throw new HttpError("This approval link is no longer authorized for this delivery.", 403);
  return actor;
}

async function find(token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new HttpError("This approval link is invalid.", 404);
  const store = appStore();
  const entry = await store.getWithMetadata(recordKey(token), { type: "json" });
  if (!entry) throw new HttpError("This approval link is invalid.", 404);
  const record = entry.data as LinkRecord;
  if (record.usedAt) throw new HttpError("This approval link has already been used.", 410);
  if (Date.parse(record.expiresAt) < Date.now()) throw new HttpError("This approval link has expired. Ask the site team to resend the notification.", 410);
  const state = await loadState();
  const visit = state.visits.find((item) => item.id === record.visitId);
  if (!visit || visit.stage !== "approval" || !visit.result || visit.result.within)
    throw new HttpError("This delivery is no longer awaiting approval.", 409);
  const actor = actorFor(state, record, visit);
  return { store, entry, record, state, visit, actor };
}

export async function issueEmailApprovalLinks(visitId: string, recipient: string, origin: string) {
  const approve = await issue(visitId, recipient, "approve");
  const reject = await issue(visitId, recipient, "reject");
  const base = origin.replace(/\/$/, "");
  return {
    approve: `${base}/email-approval/${approve}`,
    reject: `${base}/email-approval/${reject}`,
  };
}

export async function getEmailApproval(token: string) {
  const { record, visit } = await find(token);
  return {
    action: record.action,
    expiresAt: record.expiresAt,
    recipient: record.recipient,
    delivery: {
      plate: visit.plate,
      ticket: visit.ticket,
      plant: visit.plant,
      direction: visit.direction,
      date: visit.date,
      lines: visit.lines.map((line) => ({ document: line.document, material: line.material, description: line.description, expectedKg: expectedWeightForLine(line) })),
      expectedKg: visit.result!.expected,
      measuredKg: visit.result!.net,
      varianceKg: visit.result!.variance,
      variancePercent: visit.result!.percent,
    },
  };
}

export async function decideByEmail(token: string, reason: string) {
  const found = await find(token);
  const reasonText = reason.trim();
  if (reasonText.length < 3 || reasonText.length > 1000) throw new HttpError("Enter a decision reason between 3 and 1,000 characters.", 400);
  await mutate({ kind: found.record.action, id: found.visit.id, reason: reasonText }, found.actor, found.state.revision);
  const used: LinkRecord = { ...found.record, usedAt: new Date().toISOString() };
  const result = await found.store.setJSON(recordKey(token), used, { onlyIfMatch: found.entry.etag });
  if (!result.modified) throw new HttpError("This approval link has already been used.", 409);
  return { ok: true, outcome: found.record.action === "approve" ? "approved" : "rejected" };
}
