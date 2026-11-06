import { z } from "zod";
import { apiError, checkOrigin } from "@/lib/operations-server";
import { decideByEmail, getEmailApproval } from "@/lib/email-approval";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };
export async function GET(_request: Request, { params }: Context) {
  try {
    const { token } = await params;
    return Response.json(await getEmailApproval(token), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    checkOrigin(request);
    const { token } = await params;
    const body = z.object({ reason: z.string().min(3).max(1000) }).strict().parse(await request.json());
    return Response.json(await decideByEmail(token, body.reason), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
