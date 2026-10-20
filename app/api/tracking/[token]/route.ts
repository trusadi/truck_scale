import { driverView } from "@/lib/operations";
import { loadState } from "@/lib/operations-server";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const headers = {
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  };
  if (!/^[a-f0-9]{48}$/.test(token))
    return Response.json(
      {
        error:
          "This tracking pass is invalid or expired. Ask the gate operator for a new pass.",
      },
      { status: 404, headers },
    );
  try {
    const result = driverView(await loadState(false), token);
    return result
      ? Response.json(result, { headers })
      : Response.json(
          {
            error:
              "This tracking pass is invalid or expired. Ask the gate operator for a new pass.",
          },
          { status: 404, headers },
        );
  } catch {
    return Response.json(
      { error: "Tracking is temporarily unavailable. Please try again." },
      { status: 503, headers },
    );
  }
}
