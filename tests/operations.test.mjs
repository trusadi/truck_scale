import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import QRCode from "qrcode";
const compile = (file) =>
  ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const uri = (source) =>
  "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const model = await import(
  uri(
    compile("../lib/operations.ts").replace(
      '"./truck-queue"',
      JSON.stringify(uri(compile("../lib/truck-queue.ts"))),
    ),
  )
);
const owner = {
  email: "owner@example.com",
  name: "Prototype owner",
  isAdmin: true,
  role: "admin",
  plant: "ALL",
  direction: "both",
};
const start = () => model.createOperations("2026-09-08", owner.email);
const at = new Date().toISOString();
const capture = (state, id, amount) =>
  model.applyCommand(
    state,
    {
      kind: "capture",
      id,
      reading: {
        kg: amount,
        at,
        source: "manual",
        by: owner.email,
        device: "Test display",
        reason: "Read from scale display",
      },
    },
    owner,
    at,
  );
test("net cargo comparison, inclusive limits, units and invalid references", () => {
  const rule = { unit: "percent", shortage: 1, excess: 2, version: 3 };
  assert.equal(model.compareWeight(19900, 10000, 10000, rule, at).within, true);
  assert.equal(model.compareWeight(20200, 10000, 10000, rule, at).within, true);
  assert.equal(
    model.compareWeight(19899.99, 10000, 10000, rule, at).within,
    false,
  );
  assert.equal(
    model.compareWeight(20200.01, 10000, 10000, rule, at).within,
    false,
  );
  assert.equal(
    model.compareWeight(
      20050,
      10000,
      10000,
      { ...rule, unit: "kg", shortage: 25, excess: 50 },
      at,
    ).within,
    true,
  );
  for (const args of [
    [10000, 10001, 9000],
    [20000, 10000, 0],
    [NaN, 10000, 9000],
  ])
    assert.throws(() => model.compareWeight(...args, rule, at));
});
test("tolerance precedence and company process templates are configurable", () => {
  let s = start();
  const visit = s.visits.find((item) => item.id === "VISIT-001");
  assert.equal(
    model.resolveTolerance(s, visit, "RM-100101").appliedLevel,
    "plant",
  );
  assert.equal(
    model.resolveTolerance(s, visit, "RM-100205").appliedLevel,
    "material",
  );
  assert.equal(model.resolveTolerance(s, visit, "RM-100205").excess, 0.75);

  const process = structuredClone(s.processes["1000:inbound"]);
  process.steps.find((step) => step.id === "queue").label =
    "Security gate & document queue";
  process.steps.find((step) => step.id === "product_handling").enabled = false;
  const exit = process.steps.pop();
  process.steps.splice(1, 0, exit);
  s = model.applyCommand(
    s,
    {
      kind: "settings",
      company: "1000",
      level: "company",
      direction: "inbound",
      rule: { unit: "percent", shortage: 2, excess: 2, version: 1 },
      process,
    },
    owner,
    at,
  );
  assert.equal(s.rules["company:1000:inbound"].excess, 2);
  assert.equal(s.processes["1000:inbound"].version, 2);
  assert.equal(s.processes["1000:inbound"].steps[1].id, "gate_exit");
  assert.equal(
    s.processes["1000:inbound"].steps.find(
      (step) => step.id === "product_handling",
    ).enabled,
    false,
  );

  s = model.applyCommand(
    s,
    {
      kind: "settings",
      company: "1000",
      level: "material",
      plant: "PAG",
      material: "RM-100205",
      direction: "inbound",
      rule: { unit: "kg", shortage: 25, excess: 40, version: 1 },
    },
    owner,
    at,
  );
  const resolved = model.resolveTolerance(s, visit, "RM-100205");
  assert.equal(resolved.appliedLevel, "material");
  assert.equal(resolved.unit, "kg");
  assert.equal(resolved.excess, 40);
});
test("inbound variance blocks exit and keeps original tolerance through supervisor decision", () => {
  let s = start();
  s = capture(s, "VISIT-001", 35000);
  assert.equal(s.visits[0].stage, "handling");
  assert.throws(() => capture(s, "VISIT-001", 10000), /current process step/);
  s = model.applyCommand(
    s,
    { kind: "handling_done", id: "VISIT-001" },
    owner,
    at,
  );
  s = capture(s, "VISIT-001", 17000);
  assert.equal(s.visits[0].productTickets[0].result.net, 18000);
  assert.equal(s.visits[0].stage, "handling");
  s = model.applyCommand(
    s,
    { kind: "handling_done", id: "VISIT-001" },
    owner,
    at,
  );
  s = capture(s, "VISIT-001", 10000);
  assert.equal(s.visits[0].result.net, 25000);
  assert.equal(s.visits[0].stage, "approval");
  assert.equal(s.visits[0].productTickets.length, 2);
  assert.equal(s.visits[0].productTickets[1].result.net, 7000);
  assert.equal(
    s.visits[0].productTickets[1].result.rule.appliedLevel,
    "material",
  );
  assert.equal(s.notifications.at(-1).status, "not_configured");
  assert.throws(() =>
    model.applyCommand(s, { kind: "complete", id: "VISIT-001" }, owner, at),
  );
  s = model.applyCommand(
    s,
    {
      kind: "settings",
      company: "1000",
      level: "plant",
      plant: "PAG",
      direction: "inbound",
      rule: { unit: "percent", shortage: 10, excess: 10, version: 1 },
    },
    owner,
    at,
  );
  assert.equal(s.visits[0].productTickets[0].result.rule.excess, 1);
  assert.equal(s.visits[0].productTickets[1].result.rule.excess, 0.75);
  assert.equal(s.visits[0].result.within, false);
  assert.throws(
    () =>
      model.applyCommand(
        s,
        { kind: "approve", id: "VISIT-001", reason: "" },
        owner,
        at,
      ),
    /reason/,
  );
  s = model.applyCommand(
    s,
    {
      kind: "approve",
      id: "VISIT-001",
      reason: "Supporting documents verified",
    },
    owner,
    at,
  );
  assert.equal(s.visits[0].stage, "cleared");
  assert.equal(s.visits[0].decision.by, owner.email);
  assert.throws(() =>
    model.applyCommand(
      s,
      { kind: "reject", id: "VISIT-001", reason: "Late conflicting review" },
      owner,
      at,
    ),
  );
  s = model.applyCommand(s, { kind: "complete", id: "VISIT-001" }, owner, at);
  assert.equal(s.visits[0].stage, "completed");
});
test("outbound empty-first flow clears a valid delivery and rejects an exception", () => {
  let s = start();
  s = capture(s, "OUT-001", 16400);
  let v = s.visits.find((v) => v.id === "OUT-001");
  assert.equal(v.productTickets[0].result.net, 7000);
  assert.equal(v.stage, "handling");
  s = model.applyCommand(
    s,
    { kind: "handling_done", id: "OUT-001" },
    owner,
    at,
  );
  s = capture(s, "OUT-001", 21400);
  v = s.visits.find((v) => v.id === "OUT-001");
  assert.equal(v.result.tare, 9400);
  assert.equal(v.result.net, 12000);
  assert.equal(v.productTickets[1].result.net, 5000);
  assert.equal(v.stage, "cleared");
  s = model.applyCommand(
    s,
    { kind: "reject", id: "OUT-002", reason: "Load must be corrected" },
    owner,
    at,
  );
  assert.equal(s.visits.find((v) => v.id === "OUT-002").stage, "rejected");
  assert.throws(() =>
    model.applyCommand(s, { kind: "complete", id: "OUT-002" }, owner, at),
  );
});
test("roles and site/direction assignments are enforced independently of the UI", () => {
  let s = start();
  const operator = {
    email: "operator@example.com",
    name: "Operator",
    isAdmin: false,
    role: "operator",
    plant: "PAG",
    direction: "both",
  };
  const otherSupervisor = {
    email: "supervisor@example.com",
    name: "Supervisor",
    isAdmin: false,
    role: "supervisor",
    plant: "CEB",
    direction: "inbound",
  };
  assert.throws(
    () =>
      model.applyCommand(
        s,
        { kind: "approve", id: "VISIT-002", reason: "Accept" },
        operator,
        at,
      ),
    /authorized supervisor/,
  );
  assert.throws(
    () =>
      model.applyCommand(
        s,
        { kind: "approve", id: "VISIT-002", reason: "Accept" },
        otherSupervisor,
        at,
      ),
    /not authorized/,
  );
  assert.throws(
    () =>
      model.applyCommand(
        s,
        {
          kind: "settings",
          plant: "PAG",
          direction: "inbound",
          rule: s.rules["PAG:inbound"],
        },
        operator,
        at,
      ),
    /administrator/,
  );
  assert.throws(
    () =>
      model.applyCommand(
        s,
        {
          kind: "capture",
          id: "VISIT-001",
          reading: {
            kg: 35000,
            at,
            source: "manual",
            by: operator.email,
            device: "Manual",
            reason: "",
          },
        },
        operator,
        at,
      ),
    /manually/,
  );
});
test("arrival queue, duplicate vehicles, hold/resume and shared called slot", () => {
  let s = start();
  assert.throws(
    () => model.applyCommand(s, { kind: "call", id: "OUT-003" }, owner, at),
    /currently called/,
  );
  s = model.applyCommand(s, { kind: "send", id: "VISIT-003" }, owner, at);
  assert.throws(
    () => model.applyCommand(s, { kind: "call", id: "VISIT-005" }, owner, at),
    /first truck/,
  );
  s = model.applyCommand(
    s,
    { kind: "hold", id: "VISIT-004", reason: "Check document" },
    owner,
    at,
  );
  assert.equal(
    model.nextWaiting(s, "PAG", s.sampleDate, "inbound").id,
    "VISIT-005",
  );
  s = model.applyCommand(s, { kind: "resume", id: "VISIT-004" }, owner, at);
  assert.equal(
    model.nextWaiting(s, "PAG", s.sampleDate, "inbound").id,
    "VISIT-004",
  );
  assert.throws(
    () =>
      model.applyCommand(
        s,
        {
          kind: "checkin",
          id: "VISIT-008",
          plate: "nex-4296",
          driver: "Driver",
        },
        owner,
        at,
      ),
    /already active/,
  );
  s = model.applyCommand(
    s,
    {
      kind: "checkin",
      id: "VISIT-008",
      plate: "NEW 1234",
      driver: "Driver",
      carrier: "Haulier",
    },
    owner,
    at,
  );
  assert.equal(s.visits.find((v) => v.id === "VISIT-008").ticket, 8);
  assert.equal(
    model.nextWaiting(s, "PAG", s.sampleDate, "inbound").id,
    "VISIT-004",
  );
});
test("tracking passes expose only driver progress, expire and rotate", async () => {
  let s = start();
  const v = s.visits.find((v) => v.id === "VISIT-004");
  const token = v.token;
  assert.match(token, /^[a-f0-9]{48}$/);
  assert.equal(new Set(s.visits.map((v) => v.token)).size, s.visits.length);
  const view = model.driverView(s, token);
  assert.equal(view.ahead, 0);
  assert.equal(view.plate, v.plate);
  for (const forbidden of [
    "expectedKg",
    "result",
    "email",
    "driver",
    "origin",
    "lines",
    "holdReason",
  ])
    assert.equal(Object.hasOwn(view, forbidden), false);
  assert.equal(model.driverView(s, token, Date.now() + 8 * 86400000), null);
  s = model.applyCommand(s, { kind: "renew_qr", id: v.id }, owner, at);
  assert.equal(model.driverView(s, token), null);
  const url =
    "https://smf-truck-scale-demo.example.netlify.app/track/" +
    s.visits.find((x) => x.id === v.id).token;
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  assert.ok(qr.modules.size > 21);
  const svg = await QRCode.toString(url, { type: "svg", margin: 4 });
  assert.match(svg, /<svg/);
  assert.match(svg, /<path/);
});
