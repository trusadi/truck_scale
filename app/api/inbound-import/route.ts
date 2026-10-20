import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  companyForPlant,
  createProductTickets,
  newToken,
  type Visit,
  type VisitLine,
} from "@/lib/operations";
import {
  apiError,
  checkOrigin,
  HttpError,
  identity,
  loadState,
  saveState,
} from "@/lib/operations-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const rowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  type: z.enum(["PO", "STO"]),
  document: z.string().trim().min(1).max(60),
  supplier: z.string().trim().max(150),
  plate: z.string().trim().max(20),
  driver: z.string().trim().max(100),
  item: z.string().trim().min(1).max(20),
  material: z.string().trim().min(1).max(80),
  product: z.string().trim().min(1).max(150),
  quantity: z.number().positive().max(200000),
  unit: z.literal("KG"),
}).strict();
const schema = z.object({
  revision: z.number().int().nonnegative(),
  plant: z.enum(["PAG", "CEB", "DAV"]),
  rows: z.array(rowSchema).min(1).max(500),
}).strict();

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const actor = await identity(request);
    if (!actor.isAdmin && (actor.direction === "outbound" || actor.direction === "return" || actor.plant === "ALL"))
      throw new HttpError("An inbound account is required to upload delivery schedules.", 403);
    const raw = await request.text();
    if (raw.length > 500000) throw new HttpError("The upload is too large.", 413);
    const input = schema.parse(JSON.parse(raw));
    if (!actor.isAdmin && actor.plant !== input.plant)
      throw new HttpError("You can upload only to your assigned site.", 403);
    const state = await loadState();
    if (state.revision !== input.revision)
      throw new HttpError("The schedule changed. Refresh the page and upload again.", 409);
    const site = state.sites.find((item) => item.id === input.plant);
    if (!site) throw new HttpError("Select a valid site.");
    const groups = new Map<string, typeof input.rows>();
    for (const row of input.rows) {
      const parsedDate = new Date(row.date + "T00:00:00.000Z");
      if (Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== row.date)
        throw new HttpError("One or more rows contain an invalid date.");
      const key = JSON.stringify([row.date, row.time, row.type, row.document, row.supplier, row.plate, row.driver]);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    const visits: Visit[] = [];
    const uploadedItems = new Set<string>();
    for (const rows of groups.values()) {
      const first = rows[0];
      const duplicateItems = new Set(state.visits
        .filter((visit) => visit.plant === input.plant && visit.date === first.date)
        .flatMap((visit) => visit.lines.map((line) => `${line.document}|${line.item}`)));
      if (rows.some((row) => {
        const key = `${first.date}|${input.plant}|${row.document}|${row.item}`;
        if (duplicateItems.has(`${row.document}|${row.item}`) || uploadedItems.has(key)) return true;
        uploadedItems.add(key);
        return false;
      }))
        throw new HttpError(`Delivery ${first.document} already exists or has duplicate items for ${first.date} at ${input.plant}. No rows were imported.`);
      const lines: VisitLine[] = rows.map((row) => ({
        type: row.type,
        document: row.document,
        item: row.item,
        material: row.material,
        description: row.product,
        quantity: row.quantity,
        unit: "KG",
      }));
      const now = new Date().toISOString();
      visits.push({
        id: "IMP-" + randomUUID(),
        date: first.date,
        company: site.company || companyForPlant(input.plant),
        plant: input.plant,
        time: first.time,
        direction: "inbound",
        origin: first.supplier || "Inbound supplier",
        plate: first.plate.toUpperCase(),
        driver: first.driver,
        carrier: first.supplier,
        lines,
        expectedKg: rows.reduce((sum, row) => sum + row.quantity, 0),
        stage: "scheduled",
        ticket: null,
        arrivedAt: null,
        holdReason: "",
        readings: [],
        productTickets: createProductTickets(lines),
        activeTicket: 0,
        result: null,
        decision: null,
        token: newToken(),
        tokenExpires: new Date(Date.now() + 7 * 86400000).toISOString(),
        events: [{ at: now, text: "Inbound delivery schedule imported from Excel", by: actor.email }],
      });
    }
    const next = { ...state, visits: [...state.visits, ...visits] };
    await saveState(next, input.revision);
    return Response.json({ revision: next.revision, imported: visits.length, products: input.rows.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json({ error: "The workbook rows are invalid. Check the template columns and values." }, { status: 400 });
    return apiError(error);
  }
}
