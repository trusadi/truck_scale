import { COMPANIES, createDemoTrucks, PLANTS } from "./truck-queue";

export type Direction = "inbound" | "outbound";
export type AccessDirection = Direction | "return" | "both";
export type Stage =
  | "scheduled"
  | "waiting"
  | "called"
  | "held"
  | "first_weigh"
  | "handling"
  | "second_weigh"
  | "approval"
  | "cleared"
  | "rejected"
  | "completed";
export type Rule = {
  unit: "percent" | "kg";
  shortage: number;
  excess: number;
  version: number;
  appliedLevel?: ToleranceLevel | "mixed";
  appliedLabel?: string;
};
export type ToleranceLevel = "company" | "plant" | "material";
export type ToleranceSelector = {
  level: ToleranceLevel;
  company: string;
  plant?: string;
  material?: string;
  direction: Direction;
};
export type Reading = {
  kg: number;
  source: "manual" | "simulator" | "scale";
  at: string;
  by: string;
  device: string;
  reason: string;
  ticketId?: string;
  label?: string;
};
export type Result = {
  gross: number;
  tare: number;
  net: number;
  expected: number;
  variance: number;
  percent: number;
  within: boolean;
  min: number;
  max: number;
  rule: Rule;
  measuredAt: string;
};
export type Event = { at: string; text: string; by: string };
export type VisitLine = {
  document: string;
  type: "PO" | "STO" | "DO" | "RD";
  item: string;
  material: string;
  description: string;
  quantity: number;
  unit: string;
};
export type ProductTicket = {
  id: string;
  sequence: number;
  line: VisitLine;
  expectedKg: number;
  result: Result | null;
};
export type ProcessStepId =
  | "queue"
  | "initial_weigh"
  | "product_handling"
  | "product_weighing"
  | "weight_check"
  | "approval"
  | "gate_exit";
export type ProcessStep = {
  id: ProcessStepId;
  label: string;
  enabled: boolean;
  required: boolean;
};
export type ProcessTemplate = {
  company: string;
  direction: Direction;
  version: number;
  steps: ProcessStep[];
};
export type Visit = {
  id: string;
  date: string;
  company: string;
  plant: string;
  time: string;
  direction: Direction;
  origin: string;
  plate: string;
  driver: string;
  carrier: string;
  lines: VisitLine[];
  expectedKg: number | null;
  stage: Stage;
  ticket: number | null;
  arrivedAt: string | null;
  holdReason: string;
  heldFrom?: Stage;
  readings: Reading[];
  productTickets: ProductTicket[];
  activeTicket: number;
  result: Result | null;
  decision: {
    outcome: "approved" | "rejected";
    reason: string;
    by: string;
    at: string;
  } | null;
  token: string;
  tokenExpires: string;
  events: Event[];
};
export type Supervisor = {
  email: string;
  name: string;
  plant: string;
  direction: Direction | "both";
};
export type Notification = {
  id: string;
  visitId: string;
  to: string[];
  subject: string;
  body: string;
  status:
    | "not_configured"
    | "pending"
    | "sending"
    | "sent"
    | "failed"
    | "unknown"
    | "no_recipients";
  createdAt: string;
  sentAt?: string;
  detail: string;
};
export type Operations = {
  schemaVersion: number;
  revision: number;
  createdAt: string;
  sampleDate: string;
  visits: Visit[];
  rules: Record<string, Rule>;
  processes: Record<string, ProcessTemplate>;
  companyCodes: { id: string; name: string }[];
  sites: { id: string; company: string; label: string }[];
  materialCatalog: { code: string; description: string }[];
  supervisors: Supervisor[];
  emailEnabled: boolean;
  notifications: Notification[];
  audit: Event[];
};
export type Role = "admin" | "supervisor" | "operator";
export type Actor = {
  email: string;
  name: string;
  isAdmin: boolean;
  role: Role;
  plant: "ALL" | "PAG" | "CEB" | "DAV";
  direction: AccessDirection;
};
export const STAGES: Record<Stage, string> = {
  scheduled: "Scheduled",
  waiting: "Waiting",
  called: "Called",
  held: "On hold",
  first_weigh: "First weighing",
  handling: "Loading / unloading",
  second_weigh: "Product ticket weighing",
  approval: "Awaiting approval",
  cleared: "Cleared",
  rejected: "Rejected",
  completed: "Completed",
};
export const flow: Stage[] = [
  "scheduled",
  "waiting",
  "first_weigh",
  "handling",
  "second_weigh",
  "cleared",
  "completed",
];
export const kg = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(n);
export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
export const ticket = (v: Visit) =>
  v.ticket == null
    ? "Not checked in"
    : (v.direction === "inbound" ? "I-" : "O-") +
      String(v.ticket).padStart(3, "0");
export const productTicket = (v: Visit, item: ProductTicket) =>
  ticket(v) + "-" + String(item.sequence).padStart(2, "0");
export const companyForPlant = (plant: string) =>
  PLANTS.find((item) => item.id === plant)?.company ?? COMPANIES[0].id;
export const expectedWeightForLine = (line: VisitLine) =>
  line.unit === "KG" ? line.quantity : line.quantity * 0.15;
export const processKey = (company: string, direction: Direction) =>
  company + ":" + direction;
export function toleranceRuleKey(selector: ToleranceSelector) {
  if (selector.level === "company")
    return ["company", selector.company, selector.direction].join(":");
  if (selector.level === "plant")
    return [
      "plant",
      selector.company,
      selector.plant,
      selector.direction,
    ].join(":");
  return [
    "material",
    selector.company,
    selector.plant,
    selector.material,
    selector.direction,
  ].join(":");
}
export const ruleKey = (v: Pick<Visit, "company" | "plant" | "direction">) =>
  toleranceRuleKey({
    level: "plant",
    company: v.company,
    plant: v.plant,
    direction: v.direction,
  });
export function resolveTolerance(
  state: Pick<Operations, "rules">,
  visit: Pick<Visit, "company" | "plant" | "direction">,
  material: string,
) {
  const selectors: ToleranceSelector[] = [
    {
      level: "material",
      company: visit.company,
      plant: visit.plant,
      material,
      direction: visit.direction,
    },
    {
      level: "plant",
      company: visit.company,
      plant: visit.plant,
      direction: visit.direction,
    },
    {
      level: "company",
      company: visit.company,
      direction: visit.direction,
    },
  ];
  for (const selector of selectors) {
    const configured = state.rules[toleranceRuleKey(selector)];
    if (configured)
      return {
        ...configured,
        appliedLevel: selector.level,
        appliedLabel:
          selector.level === "material"
            ? material + " · " + visit.plant
            : selector.level === "plant"
              ? visit.plant
              : visit.company,
      } satisfies Rule;
  }
  return {
    unit: "percent",
    shortage: 1,
    excess: 1,
    version: 1,
    appliedLevel: "company",
    appliedLabel: visit.company,
  } satisfies Rule;
}
export function standardProcess(
  company: string,
  direction: Direction,
): ProcessTemplate {
  return {
    company,
    direction,
    version: 1,
    steps: [
      { id: "queue", label: "Gate check-in & queue", enabled: true, required: true },
      {
        id: "initial_weigh",
        label: direction === "inbound" ? "Loaded truck weighing" : "Empty truck weighing",
        enabled: true,
        required: true,
      },
      {
        id: "product_handling",
        label: direction === "inbound" ? "Unload next product" : "Load next product",
        enabled: true,
        required: false,
      },
      {
        id: "product_weighing",
        label: "Product weighing tickets",
        enabled: true,
        required: true,
      },
      { id: "weight_check", label: "Weight check & clearance", enabled: true, required: true },
      { id: "approval", label: "Variance approval", enabled: true, required: false },
      { id: "gate_exit", label: "Gate exit", enabled: true, required: true },
    ],
  };
}
export function processFor(
  state: Pick<Operations, "processes">,
  visit: Pick<Visit, "company" | "direction">,
) {
  return (
    state.processes[processKey(visit.company, visit.direction)] ??
    standardProcess(visit.company, visit.direction)
  );
}
export function currentProcessStep(v: Pick<Visit, "stage">): ProcessStepId {
  if (["scheduled", "waiting", "called", "held"].includes(v.stage))
    return "queue";
  if (v.stage === "first_weigh") return "initial_weigh";
  if (v.stage === "handling") return "product_handling";
  if (v.stage === "second_weigh") return "product_weighing";
  if (v.stage === "approval" || v.stage === "rejected") return "approval";
  if (v.stage === "cleared" || v.stage === "completed") return "gate_exit";
  return "weight_check";
}
export const matchSupervisor = (
  s: Supervisor,
  v: Pick<Visit, "plant" | "direction">,
) =>
  (s.plant === "ALL" || s.plant === v.plant) &&
  (s.direction === "both" || s.direction === v.direction);
export const matchScope = (
  actor: Pick<Actor, "plant" | "direction">,
  v: Pick<Visit, "plant" | "direction" | "lines">,
) =>
  (actor.plant === "ALL" || actor.plant === v.plant) &&
  (actor.direction === "both" ||
    actor.direction === v.direction ||
    (actor.direction === "return" &&
      v.direction === "inbound" &&
      v.lines.some((line) => line.type === "RD")));
export const canApprove = (actor: Actor, v: Pick<Visit, "plant" | "direction" | "lines">) =>
  actor.isAdmin || (actor.role === "supervisor" && matchScope(actor, v));
export const canOperate = (actor: Actor, v: Pick<Visit, "plant" | "direction" | "lines">) =>
  actor.isAdmin || matchScope(actor, v);
export function nextWaiting(
  state: Operations,
  plant: string,
  date: string,
  direction: Direction,
) {
  return state.visits
    .filter(
      (v) =>
        v.plant === plant &&
        v.date === date &&
        v.direction === direction &&
        v.stage === "waiting",
    )
    .sort(
      (a, b) =>
        (a.arrivedAt ?? "").localeCompare(b.arrivedAt ?? "") ||
        a.ticket! - b.ticket!,
    )[0];
}
export function compareWeight(
  gross: number,
  tare: number,
  expected: number,
  rule: Rule,
  at: string,
): Result {
  if (
    ![gross, tare, expected].every((n) => Number.isFinite(n) && n > 0) ||
    gross <= tare
  )
    throw new Error(
      "Loaded weight must exceed empty weight; all weights and expected net weight must be positive.",
    );
  if (
    ![rule.shortage, rule.excess].every((n) => Number.isFinite(n) && n >= 0) ||
    !["kg", "percent"].includes(rule.unit)
  )
    throw new Error("Invalid tolerance rule.");
  const round = (n: number) => Math.round(n * 100) / 100;
  const net = round(gross - tare),
    variance = round(net - expected);
  const shortage =
    rule.unit === "kg" ? rule.shortage : (expected * rule.shortage) / 100;
  const excess =
    rule.unit === "kg" ? rule.excess : (expected * rule.excess) / 100;
  return {
    gross,
    tare,
    net,
    expected,
    variance,
    percent: (variance / expected) * 100,
    within: variance >= -shortage - 0.000001 && variance <= excess + 0.000001,
    min: round(expected - shortage),
    max: round(expected + excess),
    rule: { ...rule },
    measuredAt: at,
  };
}
export function newToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export function createProductTickets(lines: VisitLine[]): ProductTicket[] {
  return lines.map((line, index) => ({
    id: "PRODUCT-" + String(index + 1).padStart(2, "0"),
    sequence: index + 1,
    line: { ...line },
    expectedKg: expectedWeightForLine(line),
    result: null,
  }));
}
function aggregateTicketResults(visit: Visit, at: string): Result {
  const results = visit.productTickets.map((item) => item.result);
  if (!results.length || results.some((item) => !item))
    throw new Error("Every product weighing ticket must be completed first.");
  const complete = results as Result[];
  const round = (n: number) => Math.round(n * 100) / 100;
  const expected = round(complete.reduce((sum, item) => sum + item.expected, 0));
  const net = round(complete.reduce((sum, item) => sum + item.net, 0));
  const variance = round(net - expected);
  const versions = complete.map((item) => item.rule.version);
  return {
    gross:
      visit.direction === "inbound"
        ? visit.readings[0].kg
        : visit.readings.at(-1)!.kg,
    tare:
      visit.direction === "inbound"
        ? visit.readings.at(-1)!.kg
        : visit.readings[0].kg,
    net,
    expected,
    variance,
    percent: (variance / expected) * 100,
    within: complete.every((item) => item.within),
    min: round(complete.reduce((sum, item) => sum + item.min, 0)),
    max: round(complete.reduce((sum, item) => sum + item.max, 0)),
    rule: {
      unit: "kg",
      shortage: round(
        complete.reduce((sum, item) => sum + item.expected - item.min, 0),
      ),
      excess: round(
        complete.reduce((sum, item) => sum + item.max - item.expected, 0),
      ),
      version: Math.max(...versions),
      appliedLevel: complete.length > 1 ? "mixed" : complete[0].rule.appliedLevel,
      appliedLabel:
        complete.length > 1
          ? "Per-product hierarchy"
          : complete[0].rule.appliedLabel,
    },
    measuredAt: at,
  };
}
function createSampleReturnVisit(date: string): Visit {
  const line: VisitLine = {
    type: "RD",
    document: "RD-6000010050",
    item: "000010",
    material: "FG-300101",
    description: "Returned finished goods",
    quantity: 8000,
    unit: "KG",
  };
  return {
    id: "RETURN-001",
    date,
    company: companyForPlant("PAG"),
    plant: "PAG",
    time: "12:30",
    direction: "inbound",
    origin: "SMF - Pagbilao returns",
    plate: "RDN 4821",
    driver: "Marco Santos",
    carrier: "SMF contracted haulier",
    lines: [line],
    expectedKg: expectedWeightForLine(line),
    stage: "scheduled",
    ticket: null,
    arrivedAt: null,
    holdReason: "",
    readings: [],
    productTickets: createProductTickets([line]),
    activeTicket: 0,
    result: null,
    decision: null,
    token: newToken(),
    tokenExpires: new Date(Date.now() + 7 * 86400000).toISOString(),
    events: [{ at: new Date().toISOString(), text: "Return delivery scheduled - sample data", by: "Sample data" }],
  };
}

export function createOperations(date: string, owner: string): Operations {
  const now = new Date().toISOString();
  // Keep fictional arrivals in the past so new real-time check-ins join the end of the queue.
  const timestamp = (minutes: number) =>
    new Date(new Date(now).getTime() + (minutes - 635) * 60000).toISOString();
  const visits: Visit[] = createDemoTrucks(date).map((v) => ({
    id: v.id,
    date,
    company: companyForPlant(v.plant),
    plant: v.plant,
    time: v.time,
    direction: "inbound",
    origin: v.origin,
    plate: v.plate,
    driver: v.driver,
    carrier: v.carrier,
    lines: v.lines,
    expectedKg: v.lines.reduce(
      (sum, line) => sum + expectedWeightForLine(line),
      0,
    ),
    stage:
      v.status === "sent"
        ? "first_weigh"
        : v.status === "held"
          ? "held"
          : v.status,
    ticket: v.ticket,
    arrivedAt: v.arrivedAt == null ? null : timestamp(v.arrivedAt),
    holdReason: v.holdReason,
    heldFrom: v.status === "held" ? "waiting" : undefined,
    readings: [],
    productTickets: createProductTickets(v.lines),
    activeTicket: 0,
    result: null,
    decision: null,
    token: newToken(),
    tokenExpires: new Date(Date.now() + 7 * 86400000).toISOString(),
    events: v.events.map((e) => ({
      at: timestamp(e.time),
      text: e.description
        .replace(
          "Delivery appointment loaded from sample schedule",
          "Scheduled delivery loaded · sample data",
        )
        .replaceAll("Q-", "I-"),
      by: "Sample data",
    })),
  }));
  visits.push(createSampleReturnVisit(date));
  const outboundRows: [
    string,
    string,
    string,
    string,
    string,
    number,
    Stage,
  ][] = [
    [
      "NPL 6201",
      "Refrigerated chicken",
      "SMF · Metro Manila distribution",
      "8000015420",
      "08:00",
      12000,
      "second_weigh",
    ],
    [
      "NRS 1845",
      "Animal feeds",
      "SMF · Southern Luzon depot",
      "8000015426",
      "09:00",
      18000,
      "approval",
    ],
    [
      "NTA 7723",
      "Animal feeds",
      "SMF · Batangas depot",
      "8000015431",
      "10:00",
      24000,
      "waiting",
    ],
    [
      "",
      "Refrigerated chicken",
      "SMF · Laguna distribution",
      "8000015442",
      "11:00",
      16000,
      "scheduled",
    ],
  ];
  outboundRows.forEach((r, i) => {
    const lines: VisitLine[] = [
      {
        type: "DO",
        document: r[3],
        item: "000010",
        material: "FG-30010" + i,
        description: r[1],
        quantity: i === 0 ? 7000 : r[5],
        unit: "KG",
      },
    ];
    if (i === 0)
      lines.push({
        type: "DO",
        document: r[3],
        item: "000020",
        material: "FG-300205",
        description: "Animal feeds",
        quantity: 5000,
        unit: "KG",
      });
    visits.push({
      id: "OUT-" + String(i + 1).padStart(3, "0"),
      date,
      company: companyForPlant("PAG"),
      plant: "PAG",
      direction: "outbound",
      time: r[4],
      origin: r[2],
      plate: r[0],
      driver: ["Antonio Cruz", "Benjie Flores", "Carlos Diaz", ""][i],
      carrier: "SMF contracted haulier",
      lines,
      expectedKg: lines.reduce(
        (sum, line) => sum + expectedWeightForLine(line),
        0,
      ),
      stage: r[6],
      ticket: i < 3 ? i + 1 : null,
      arrivedAt: i < 3 ? timestamp(460 + i * 35) : null,
      holdReason: "",
      readings: [],
      productTickets: createProductTickets(lines),
      activeTicket: 0,
      result: null,
      decision: null,
      token: newToken(),
      tokenExpires: new Date(Date.now() + 7 * 86400000).toISOString(),
      events: [
        {
          at: timestamp(360),
          text: "Outbound delivery scheduled · sample data",
          by: "Sample data",
        },
      ],
    });
  });
  const rules: Record<string, Rule> = {};
  for (const company of COMPANIES)
    for (const direction of ["inbound", "outbound"])
      rules[
        toleranceRuleKey({
          level: "company",
          company: company.id,
          direction: direction as Direction,
        })
      ] = {
        unit: "percent",
        shortage: 1,
        excess: 1,
        version: 1,
      };
  // One plant and one material override make the precedence visible in the demo.
  rules[
    toleranceRuleKey({
      level: "plant",
      company: "1000",
      plant: "PAG",
      direction: "inbound",
    })
  ] = { unit: "percent", shortage: 1, excess: 1, version: 1 };
  rules[
    toleranceRuleKey({
      level: "material",
      company: "1000",
      plant: "PAG",
      material: "RM-100205",
      direction: "inbound",
    })
  ] = { unit: "percent", shortage: 0.75, excess: 0.75, version: 1 };
  const processes: Record<string, ProcessTemplate> = {};
  for (const company of COMPANIES)
    for (const direction of ["inbound", "outbound"] as Direction[])
      processes[processKey(company.id, direction)] = standardProcess(
        company.id,
        direction,
      );
  const state: Operations = {
    schemaVersion: 4,
    revision: 0,
    createdAt: now,
    sampleDate: date,
    visits,
    rules,
    processes,
    companyCodes: COMPANIES.map((c) => ({ ...c })),
    sites: PLANTS.map((p) => ({ id: p.id, company: p.company, label: p.label })),
    materialCatalog: [...new Map(visits.flatMap((visit) => visit.lines).map((line) => [line.material, { code: line.material, description: line.description }])).values()],
    supervisors: [
      {
        email: owner,
        name: "Demo approval recipient",
        plant: "ALL",
        direction: "both",
      },
    ],
    emailEnabled: false,
    notifications: [],
    audit: [],
  };
  // Seed one inbound and one outbound variance for immediate supervisor review.
  for (const [id, tare, net] of [
    ["VISIT-002", 10420, 17400],
    ["OUT-002", 9200, 18450],
  ] as [string, number, number][]) {
    const v = visits.find((v) => v.id === id)!;
    v.readings =
      v.direction === "inbound"
        ? [
            {
              kg: tare + net,
              source: "simulator",
              at: timestamp(500),
              by: "Sample data",
              device: "Demo scale",
              reason: "Seeded sample",
              label: "Initial loaded truck weight",
            },
            {
              kg: tare,
              source: "simulator",
              at: timestamp(620),
              by: "Sample data",
              device: "Demo scale",
              reason: "Seeded sample",
              ticketId: v.productTickets[0].id,
              label: "Product 1 · " + v.productTickets[0].line.description,
            },
          ]
        : [
            {
              kg: tare,
              source: "simulator",
              at: timestamp(505),
              by: "Sample data",
              device: "Demo scale",
              reason: "Seeded sample",
              label: "Initial empty truck weight",
            },
            {
              kg: tare + net,
              source: "simulator",
              at: timestamp(625),
              by: "Sample data",
              device: "Demo scale",
              reason: "Seeded sample",
              ticketId: v.productTickets[0].id,
              label: "Product 1 · " + v.productTickets[0].line.description,
            },
          ];
    v.productTickets[0].result = compareWeight(
      tare + net,
      tare,
      v.productTickets[0].expectedKg,
      resolveTolerance(state, v, v.productTickets[0].line.material),
      timestamp(625),
    );
    v.result = aggregateTicketResults(v, timestamp(625));
    v.stage = "approval";
    v.events.push({
      at: timestamp(625),
      text: "Product ticket weight outside tolerance · supervisor review required",
      by: "Sample data",
    });
    state.notifications.push(notificationFor(state, v, timestamp(625), false));
  }
  const second = visits.find((v) => v.id === "OUT-001")!;
  second.readings = [
    {
      kg: 9400,
      source: "simulator",
      at: timestamp(485),
      by: "Sample data",
      device: "Demo scale",
      reason: "Seeded sample",
      label: "Initial empty truck weight",
    },
  ];
  second.events.push(
    {
      at: timestamp(485),
      text: "Empty truck weighed: 9,400 kg",
      by: "Sample data",
    },
    {
      at: timestamp(600),
      text: "Loading complete · return to scale",
      by: "Sample data",
    },
  );
  return state;
}
export function normalizeOperations(input: Operations): Operations {
  const state = structuredClone(input);
  const previousSchemaVersion = state.schemaVersion ?? 0;
  state.schemaVersion = 4;
  if (previousSchemaVersion < 3 && !state.visits.some((visit) => visit.id === "RETURN-001"))
    state.visits.push(createSampleReturnVisit(state.sampleDate));
  state.processes ??= {};
  state.rules ??= {};
  (state.companyCodes as typeof state.companyCodes | undefined) ??= COMPANIES.map((c) => ({ ...c }));
  (state.sites as typeof state.sites | undefined) ??= PLANTS.map((p) => ({ id: p.id, company: p.company, label: p.label }));
  const catalog = new Map((state.materialCatalog ?? []).map((item) => [item.code.trim().toUpperCase(), item]));
  for (const line of state.visits.flatMap((visit) => visit.lines)) {
    const code = line.material.trim().toUpperCase();
    if (code && line.description.trim() && !catalog.has(code))
      catalog.set(code, { code, description: line.description.trim() });
  }
  state.materialCatalog = [...catalog.values()];
  for (const company of COMPANIES) {
    for (const direction of ["inbound", "outbound"] as Direction[]) {
      const companyKey = toleranceRuleKey({
        level: "company",
        company: company.id,
        direction,
      });
      state.rules[companyKey] ??= {
        unit: "percent",
        shortage: 1,
        excess: 1,
        version: 1,
      };
      const pKey = processKey(company.id, direction);
      state.processes[pKey] ??= standardProcess(company.id, direction);
    }
  }
  for (const plant of PLANTS) {
    for (const direction of ["inbound", "outbound"] as Direction[]) {
      const oldKey = plant.id + ":" + direction;
      if (state.rules[oldKey]) {
        const newKey = toleranceRuleKey({
          level: "plant",
          company: plant.company,
          plant: plant.id,
          direction,
        });
        state.rules[newKey] ??= state.rules[oldKey];
      }
    }
  }
  for (const visit of state.visits) {
    visit.company ||= companyForPlant(visit.plant);
    visit.productTickets ??= createProductTickets(visit.lines);
    visit.activeTicket ??= Math.min(
      Math.max(0, visit.readings.length - 1),
      Math.max(0, visit.productTickets.length - 1),
    );
    if (
      visit.result &&
      visit.productTickets.length === 1 &&
      !visit.productTickets[0].result
    )
      visit.productTickets[0].result = visit.result;
  }
  return state;
}
export function notificationFor(
  state: Operations,
  visit: Visit,
  now: string,
  emailConfigured: boolean,
): Notification {
  const to = [
    ...new Set(
      state.supervisors
        .filter((s) => matchSupervisor(s, visit))
        .map((s) => s.email),
    ),
  ];
  const r = visit.result!;
  const ticketDetails = visit.productTickets.map((item) => {
    const result = item.result!;
    return (
      "Ticket " +
      item.sequence +
      " · " +
      item.line.material +
      " " +
      item.line.description +
      ": expected " +
      kg(result.expected) +
      " kg, measured " +
      kg(result.net) +
      " kg, variance " +
      kg(result.variance) +
      " kg · " +
      (result.within ? "within tolerance" : "EXCEPTION") +
      " · " +
      (result.rule.appliedLevel ?? "company") +
      " rule v" +
      result.rule.version
    );
  });
  return {
    id: crypto.randomUUID(),
    visitId: visit.id,
    to,
    subject:
      "SMF weight variance approval · " +
      visit.plate +
      " · " +
      visit.lines[0].document,
    body: [
      "A " + visit.direction + " delivery requires your decision.",
      "Site: " + visit.plant,
      "Truck: " + visit.plate + " / " + ticket(visit),
      "Reference: " +
        visit.lines.map((l) => l.type + " " + l.document).join(", "),
      "Expected net: " + kg(r.expected) + " kg",
      "Measured net: " + kg(r.net) + " kg",
      "Variance: " + kg(r.variance) + " kg (" + r.percent.toFixed(2) + "%)",
      "Allowed net range: " + kg(r.min) + " to " + kg(r.max) + " kg",
      "Product weighing tickets:",
      ...ticketDetails,
      "Open the public demo to approve or reject and record a reason.",
      "Sample ERP data / prototype workflow. No email has been sent.",
    ].join("\n"),
    status: !to.length
      ? "no_recipients"
      : !emailConfigured || !state.emailEnabled
        ? "not_configured"
        : "pending",
    createdAt: now,
    detail: !to.length
      ? "No supervisor is configured for this site and direction."
      : !emailConfigured || !state.emailEnabled
        ? "Preview only. Configure SMTP and enable email sending in Settings to actually notify recipients."
        : "Ready to notify authorized supervisors.",
  };
}
export type Command = {
  kind: string;
  id?: string;
  plate?: string;
  driver?: string;
  carrier?: string;
  reason?: string;
  reading?: Reading;
  rule?: Rule;
  level?: ToleranceLevel;
  company?: string;
  material?: string;
  materialCode?: string;
  materialDescription?: string;
  process?: ProcessTemplate;
  plant?: string;
  direction?: Direction;
  emailEnabled?: boolean;
  email?: string;
  name?: string;
  recipientPlant?: string;
  recipientDirection?: Direction | "both";
  companyId?: string;
  companyName?: string;
  siteId?: string;
  siteLabel?: string;
  siteCompany?: string;
};
export function applyCommand(
  state: Operations,
  cmd: Command,
  actor: Actor,
  now: string,
  emailConfigured = false,
): Operations {
  const s: Operations = structuredClone(state);
  if (cmd.kind === "settings") {
    if (!actor.isAdmin)
      throw new Error("Only the prototype administrator can change settings.");
    const level: ToleranceLevel =
      cmd.level ?? (cmd.material ? "material" : cmd.plant ? "plant" : "company");
    const company = cmd.company ?? companyForPlant(cmd.plant ?? "");
    if (
      !s.companyCodes.some((item) => item.id === company) ||
      !["company", "plant", "material"].includes(level) ||
      (level !== "company" &&
        !s.sites.some(
          (item) => item.id === cmd.plant && item.company === company,
        )) ||
      (level === "material" &&
        (!cmd.material?.trim() || cmd.material.trim().length > 80)) ||
      !["inbound", "outbound"].includes(cmd.direction ?? "") ||
      !cmd.rule
    )
      throw new Error(
        "Select a valid company, tolerance level, plant, material and direction.",
      );
    const r = cmd.rule;
    if (
      !Number.isFinite(r.shortage) ||
      !Number.isFinite(r.excess) ||
      r.shortage < 0 ||
      r.excess < 0 ||
      (r.unit === "percent" && (r.shortage > 100 || r.excess > 100)) ||
      !["percent", "kg"].includes(r.unit)
    )
      throw new Error(
        "Enter valid, non-negative tolerance limits (percent limits cannot exceed 100).",
      );
    const key = toleranceRuleKey({
      level,
      company,
      plant: cmd.plant,
      material: cmd.material?.trim(),
      direction: cmd.direction!,
    });
    s.rules[key] = { ...r, version: (s.rules[key]?.version ?? 0) + 1 };
    if (cmd.process) {
      const expectedIds: ProcessStepId[] = [
        "queue",
        "initial_weigh",
        "product_handling",
        "product_weighing",
        "weight_check",
        "approval",
        "gate_exit",
      ];
      const ids = cmd.process.steps.map((step) => step.id);
      if (
        cmd.process.company !== company ||
        cmd.process.direction !== cmd.direction ||
        cmd.process.steps.length !== expectedIds.length ||
        new Set(ids).size !== expectedIds.length ||
        expectedIds.some((id) => !ids.includes(id)) ||
        cmd.process.steps.some(
          (step) =>
            !step.label.trim() ||
            step.label.trim().length > 80 ||
            (step.required && !step.enabled),
        )
      )
        throw new Error(
          "Check the company process labels, enabled steps and sequence.",
        );
      const pKey = processKey(company, cmd.direction!);
      s.processes[pKey] = {
        company,
        direction: cmd.direction!,
        version: (s.processes[pKey]?.version ?? 0) + 1,
        steps: cmd.process.steps.map((step) => ({
          ...step,
          label: step.label.trim(),
        })),
      };
    }
    if (cmd.emailEnabled && !emailConfigured)
      throw new Error(
        "Configure the email gateway before enabling email sending.",
      );
    s.emailEnabled = !!cmd.emailEnabled;
    s.audit.push({
      at: now,
      by: actor.email,
      text:
        "Updated " + level + " tolerance " + key + " to version " +
        s.rules[key].version +
        (cmd.process
          ? " and " + company + " " + cmd.direction + " process template to version " +
            s.processes[processKey(company, cmd.direction!)].version
          : "") +
        ". Existing comparisons retain their original rules.",
    });
    return s;
  }
  if (cmd.kind === "add_recipient" || cmd.kind === "remove_recipient") {
    if (!actor.isAdmin)
      throw new Error("Only the administrator can manage notification recipients.");
    const email = (cmd.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error("Enter a valid email address.");
    if (cmd.kind === "remove_recipient") {
      if (!s.supervisors.some((x) => x.email === email))
        throw new Error("Recipient was not found.");
      s.supervisors = s.supervisors.filter((x) => x.email !== email);
      s.audit.push({
        at: now,
        by: actor.email,
        text: "Removed notification recipient " + email,
      });
      return s;
    }
    if (
      !cmd.name?.trim() ||
      !["ALL", ...s.sites.map((p) => p.id)].includes(cmd.recipientPlant ?? "") ||
      !["inbound", "outbound", "both"].includes(cmd.recipientDirection ?? "")
    )
      throw new Error("Enter a name, and select a valid site and direction.");
    if (s.supervisors.some((x) => x.email === email))
      throw new Error("A recipient with this email already exists.");
    if (s.supervisors.length >= 50)
      throw new Error("The notification recipient list is full.");
    s.supervisors.push({
      email,
      name: cmd.name.trim(),
      plant: cmd.recipientPlant!,
      direction: cmd.recipientDirection!,
    });
    s.audit.push({
      at: now,
      by: actor.email,
      text: "Added notification recipient " + email,
    });
    return s;
  }
  if (cmd.kind === "add_material") {
    if (!actor.isAdmin) throw new Error("Only the administrator can manage the material catalog.");
    const code = (cmd.materialCode ?? "").trim().toUpperCase();
    const description = (cmd.materialDescription ?? "").trim();
    if (!/^[A-Z0-9][A-Z0-9._/-]{0,39}$/.test(code))
      throw new Error("Enter a material code using up to 40 letters, digits, dots, slashes, dashes, or underscores.");
    if (!description || description.length > 150)
      throw new Error("Enter a material description (max 150 characters).");
    if (s.materialCatalog.some((item) => item.code.toUpperCase() === code))
      throw new Error("A material with this code already exists.");
    if (s.materialCatalog.length >= 1000)
      throw new Error("The material catalog is full.");
    s.materialCatalog.push({ code, description });
    s.materialCatalog.sort((a, b) => a.code.localeCompare(b.code));
    s.audit.push({ at: now, by: actor.email, text: "Added material " + code + " - " + description });
    return s;
  }
  if (cmd.kind === "add_company") {
    if (!actor.isAdmin)
      throw new Error("Only the administrator can manage company codes.");
    const id = (cmd.companyId ?? "").trim().toUpperCase();
    const name = (cmd.companyName ?? "").trim();
    if (!/^[A-Z0-9]{1,10}$/.test(id))
      throw new Error("Enter a valid company code (1–10 letters or digits).");
    if (!name || name.length > 100)
      throw new Error("Enter a company name (max 100 characters).");
    if (s.companyCodes.some((c) => c.id === id))
      throw new Error("A company code with this ID already exists.");
    if (s.companyCodes.length >= 20)
      throw new Error("The company code list is full.");
    s.companyCodes.push({ id, name });
    s.audit.push({ at: now, by: actor.email, text: "Added company code " + id + " · " + name });
    return s;
  }
  if (cmd.kind === "remove_company") {
    if (!actor.isAdmin)
      throw new Error("Only the administrator can manage company codes.");
    const id = (cmd.companyId ?? "").trim();
    if (!s.companyCodes.some((c) => c.id === id))
      throw new Error("Company code was not found.");
    if (s.visits.some((v) => v.company === id))
      throw new Error("Cannot remove a company code that has active deliveries.");
    s.companyCodes = s.companyCodes.filter((c) => c.id !== id);
    s.audit.push({ at: now, by: actor.email, text: "Removed company code " + id });
    return s;
  }
  if (cmd.kind === "add_site") {
    if (!actor.isAdmin) throw new Error("Only the administrator can manage sites.");
    const id = (cmd.siteId ?? "").trim().toUpperCase();
    const label = (cmd.siteLabel ?? "").trim();
    const company = (cmd.siteCompany ?? "").trim();
    if (!/^[A-Z0-9]{1,10}$/.test(id)) throw new Error("Enter a valid site code (1–10 letters or digits).");
    if (!label || label.length > 100) throw new Error("Enter a site label (max 100 characters).");
    if (!s.companyCodes.some((c) => c.id === company)) throw new Error("Select a valid company code.");
    if (s.sites.some((p) => p.id === id)) throw new Error("A site with this code already exists.");
    if (s.sites.length >= 50) throw new Error("The site list is full.");
    s.sites.push({ id, company, label });
    s.audit.push({ at: now, by: actor.email, text: "Added site " + id + " · " + label });
    return s;
  }
  if (cmd.kind === "remove_site") {
    if (!actor.isAdmin) throw new Error("Only the administrator can manage sites.");
    const id = (cmd.siteId ?? "").trim();
    if (!s.sites.some((p) => p.id === id)) throw new Error("Site was not found.");
    if (s.visits.some((v) => v.plant === id)) throw new Error("Cannot remove a site that has active deliveries.");
    s.sites = s.sites.filter((p) => p.id !== id);
    s.audit.push({ at: now, by: actor.email, text: "Removed site " + id });
    return s;
  }
  const v = s.visits.find((v) => v.id === cmd.id);
  if (!v) throw new Error("Delivery was not found.");
  if (!canOperate(actor, v))
    throw new Error(
      "You are not authorized for this site and delivery direction.",
    );
  let text = "";
  const allowed = (...stages: Stage[]) => {
    if (!stages.includes(v.stage))
      throw new Error(
        "This action is not available at the current process step. Refresh and try again.",
      );
  };
  switch (cmd.kind) {
    case "checkin": {
      allowed("scheduled");
      const plate = (cmd.plate ?? "").trim().toUpperCase(),
        driver = (cmd.driver ?? "").trim();
      const plateKey = (p: string) => p.replace(/[^A-Z0-9]/g, "");
      if (plateKey(plate).length < 4 || !driver)
        throw new Error("Enter a valid truck plate and driver name.");
      if (
        s.visits.some(
          (x) =>
            x.id !== v.id &&
            x.plant === v.plant &&
            !["scheduled", "completed", "rejected"].includes(x.stage) &&
            plateKey(x.plate) === plateKey(plate),
        )
      )
        throw new Error("This truck plate is already active at this site.");
      v.plate = plate;
      v.driver = driver;
      v.carrier = (cmd.carrier ?? "").trim();
      v.ticket =
        1 +
        Math.max(
          0,
          ...s.visits
            .filter(
              (x) =>
                x.plant === v.plant &&
                x.date === v.date &&
                x.direction === v.direction,
            )
            .map((x) => x.ticket ?? 0),
        );
      v.arrivedAt = now;
      v.stage = "waiting";
      text = "Arrival recorded · " + ticket(v);
      break;
    }
    case "call":
      allowed("waiting");
      if (s.visits.some((x) => x.plant === v.plant && x.stage === "called"))
        throw new Error(
          "Send the currently called truck to the scale, or place it on hold first.",
        );
      if (nextWaiting(s, v.plant, v.date, v.direction)?.id !== v.id)
        throw new Error("Call the first truck in the arrival queue.");
      v.stage = "called";
      text = "Called to the weighbridge";
      break;
    case "send":
      allowed("called");
      v.stage = "first_weigh";
      text = "Sent to the weighbridge for first weighing";
      break;
    case "hold":
      allowed("waiting", "called");
      if (!cmd.reason?.trim()) throw new Error("Enter a hold reason.");
      v.heldFrom = "waiting";
      v.stage = "held";
      v.holdReason = cmd.reason.trim();
      text = "Placed on hold: " + v.holdReason;
      break;
    case "resume":
      allowed("held");
      v.stage = v.heldFrom ?? "waiting";
      v.holdReason = "";
      text = "Returned to queue with original arrival priority";
      break;
    case "handling_done":
      allowed("handling");
      v.stage = "second_weigh";
      const handlingTicket = v.productTickets[v.activeTicket];
      text =
        (v.direction === "inbound" ? "Unloading" : "Loading") +
        " complete for " +
        handlingTicket.line.description +
        " · return to weighbridge for ticket " +
        handlingTicket.sequence;
      break;
    case "capture": {
      allowed("first_weigh", "second_weigh");
      if (
        !v.expectedKg ||
        !Number.isFinite(v.expectedKg) ||
        v.expectedKg <= 0 ||
        !v.productTickets.length
      )
        throw new Error(
          "A valid expected net cargo weight is required before weighing.",
        );
      const r = cmd.reading;
      if (
        !r ||
        !Number.isFinite(r.kg) ||
        r.kg <= 0 ||
        r.kg > 200000 ||
        !["manual", "scale", "simulator"].includes(r.source)
      )
        throw new Error(
          "Enter a weight greater than zero and no more than 200,000 kg.",
        );
      if (r.source === "manual" && !r.reason.trim())
        throw new Error("Record why the weight is being entered manually.");
      if (v.stage === "first_weigh") {
        if (v.readings.length)
          throw new Error("First weight is already recorded.");
        v.readings.push({
          ...r,
          label:
            "Initial " +
            (v.direction === "inbound" ? "loaded" : "empty") +
            " truck weight",
        });
        v.stage = "handling";
        text =
          (v.direction === "inbound" ? "Loaded" : "Empty") +
          " truck weighed: " +
          kg(r.kg) +
          " kg · begin product ticket 1 of " +
          v.productTickets.length;
      } else {
        if (!v.readings.length)
          throw new Error(
            "The initial truck weighing must be recorded before product tickets.",
          );
        const product = v.productTickets[v.activeTicket];
        if (!product || product.result)
          throw new Error("Select an incomplete product weighing ticket.");
        const previous = v.readings.at(-1)!;
        const gross = v.direction === "inbound" ? previous.kg : r.kg,
          tare = v.direction === "inbound" ? r.kg : previous.kg;
        product.result = compareWeight(
          gross,
          tare,
          product.expectedKg,
          resolveTolerance(s, v, product.line.material),
          now,
        );
        v.readings.push({
          ...r,
          ticketId: product.id,
          label:
            "Product " + product.sequence + " · " + product.line.description,
        });
        text =
          "Product ticket " +
          product.sequence +
          " of " +
          v.productTickets.length +
          " · " +
          product.line.description +
          " · net " +
          kg(product.result.net) +
          " kg · " +
          (product.result.within ? "within tolerance" : "outside tolerance");
        if (v.activeTicket < v.productTickets.length - 1) {
          v.activeTicket += 1;
          v.stage = "handling";
          text +=
            " · continue with product " +
            (v.activeTicket + 1) +
            ": " +
            v.productTickets[v.activeTicket].line.description;
        } else {
          v.result = aggregateTicketResults(v, now);
          v.stage = v.result.within ? "cleared" : "approval";
          text += v.result.within
            ? " · all product tickets cleared"
            : " · supervisor approval required";
          if (!v.result.within)
            s.notifications.push(notificationFor(s, v, now, emailConfigured));
        }
      }
      break;
    }
    case "approve":
    case "reject":
      allowed("approval");
      if (!canApprove(actor, v))
        throw new Error(
          "Only an authorized supervisor can decide this exception.",
        );
      if (!v.result || v.result.within)
        throw new Error("No weight exception is awaiting approval.");
      if (!cmd.reason?.trim())
        throw new Error("A decision reason is required.");
      v.decision = {
        outcome: cmd.kind === "approve" ? "approved" : "rejected",
        reason: cmd.reason.trim(),
        by: actor.email,
        at: now,
      };
      v.stage = cmd.kind === "approve" ? "cleared" : "rejected";
      text = "Delivery " + v.decision.outcome + ": " + v.decision.reason;
      break;
    case "complete":
      allowed("cleared");
      v.stage = "completed";
      text = "Gate exit recorded · delivery process completed";
      break;
    case "renew_qr":
      v.token = newToken();
      v.tokenExpires = new Date(
        new Date(now).getTime() + 7 * 86400000,
      ).toISOString();
      text = "Trucker QR pass renewed; previous pass invalidated";
      break;
    default:
      throw new Error("Unknown operation.");
  }
  v.events.push({ at: now, text, by: actor.email });
  return s;
}
export function driverView(
  state: Operations,
  tokenValue: string,
  now = Date.now(),
) {
  const v = state.visits.find(
    (x) => x.token === tokenValue && new Date(x.tokenExpires).getTime() > now,
  );
  if (!v) return null;
  const ahead =
    v.stage === "waiting"
      ? state.visits.filter(
          (x) =>
            x.plant === v.plant &&
            x.direction === v.direction &&
            x.date === v.date &&
            x.stage === "waiting" &&
            (x.arrivedAt! < v.arrivedAt! ||
              (x.arrivedAt === v.arrivedAt && x.ticket! < v.ticket!)),
        ).length
      : null;
  const messages: Record<Stage, string> = {
    scheduled:
      "Proceed to the gate at your scheduled arrival time for check-in.",
    waiting:
      "Please wait in the designated parking area. Your queue position updates automatically.",
    called:
      "Your truck has been called. Proceed to the weighbridge when instructed.",
    held: "Your truck is on hold. Please contact the gate operator.",
    first_weigh:
      "Proceed with the first weighing and follow the scale operator’s instructions.",
    handling:
      v.direction === "inbound"
        ? "Unload the next product, then return to the weighbridge for its ticket weight."
        : "Load the next product, then return to the weighbridge for its ticket weight.",
    second_weigh:
      "Return to the weighbridge to complete product ticket " +
      (v.activeTicket + 1) +
      " of " +
      v.productTickets.length +
      ".",
    approval:
      "A weight check needs supervisor review. Please wait for further instructions.",
    cleared:
      "Your delivery has been cleared. Proceed to the gate for exit processing.",
    rejected:
      "The delivery has been rejected. Contact the gate operator for instructions.",
    completed:
      "Gate exit has been recorded. Your delivery process is complete.",
  };
  const process = processFor(state, v);
  return {
    id: v.id,
    plate: v.plate || "Not assigned",
    direction: v.direction,
    site: state.sites.find((p) => p.id === v.plant)?.label,
    date: v.date,
    scheduledTime: v.time,
    stage: v.stage,
    ticket: ticket(v),
    ahead,
    message: messages[v.stage],
    processSteps: process.steps
      .filter((step) => step.enabled)
      .map((step) => ({ id: step.id, label: step.label })),
    currentProcessStep: currentProcessStep(v),
    ticketProgress: {
      completed: v.productTickets.filter((item) => item.result).length,
      total: v.productTickets.length,
      current: Math.min(v.activeTicket + 1, v.productTickets.length),
    },
    expires: v.tokenExpires,
    updatedAt: v.events.at(-1)?.at ?? state.createdAt,
    milestones: v.events.map((e) => ({
      at: e.at,
      label: e.text.startsWith("Delivery approved")
        ? "Supervisor approved delivery"
        : e.text.startsWith("Delivery rejected")
          ? "Supervisor rejected delivery"
          : e.text.startsWith("Placed on hold")
            ? "Truck placed on hold"
            : e.text.includes("net weight")
              ? "Weight verification completed"
              : e.text.includes("weighed:")
                ? "Truck weight recorded"
                : e.text.includes("QR pass")
                  ? "Tracking pass updated"
                  : e.text,
    })),
  };
}
