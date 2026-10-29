export type QueueStatus = "scheduled" | "waiting" | "called" | "held" | "sent";
export type OrderType = "PO" | "STO";
export type OrderLine = { document: string; item: string; scheduleLine: string; type: OrderType; material: string; description: string; quantity: number; unit: string };
export type QueueEvent = { time: number; description: string };
export type Truck = {
  id: string; date: string; plant: string; time: string; origin: string; originCode: string;
  carrier: string; plate: string; driver: string; lines: OrderLine[]; status: QueueStatus;
  ticket: number | null; arrivedAt: number | null; calledAt: number | null; sentAt: number | null;
  holdReason: string; events: QueueEvent[];
};
export const COMPANIES = [
  { id: "1000", name: "SMF Foods · Company 1000" },
  { id: "2000", name: "SMF Feeds · Company 2000" },
];
export const PLANTS = [
  {
    id: "PAG",
    company: "1000",
    name: "Pagbilao",
    label: "Pagbilao · Quezon",
  },
  { id: "CEB", company: "1000", name: "Cebu", label: "Cebu" },
  { id: "DAV", company: "2000", name: "Davao", label: "Davao" },
];
export const STATUS: Record<QueueStatus, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "status-scheduled" },
  waiting: { label: "Waiting", className: "status-waiting" },
  called: { label: "Called", className: "status-called" },
  held: { label: "On hold", className: "status-held" },
  sent: { label: "Sent to scale", className: "status-sent" },
};
export const timeText = (minutes: number) => String(Math.floor(minutes / 60) % 24).padStart(2, "0") + ":" + String(Math.floor(minutes) % 60).padStart(2, "0");
export const ticketText = (n: number | null) => n === null ? "—" : "Q-" + String(n).padStart(3, "0");
export const waitingMinutes = (truck: Truck, now: number) => truck.arrivedAt === null ? null : Math.max(0, Math.floor((truck.sentAt ?? now) - truck.arrivedAt));
export function nextTruck(trucks: Truck[], plant: string, date: string) {
  return trucks.filter(t => t.plant === plant && t.date === date && t.status === "waiting").sort((a, b) => (a.arrivedAt! - b.arrivedAt!) || (a.ticket! - b.ticket!))[0] ?? null;
}
export function nextTicket(trucks: Truck[], plant: string, date: string) {
  return Math.max(0, ...trucks.filter(t => t.plant === plant && t.date === date).map(t => t.ticket ?? 0)) + 1;
}
export function checkInError(trucks: Truck[], truck: Truck, plate: string, driver: string) {
  if (truck.status !== "scheduled") return "This truck has already been checked in.";
  if (!plate.trim() || !driver.trim()) return "Enter the truck plate and driver name.";
  const key = plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (key.length < 4) return "Enter a valid truck plate (at least 4 letters or numbers).";
  if (trucks.some(t => t.id !== truck.id && t.plant === truck.plant && t.date === truck.date && !["scheduled", "sent"].includes(t.status) && t.plate.toUpperCase().replace(/[^A-Z0-9]/g, "") === key)) return "This truck plate is already in the active queue at this site.";
  return null;
}
export function transitionTruck(trucks: Truck[], id: string, action: "call" | "send" | "hold" | "resume", now: number, reason = ""): Truck[] {
  const truck = trucks.find(t => t.id === id);
  if (!truck) throw new Error("Truck was not found.");
  let status: QueueStatus = truck.status;
  let description = "";
  if (action === "call") {
    if (truck.status !== "waiting") throw new Error("Only waiting trucks can be called.");
    if (trucks.some(t => t.plant === truck.plant && t.date === truck.date && t.status === "called")) throw new Error("Send or hold the currently called truck first.");
    if (nextTruck(trucks, truck.plant, truck.date)?.id !== id) throw new Error("Call the first truck in the arrival queue.");
    status = "called"; description = "Called for weighing";
  } else if (action === "send") {
    if (truck.status !== "called") throw new Error("Call the truck before sending it to the scale.");
    status = "sent"; description = "Sent to the truck scale";
  } else if (action === "hold") {
    if (!["waiting", "called"].includes(truck.status)) throw new Error("Only waiting or called trucks can be held.");
    if (!reason.trim()) throw new Error("Enter a reason for holding the truck.");
    status = "held"; description = "Placed on hold: " + reason.trim();
  } else {
    if (truck.status !== "held") throw new Error("This truck is not on hold.");
    status = "waiting"; description = "Returned to queue with original arrival priority";
  }
  return trucks.map(t => t.id === id ? { ...t, status, calledAt: action === "call" ? now : t.calledAt, sentAt: action === "send" ? now : t.sentAt, holdReason: action === "hold" ? reason.trim() : action === "resume" ? "" : t.holdReason, events: [...t.events, { time: now, description }] } : t);
}

