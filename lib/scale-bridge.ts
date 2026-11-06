import { appStore } from "./blob-storage";

export type ScaleReading = {
  weightKg: number;
  unit: "kg" | "t";
  deviceId: string;
  receivedAt: string;
};

const PREFIX = "scale-device-";
const STALE_MS = 5 * 60 * 1000; // reading older than 5 minutes is considered stale

function deviceKey(deviceId: string) {
  return PREFIX + deviceId.replace(/[^A-Za-z0-9_-]/g, "_");
}

export async function saveScaleReading(reading: ScaleReading) {
  const store = appStore();
  const key = deviceKey(reading.deviceId);
  const existing = await store.getWithMetadata(key, { type: "json" });
  if (existing) {
    await store.setJSON(key, reading, { onlyIfMatch: existing.etag });
  } else {
    await store.setJSON(key, reading, { onlyIfNew: true });
  }
}

export async function getScaleReading(deviceId: string): Promise<ScaleReading | null> {
  const entry = await appStore().getWithMetadata(deviceKey(deviceId), { type: "json" });
  if (!entry) return null;
  return entry.data as ScaleReading;
}

export async function getAllScaleReadings(): Promise<ScaleReading[]> {
  const store = appStore();
  const list = await store.list({ prefix: PREFIX });
  const readings = await Promise.all(
    list.blobs.map(async (blob) => {
      const entry = await store.getWithMetadata(blob.key, { type: "json" });
      return entry ? (entry.data as ScaleReading) : null;
    }),
  );
  return readings.filter(Boolean) as ScaleReading[];
}

export async function clearScaleReading(deviceId: string): Promise<void> {
  await appStore().delete(deviceKey(deviceId));
}

// kept for backward compat — returns the single most-recent reading across all devices
export async function getLatestScaleReading(): Promise<ScaleReading | null> {
  const all = await getAllScaleReadings();
  if (!all.length) return null;
  return all.sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))[0];
}

export function isStale(reading: ScaleReading): boolean {
  return Date.now() - Date.parse(reading.receivedAt) > STALE_MS;
}

export function checkApiKey(request: Request): void {
  const expected = process.env.SCALE_API_KEY;
  if (!expected) return; // no key configured — open access (dev/test)
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== expected)
    throw Object.assign(new Error("Invalid or missing API key."), { status: 401 });
}
