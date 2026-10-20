import { z } from "zod";
import { publicUser } from "@/lib/auth";
import { applyUserCommand, loadUsers, saveUsers } from "@/lib/auth-server";
import { apiError, checkOrigin, HttpError, identity } from "@/lib/operations-server";
import { mailerConfigured, sendMail } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const email = z.string().trim().toLowerCase().email().max(200);
const schema = z.discriminatedUnion("kind", [
  z
    .object({
      revision: z.number().int().nonnegative(),
      kind: z.literal("create"),
      email,
      name: z.string().min(1).max(100),
      password: z.string().min(8).max(200),
      role: z.enum(["admin", "supervisor", "operator"]),
      plant: z.enum(["ALL", "PAG", "CEB", "DAV"]),
      direction: z.enum(["both", "inbound", "outbound", "return"]),
    })
    .strict(),
  z
    .object({
      revision: z.number().int().nonnegative(),
      kind: z.literal("set_active"),
      email,
      active: z.boolean(),
    })
    .strict(),
  z
    .object({
      revision: z.number().int().nonnegative(),
      kind: z.literal("update_access"),
      email,
      role: z.enum(["admin", "supervisor", "operator"]),
      plant: z.enum(["ALL", "PAG", "CEB", "DAV"]),
      direction: z.enum(["both", "inbound", "outbound", "return"]),
    })
    .strict(),
  z
    .object({
      revision: z.number().int().nonnegative(),
      kind: z.literal("reset_password"),
      email,
      password: z.string().min(8).max(200),
    })
    .strict(),
]);

export async function GET(request: Request) {
  try {
    const actor = await identity(request);
    if (!actor.isAdmin)
      throw new HttpError("Only the administrator can manage users.", 403);
    const doc = await loadUsers();
    return Response.json(
      {
        revision: doc.revision,
        users: doc.users.map(publicUser),
        mailerConfigured: await mailerConfigured(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}

function credentialsEmail(origin: string, email: string, password: string) {
  return {
    to: email,
    subject: "Your SMF Truck Scale sign-in",
    text: [
      "An account has been created (or updated) for you on the SMF Truck Scale application.",
      "",
      "Sign-in email: " + email,
      "Temporary password: " + password,
      "Sign in at: " + origin + "/login",
      "",
      "Please sign in and keep this password confidential.",
      "If you did not expect this account, contact your administrator.",
    ].join("\n"),
  };
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const actor = await identity(request);
    if (!actor.isAdmin)
      throw new HttpError("Only the administrator can manage users.", 403);
    const { revision, ...cmd } = schema.parse(JSON.parse(await request.text()));
    const doc = await loadUsers();
    const next = applyUserCommand(doc, cmd);
    await saveUsers(next, revision);
    let emailSent = false,
      emailError: string | undefined;
    if (cmd.kind === "create" || cmd.kind === "reset_password") {
      if (!(await mailerConfigured())) emailError = "SMTP is not configured.";
      else
        try {
          const origin = new URL(request.url).origin;
          await sendMail(credentialsEmail(origin, cmd.email, cmd.password));
          emailSent = true;
        } catch (mailErr) {
          emailError =
            mailErr instanceof Error ? mailErr.message : "The email could not be sent.";
        }
    }
    return Response.json(
      {
        revision: next.revision,
        users: next.users.map(publicUser),
        mailerConfigured: await mailerConfigured(),
        emailSent,
        emailError,
      },
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
