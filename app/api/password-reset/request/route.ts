import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { loadUsers } from "@/lib/auth-server";
import { appStore, initializeRecord, replaceRevision } from "@/lib/blob-storage";
import { HttpError } from "@/lib/http-error";
import { mailerConfigured, sendMail } from "@/lib/mailer";
import { apiError, checkOrigin } from "@/lib/operations-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(200) }).strict();
const tokenKey = (email: string) => `password-reset:${Buffer.from(email).toString("base64url")}`;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

type ResetRecord = { revision: number; tokenHash: string; expiresAt: number; consumed: boolean };

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = schema.parse(JSON.parse(await request.text()));
    if (!(await mailerConfigured()))
      throw new HttpError("Password recovery email is not configured. Contact your administrator.", 503);
    const users = await loadUsers();
    const user = users.users.find((candidate) => candidate.email === input.email && candidate.active);
    if (user) {
      const token = randomBytes(32).toString("base64url");
      const key = tokenKey(user.email);
      const current = await initializeRecord<ResetRecord>(appStore(), key, () => ({ revision: 0, tokenHash: "", expiresAt: 0, consumed: true }));
      await replaceRevision(appStore(), key, {
        ...current,
        tokenHash: hashToken(token),
        expiresAt: Date.now() + 30 * 60 * 1000,
        consumed: false,
      }, current.revision);
      const baseUrl = process.env.APP_BASE_URL?.trim().replace(/\/$/, "") || new URL(request.url).origin;
      await sendMail({
        to: user.email,
        subject: "Reset your Truck Scale password",
        text: `Hello ${user.name},\n\nUse this link within 30 minutes to set a new password:\n${baseUrl}/reset-password?token=${encodeURIComponent(token)}\n\nIf you did not request this, you can ignore this email.`,
      });
    }
    return Response.json({ ok: true, message: "If an active account matches that email, password reset instructions have been sent." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    return apiError(error);
  }
}
