import { z } from "zod";
import { checkApiKey, getAllScaleReadings, isStale, saveScaleReading } from "@/lib/scale-bridge";
import { apiError, identity, requireViewer, loadState } from "@/lib/operations-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — returns all device readings; requires a logged-in operator session
export async function GET(request: Request) {
  try {
    const actor = await identity(request);
    const state = await loadState();
    requireViewer(state, actor);
    const readings = await getAllScaleReadings();
    return Response.json({
      readings: readings.map((r) => ({ ...r, stale: isStale(r) })),
    });
  } catch (e) {
    return apiError(e);
  }
}

const schema = z.object({
  weightKg: z.number().positive().max(200000),
  unit: z.enum(["kg", "t"]).default("kg"),
  deviceId: z.string().min(1).max(100),
});

// POST — called by the scale bridge agent to push a new reading
export async function POST(request: Request) {
  try {
    checkApiKey(request);
    const body = schema.parse(await request.json());
    const reading = { ...body, receivedAt: new Date().toISOString() };
    await saveScaleReading(reading);
    return Response.json({ ok: true, receivedAt: reading.receivedAt });
  } catch (e) {
    return apiError(e);
  }
}
