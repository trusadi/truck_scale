import { cookies } from "next/headers";
import { z } from "zod";
import { checkOrigin, HttpError } from "@/lib/operations-server";
import { createSessionCookie, verifyLogin } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    email: z.string().trim().toLowerCase().min(1).max(200),
    password: z.string().min(1).max(200),
  })
  .strict();

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = schema.parse(JSON.parse(await request.text()));
    const user = await verifyLogin(body.email, body.password);
    if (!user) throw new HttpError("Incorrect email or password.", 401);
    const cookie = await createSessionCookie({
      email: user.email,
      name: user.name,
      role: user.role,
      plant: user.plant,
      direction: user.direction,
    });
    (await cookies()).set(cookie.name, cookie.value, cookie.options);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError)
      return Response.json({ error: "Enter an email and password." }, { status: 400 });
    const status = e instanceof HttpError ? e.status : 503;
    const error = e instanceof HttpError ? e.message : "Sign-in is unavailable. Please try again.";
    return Response.json({ error }, { status });
  }
}
