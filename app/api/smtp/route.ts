import { z } from "zod";
import {
  applySmtpCommand,
  loadSmtpSettings,
  publicSmtpSettings,
  saveSmtpSettings,
  sendMail,
} from "@/lib/mailer";
import { apiError, checkOrigin, HttpError, identity } from "@/lib/operations-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("save"),
      revision: z.number().int().nonnegative(),
      host: z.string().min(1).max(200),
      port: z.number().int().min(1).max(65535),
      user: z.string().min(1).max(200),
      password: z.string().max(200).optional(),
      from: z.string().min(1).max(200),
      secure: z.boolean(),
      allowSelfSigned: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("clear"),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("test"),
      to: z.string().trim().toLowerCase().email().max(200),
    })
    .strict(),
]);

export async function GET(request: Request) {
  try {
    const actor = await identity(request);
    if (!actor.isAdmin)
      throw new HttpError("Only the administrator can manage SMTP settings.", 403);
    const doc = await loadSmtpSettings();
    return Response.json(
      { revision: doc.revision, settings: publicSmtpSettings(doc.settings) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const actor = await identity(request);
    if (!actor.isAdmin)
      throw new HttpError("Only the administrator can manage SMTP settings.", 403);
    const body = schema.parse(JSON.parse(await request.text()));

    if (body.kind === "test") {
      await sendMail({
        to: body.to,
        subject: "SMF Truck Scale test email",
        text: "This is a test email from SMF Truck Scale. If you received this, SMTP is configured correctly.",
      });
      return Response.json({ ok: true });
    }

    const { revision, ...cmd } = body;
    const doc = await loadSmtpSettings();
    const next = applySmtpCommand(doc, cmd);
    await saveSmtpSettings(next, revision);
    return Response.json(
      { revision: next.revision, settings: publicSmtpSettings(next.settings) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof z.ZodError)
      return Response.json(
        {
          error: "Check the required fields.",
          details: e.issues.map((i) => i.path.join(".") + ": " + i.message),
        },
        { status: 400 },
      );
    return apiError(e);
  }
}
