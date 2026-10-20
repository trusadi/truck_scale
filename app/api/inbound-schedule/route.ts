import { z } from "zod";
import { saveState, loadState, identity, checkOrigin, apiError, HttpError } from "@/lib/operations-server";
import type { VisitLine } from "@/lib/operations";
import { createProductTickets } from "@/lib/operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const lineSchema = z.object({
  type: z.enum(["PO", "STO", "RD"]),
  document: z.string().trim().min(1).max(60),
  item: z.string().trim().min(1).max(20),
  material: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(150),
  quantity: z.number().positive().max(200000),
  unit: z.literal("KG"),
}).strict();
const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("edit"),
    revision: z.number().int().nonnegative(),
    id: z.string().min(1).max(100),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    supplier: z.string().trim().max(150),
    plate: z.string().trim().max(20),
    driver: z.string().trim().max(100),
    lines: z.array(lineSchema).min(1).max(100),
  }).strict(),
  z.object({
    kind: z.literal("delete"),
    revision: z.number().int().nonnegative(),
    id: z.string().min(1).max(100),
  }).strict(),
]);

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const actor = await identity(request);
    if (!actor.isAdmin) throw new HttpError("Only an administrator can correct scheduled deliveries.", 403);
    const raw = await request.text();
    if (raw.length > 100000) throw new HttpError("The request is too large.", 413);
    const cmd = schema.parse(JSON.parse(raw));
    const state = await loadState();
    if (state.revision !== cmd.revision)
      throw new HttpError("The schedule changed. Refresh and try again.", 409);
    const visit = state.visits.find((item) => item.id === cmd.id);
    if (!visit || visit.direction !== "inbound") throw new HttpError("Inbound delivery was not found.", 404);
    if (visit.stage !== "scheduled" || visit.readings.length > 0 || visit.ticket !== null)
      throw new HttpError("Only scheduled deliveries with no check-in or weighing activity can be changed.", 409);
    const next = structuredClone(state);
    const target = next.visits.find((item) => item.id === cmd.id)!;
    if (cmd.kind === "delete") {
      next.visits = next.visits.filter((item) => item.id !== cmd.id);
    } else {
      const date = new Date(cmd.date + "T00:00:00.000Z");
      if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== cmd.date)
        throw new HttpError("Enter a valid delivery date.");
      const lineKeys = new Set<string>();
      for (const line of cmd.lines) {
        const key = line.document + "|" + line.item;
        if (lineKeys.has(key)) throw new HttpError("Each document must have unique item numbers.");
        lineKeys.add(key);
        if (next.visits.some((other) => other.id !== target.id && other.plant === target.plant && other.date === cmd.date && other.lines.some((otherLine) => otherLine.document === line.document && otherLine.item === line.item)))
          throw new HttpError(`Document ${line.document}, item ${line.item} already exists at this site for ${cmd.date}.`);
      }
      target.date = cmd.date;
      target.time = cmd.time;
      target.origin = cmd.supplier || "Inbound supplier";
      target.carrier = cmd.supplier;
      target.plate = cmd.plate.toUpperCase();
      target.driver = cmd.driver;
      target.lines = cmd.lines as VisitLine[];
      target.expectedKg = target.lines.reduce((sum, line) => sum + line.quantity, 0);
      target.productTickets = createProductTickets(target.lines);
      target.activeTicket = 0;
      target.events.push({ at: new Date().toISOString(), by: actor.email, text: "Scheduled inbound delivery corrected by administrator" });
    }
    await saveState(next, cmd.revision);
    return Response.json({ revision: next.revision, deleted: cmd.kind === "delete" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json({ error: "Check the required fields and product rows." }, { status: 400 });
    return apiError(error);
  }
}
