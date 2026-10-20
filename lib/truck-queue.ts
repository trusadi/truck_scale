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
export const DEMO_START = 635;
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

// Fictional dispatch appointments referencing sample ERP schedule lines.
// Truck assignments are dispatch data, not assumed to exist on an SAP PO.
// A visit supports multiple line references; a PO can span multiple truck visits.
export function createDemoTrucks(date: string): Truck[] {
  const rows: [string, string, string, string, string, string, OrderType, string, string, number, QueueStatus, number | null, number | null][] = [
    ["PAG", "07:00", "Pacific Grain Trading", "VC-10021", "NBA 2481", "Ramon Dela Cruz", "PO", "4500012840", "Yellow corn", 24000, "sent", 1, 412],
    ["PAG", "08:00", "Southern Agri Supply", "VC-10038", "NCK 7153", "Joel Mendoza", "PO", "4500012846", "Soybean meal", 18000, "sent", 2, 474],
    ["PAG", "09:00", "SMF · Batangas feed mill", "PL-BTG", "NDS 8032", "Mario Santos", "STO", "5500000731", "Feed premix", 12000, "called", 3, 572],
    ["PAG", "09:30", "Harvest Link Commodities", "VC-10054", "NEX 4296", "Allan Garcia", "PO", "4500012861", "Yellow corn", 25000, "waiting", 4, 585],
    ["PAG", "10:00", "Pacific Grain Trading", "VC-10021", "NGH 5824", "Edwin Reyes", "PO", "4500012872", "Soybean meal", 20000, "waiting", 5, 600],
    ["PAG", "10:00", "SMF · Calamba warehouse", "PL-CLM", "NBF 3067", "Rene Castillo", "STO", "5500000748", "Packaging sacks", 3000, "held", 6, 605],
    ["PAG", "10:30", "Southern Agri Supply", "VC-10038", "NJS 6182", "Danilo Ramos", "PO", "4500012884", "Wheat bran", 16000, "waiting", 7, 621],
    ["PAG", "11:00", "Harvest Link Commodities", "VC-10054", "NKA 9025", "Francis Lim", "PO", "4500012891", "Yellow corn", 25000, "scheduled", null, null],
    ["PAG", "11:30", "SMF · Batangas feed mill", "PL-BTG", "", "", "STO", "5500000756", "Feed premix", 10000, "scheduled", null, null],
    ["PAG", "13:00", "Island Nutrition Supply", "VC-10062", "NLG 1549", "Roberto Tan", "PO", "4500012905", "Feed supplements", 8000, "scheduled", null, null],
    ["PAG", "14:00", "Pacific Grain Trading", "VC-10021", "", "", "PO", "4500012912", "Soybean meal", 22000, "scheduled", null, null],
    ["PAG", "15:00", "SMF · Calamba warehouse", "PL-CLM", "", "", "STO", "5500000763", "Packaging sacks", 5000, "scheduled", null, null],
    ["CEB", "09:30", "Visayas Grain Trading", "VC-20016", "GAC 4072", "Carlo Flores", "PO", "4500012950", "Yellow corn", 24000, "waiting", 1, 596],
    ["CEB", "11:00", "SMF · Mandaue warehouse", "PL-MAN", "", "", "STO", "5500000780", "Feed premix", 10000, "scheduled", null, null],
    ["DAV", "09:00", "Mindanao Agri Supply", "VC-30024", "LAH 7836", "Manuel Cruz", "PO", "4500012980", "Wheat bran", 18000, "waiting", 1, 577],
    ["DAV", "12:00", "SMF · General Santos", "PL-GEN", "", "", "STO", "5500000791", "Feed premix", 12000, "scheduled", null, null],
  ];
  return rows.map((r, i) => {
    const [plant, time, origin, originCode, plate, driver, type, document, description, quantity, status, ticket, arrivedAt] = r;
    const events: QueueEvent[] = [{ time: 360, description: "Delivery appointment loaded from sample schedule" }];
    if (arrivedAt !== null) events.push({ time: arrivedAt, description: "Arrival recorded · " + ticketText(ticket) + " assigned" });
    if (status === "sent") events.push({ time: arrivedAt! + 18, description: "Called for weighing" }, { time: arrivedAt! + 25, description: "Sent to the truck scale" });
    if (status === "called") events.push({ time: 629, description: "Called for weighing" });
    if (status === "held") events.push({ time: 610, description: "Placed on hold: Delivery document under verification" });
    const materials: Record<string, string> = { "Yellow corn": "RM-100101", "Soybean meal": "RM-100205", "Feed premix": "RM-100310", "Packaging sacks": "PK-200104", "Wheat bran": "RM-100408", "Feed supplements": "RM-100512" };
    const lines: OrderLine[] = [
      {
        type,
        document,
        item: "00010",
        scheduleLine: "0001",
        material: materials[description],
        description,
        quantity: i === 0 ? 18000 : quantity,
        unit: description === "Packaging sacks" ? "EA" : "KG",
      },
    ];
    // The first inbound appointment demonstrates a mixed-product truck. Each
    // order line becomes an independent product weighing ticket.
    if (i === 0)
      lines.push({
        type: "PO",
        document,
        item: "00020",
        scheduleLine: "0001",
        material: materials["Soybean meal"],
        description: "Soybean meal",
        quantity: 6000,
        unit: "KG",
      });
    return { id: "VISIT-" + String(i + 1).padStart(3, "0"), date, plant, time, origin, originCode, plate, driver, carrier: type === "STO" ? "SMF contracted haulier" : "Supplier-arranged transport", lines, status, ticket, arrivedAt, calledAt: status === "called" ? 629 : status === "sent" ? arrivedAt! + 18 : null, sentAt: status === "sent" ? arrivedAt! + 25 : null, holdReason: status === "held" ? "Delivery document under verification" : "", events };
  });
}
