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
  truckType: z.string().trim().max(50).default(""),
  hauler: z.string().trim().max(150).default(""),
  driver: z.string().trim().max(100),
  driverId: z.string().trim().max(50).default(""),
  helperName: z.string().trim().max(100).default(""),
  helperId: z.string().trim().max(50).default(""),
  contact: z.string().trim().max(30).default(""),
  item: z.string().trim().min(1).max(20),
  material: z.string().trim().min(1).max(80),
  product: z.string().trim().min(1).max(150),
  quantity: z.number().positive().max(200000),
  unit: z.literal("KG"),
}).strict();
const schema = z.object({
  revision: z.number().int().nonnegative(),
  plant: z.string().min(1).max(10).regex(/^[A-Za-z0-9]+$/),
  deliveryType: z.enum(["inbound", "outbound", "return"]),
  rows: z.array(rowSchema).min(1).max(500),
}).strict();

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const actor = await identity(request);

    const raw = await request.text();
    if (raw.length > 500000) throw new HttpError("The upload is too large.", 413);
    const input = schema.parse(JSON.parse(raw));
    const canUpload = actor.isAdmin || actor.direction === "both" ||
      actor.direction === input.deliveryType ||
      (input.deliveryType === "return" && actor.direction === "inbound");
    if (!canUpload || actor.plant === "ALL" && !actor.isAdmin)
      throw new HttpError("Your account is not authorized to upload this delivery type.", 403);
    const visitDirection = input.deliveryType === "outbound" ? "outbound" : "inbound";
    const isForProcess = (visit: Visit) =>
      visit.direction === visitDirection &&
      (input.deliveryType === "return"
        ? visit.lines.some((line) => line.type === "RD")
        : input.deliveryType === "inbound"
          ? !visit.lines.some((line) => line.type === "RD")
          : true);
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
      // One truck at one appointment time is one visit, even across multiple PO/STO lines.
      const key = JSON.stringify([input.deliveryType, row.date, row.time, row.plate.trim().toUpperCase()]);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    const visits: Visit[] = [];
    // Build a cross-date duplicate index for the whole plant upfront
    const existingItems = new Set(state.visits
      .filter((visit) => visit.plant === input.plant && isForProcess(visit))
      .flatMap((visit) => visit.lines.map((line) => `${line.document}|${line.item}`)));
    const uploadedItems = new Set<string>();
    const uploadedLines: VisitLine[] = [];
    let importedGroups = 0;
    for (const rows of groups.values()) {
      const first = rows[0];
      if (rows.some((row) => {
        const key = `${row.document}|${row.item}`;
        if (existingItems.has(key) || uploadedItems.has(key)) return true;
        uploadedItems.add(key);
        return false;
      }))
        throw new HttpError(`Delivery ${first.document} already exists (duplicate document/item) at ${input.plant}. No rows were imported.`);
      const lines: VisitLine[] = rows.map((row) => ({
        type: input.deliveryType === "outbound" ? "DO" : input.deliveryType === "return" ? "RD" : row.type,
        document: row.document,
        item: row.item,
        material: row.material,
        description: row.product,
        quantity: row.quantity,
        unit: "KG",
      }));
      uploadedLines.push(...lines);
      const now = new Date().toISOString();
      const importedVisit: Visit = {
        id: "IMP-" + randomUUID(),
        date: first.date,
        company: site.company || companyForPlant(input.plant),
        plant: input.plant,
        time: first.time,
        direction: visitDirection,
        origin: first.supplier || (input.deliveryType === "return" ? "Return delivery" : input.deliveryType === "outbound" ? "Outbound customer" : "Inbound supplier"),
        plate: first.plate.toUpperCase(),
        truckType: first.truckType || undefined,
        driver: first.driver,
        driverId: first.driverId || undefined,
        helperName: first.helperName || undefined,
        helperId: first.helperId || undefined,
        contact: first.contact || undefined,
        carrier: first.hauler || first.supplier,
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
        events: [{ at: now, text: `${input.deliveryType === "return" ? "Return" : input.deliveryType === "outbound" ? "Outbound" : "Inbound"} schedule imported from Excel`, by: actor.email }],
      };
      const matchingVisit = state.visits.find((visit) =>
        isForProcess(visit) &&
        visit.plant === input.plant &&
        visit.date === first.date &&
        visit.time === first.time &&
        visit.plate.trim().toUpperCase() === first.plate.trim().toUpperCase()
      );
      if (matchingVisit) {
        if (!(["scheduled", "waiting"].includes(matchingVisit.stage)) || matchingVisit.readings.length > 0 || matchingVisit.result)
          throw new HttpError(`Truck ${first.plate} already has a visit in progress for ${first.date} at ${first.time}. No rows were imported.`);
        const firstSequence = matchingVisit.productTickets.length;
        matchingVisit.lines.push(...importedVisit.lines);
        matchingVisit.productTickets.push(...importedVisit.productTickets.map((item, index) => ({
          ...item,
          id: "PRODUCT-" + String(firstSequence + index + 1).padStart(2, "0"),
          sequence: firstSequence + index + 1,
        })));
        matchingVisit.expectedKg = (matchingVisit.expectedKg ?? 0) + (importedVisit.expectedKg ?? 0);
        matchingVisit.events.push(...importedVisit.events);
        matchingVisit.events.push({ at: now, text: "Products added to existing truck appointment", by: actor.email });
      } else {
        visits.push(importedVisit);
      }
      importedGroups += 1;
    }
    const materialCatalog = new Map(state.materialCatalog.map((item) => [item.code.toUpperCase(), item]));
    for (const line of uploadedLines) {
      const code = line.material.trim().toUpperCase();
      if (code && line.description.trim() && !materialCatalog.has(code))
        materialCatalog.set(code, { code, description: line.description.trim() });
    }
    const next = { ...state, visits: [...state.visits, ...visits], materialCatalog: [...materialCatalog.values()] };
    await saveState(next, input.revision);
    return Response.json({ revision: next.revision, imported: importedGroups, products: input.rows.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json({ error: "The workbook rows are invalid. Check the template columns and values." }, { status: 400 });
    return apiError(error);
  }
}
