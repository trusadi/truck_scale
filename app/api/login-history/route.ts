import { apiError, HttpError, identity } from "@/lib/operations-server";
import { loadLoginHistory } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await identity(request);
    if (!actor.isAdmin)
      throw new HttpError("Only the administrator can view login activity.", 403);
    return Response.json({ events: await loadLoginHistory() }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
