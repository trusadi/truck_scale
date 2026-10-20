import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { applyUserCommand, loadUsers, saveUsers } from "@/lib/auth-server";
import { appStore } from "@/lib/blob-storage";
import { HttpError } from "@/lib/http-error";
import { apiError, checkOrigin } from "@/lib/operations-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ token: z.string().min(40).max(100), password: z.string().min(8).max(200) }).strict();
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = schema.parse(JSON.parse(await request.text()));
    const users = await loadUsers();
    const store = appStore();
    const entries = await Promise.all(users.users.map(async (user) => {
      const key = `password-reset:${Buffer.from(user.email).toString("base64url")}`;
      const entry = await store.getWithMetadata(key, { type: "json" });
      return { user, key, entry };
    }));
    const presented = Buffer.from(hashToken(input.token), "hex");
    const match = entries.find(({ user, entry }) => {
      if (!user.active || !entry) return false;
      const reset = entry.data as { tokenHash?: string; expiresAt?: number; consumed?: boolean };
      if (reset.consumed || !reset.tokenHash || (reset.expiresAt ?? 0) < Date.now()) return false;
      const expected = Buffer.from(reset.tokenHash, "hex");
      return expected.length === presented.length && timingSafeEqual(expected, presented);
    });
    if (!match) throw new HttpError("This password reset link is invalid or expired. Request a new one.", 400);
    const nextUsers = applyUserCommand(users, { kind: "reset_password", email: match.user.email, password: input.password });
    await saveUsers(nextUsers, users.revision);
    const latest = await store.getWithMetadata(match.key, { type: "json" });
    if (!latest) throw new HttpError("This password reset link is invalid or expired. Request a new one.", 400);
    const current = latest.data as { revision: number; tokenHash: string; expiresAt: number; consumed: boolean };
    if (current.consumed || current.tokenHash !== (match.entry!.data as { tokenHash: string }).tokenHash || current.expiresAt < Date.now())
      throw new HttpError("This password reset link is invalid or expired. Request a new one.", 400);
    const result = await store.setJSON(match.key, { ...current, revision: current.revision + 1, consumed: true }, { onlyIfMatch: latest.etag });
    if (!result.modified) throw new HttpError("This password reset link was already used. Request a new one.", 400);
    return Response.json({ ok: true, message: "Your password has been reset. You can now sign in." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json({ error: "Use a valid reset link and a password with at least 8 characters." }, { status: 400 });
    return apiError(error);
  }
}
