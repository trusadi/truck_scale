import { cookies } from "next/headers";
import { apiError, checkOrigin } from "@/lib/operations-server";
import { SESSION_COOKIE_NAME } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    (await cookies()).delete(SESSION_COOKIE_NAME);
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
