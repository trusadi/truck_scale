import { loadState } from "@/lib/operations-server";
import { currentProcessStep, processFor, ticket, type Visit } from "@/lib/operations";
import { COMPANIES, PLANTS } from "@/lib/truck-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusText(state: Awaited<ReturnType<typeof loadState>>, visit: Visit) {
  const progress = `${Math.min(visit.activeTicket + 1, visit.productTickets.length)} of ${visit.productTickets.length}`;
  const process = processFor(state, visit);
  const configured = process.steps.find(
    (step) => step.id === currentProcessStep(visit),
  )?.label;
  switch (visit.stage) {
    case "scheduled": return "Scheduled";
    case "waiting": return "Waiting in queue";
    case "called": return "Proceed to scale";
    case "held": return "On hold - contact gate";
    case "first_weigh": return configured ?? "Initial weighing";
    case "handling":
      return `${configured ?? (visit.direction === "inbound" ? "Unloading" : "Loading")} - product ${progress}`;
    case "second_weigh": return `Return to scale - product ${progress}`;
    case "approval": return configured ?? "Awaiting supervisor approval";
    case "cleared": return "Cleared - proceed to exit";
    case "rejected": return "Rejected - contact gate";
    case "completed": return "Completed";
  }
}

export async function GET() {
  const state = await loadState();
  return Response.json(
    {
      revision: state.revision,
      sampleDate: state.sampleDate,
      companies: COMPANIES,
      plants: PLANTS,
      updatedAt: new Date().toISOString(),
      visits: state.visits.map((visit) => ({
        id: visit.id,
        company: visit.company,
        plant: visit.plant,
        date: visit.date,
        scheduledTime: visit.time,
        direction: visit.direction,
        plate: visit.plate || "To be assigned",
        queueTicket: ticket(visit),
        stage: visit.stage,
        status: statusText(state, visit),
        productProgress: {
          completed: visit.productTickets.filter((item) => item.result).length,
          total: visit.productTickets.length,
          current: Math.min(visit.activeTicket + 1, visit.productTickets.length),
        },
        updatedAt: visit.events.at(-1)?.at ?? state.createdAt,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
