import { z } from "zod";
import { canOperate, type Command } from "@/lib/operations";
import {
  apiError,
  checkOrigin,
  getReading,
  HttpError,
  identity,
  loadState,
  mutate,
  operatorView,
  requireViewer,
  resetDemo,
  sendNotification,
} from "@/lib/operations-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const actor = await identity(request),
      state = await loadState();
    requireViewer(state, actor);
    return Response.json(await operatorView(state, actor), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
const schema = z
  .object({
    revision: z.number().int().nonnegative(),
    kind: z.enum([
      "checkin",
      "call",
      "send",
      "hold",
      "resume",
      "handling_done",
      "capture",
      "approve",
      "reject",
      "complete",
      "renew_qr",
      "settings",
      "notify",
      "reset",
      "add_recipient",
      "remove_recipient",
      "add_company",
      "remove_company",
      "add_site",
      "remove_site",
    ]),
    id: z.string().max(100).optional(),
    plate: z.string().max(20).optional(),
    driver: z.string().max(100).optional(),
    carrier: z.string().max(150).optional(),
    reason: z.string().max(1000).optional(),
    source: z.enum(["manual", "simulator", "scale"]).optional(),
    weightKg: z.number().positive().max(200000).optional(),
    scenario: z.enum(["within", "shortage", "excess"]).optional(),
    level: z.enum(["company", "plant", "material"]).optional(),
    company: z.string().min(1).max(10).regex(/^[A-Za-z0-9]+$/).optional(),
    plant: z.string().min(1).max(10).regex(/^[A-Za-z0-9]+$/).optional(),
    material: z.string().min(1).max(80).optional(),
    direction: z.enum(["inbound", "outbound"]).optional(),
    rule: z
      .object({
        unit: z.enum(["kg", "percent"]),
        shortage: z.number().nonnegative().max(200000),
        excess: z.number().nonnegative().max(200000),
        version: z.number().int(),
      })
      .optional(),
    process: z
      .object({
        company: z.string().min(1).max(10).regex(/^[A-Za-z0-9]+$/),
        direction: z.enum(["inbound", "outbound"]),
        version: z.number().int().nonnegative(),
        steps: z
          .array(
            z.object({
              id: z.enum([
                "queue",
                "initial_weigh",
                "product_handling",
                "product_weighing",
                "weight_check",
                "approval",
                "gate_exit",
              ]),
              label: z.string().min(1).max(80),
              enabled: z.boolean(),
              required: z.boolean(),
            }),
          )
          .length(7),
      })
      .optional(),
    emailEnabled: z.boolean().optional(),
    email: z.string().trim().toLowerCase().email().max(200).optional(),
    name: z.string().min(1).max(100).optional(),
    recipientPlant: z.string().min(1).max(10).optional(),
    recipientDirection: z.enum(["both", "inbound", "outbound"]).optional(),
    companyId: z.string().min(1).max(10).regex(/^[A-Za-z0-9]+$/).optional(),
    companyName: z.string().min(1).max(100).optional(),
    siteId: z.string().min(1).max(10).regex(/^[A-Za-z0-9]+$/).optional(),
    siteLabel: z.string().min(1).max(100).optional(),
    siteCompany: z.string().min(1).max(10).regex(/^[A-Za-z0-9]+$/).optional(),
  })
  .strict();
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const actor = await identity(request);
    if (Number(request.headers.get("content-length") ?? 0) > 30000)
      throw new HttpError("Request is too large.", 413);
    const raw = await request.text();
    if (raw.length > 30000) throw new HttpError("Request is too large.", 413);
    const body = schema.parse(JSON.parse(raw));
    if (body.kind === "reset")
      return Response.json(await resetDemo(body.revision, actor), {
        headers: { "Cache-Control": "no-store" },
      });
    if (body.kind === "notify") {
      await sendNotification(body.id ?? "", body.revision, actor);
      return Response.json(await operatorView(await loadState(), actor), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const cmd: Command = { ...body };
    if (body.kind === "capture") {
      const state = await loadState(),
        v = state.visits.find((v) => v.id === body.id);
      if (!v || !canOperate(actor, v))
        throw new HttpError(
          "You are not authorized to weigh this delivery.",
          403,
        );
      if (state.revision !== body.revision)
        throw new HttpError(
          "The delivery was updated. Refresh and retry.",
          409,
        );
      if (!["first_weigh", "second_weigh"].includes(v.stage))
        throw new HttpError("This truck is not ready for weight capture.");
      cmd.reading = await getReading(v, body, actor);
    }
    return Response.json(await mutate(cmd, actor, body.revision), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof z.ZodError)
      return Response.json(
        {
          error: "Check the required fields and numeric values.",
          details: e.issues.map((i) => i.path.join(".") + ": " + i.message),
        },
        { status: 400 },
      );
    return apiError(e);
  }
}
