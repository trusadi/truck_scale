"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpFromLine,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Factory,
  FileText,
  ListOrdered,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Megaphone,
  Monitor,
  Package,
  Pause,
  QrCode,
  RefreshCw,
  Scale,
  Search,
  Settings2,
  ShieldCheck,
  Truck as TruckIcon,
  Upload,
  UserCircle,
  X,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import QRCode from "qrcode";
import { PLANTS } from "@/lib/truck-queue";
import { parseInboundWorkbook, type InboundImportRow } from "@/lib/inbound-xlsx";
import {
  canApprove,
  clock,
  currentProcessStep,
  kg,
  processFor,
  processKey,
  productTicket,
  resolveTolerance,
  STAGES,
  ticket,
  toleranceRuleKey,
  type Actor,
  type Direction,
  type Notification,
  type Operations,
  type ProcessTemplate,
  type Role,
  type Rule,
  type ToleranceLevel,
  type Visit,
  type VisitLine,
} from "@/lib/operations";
import type { PlantScope, PublicUserRecord } from "@/lib/auth";

type Workspace = Operations & {
  actor: Actor;
  capabilities: {
    emailConfigured: boolean;
    scaleConfigured: boolean;
    sapConnected: boolean;
    externalDriverAccess: boolean;
  };
};
type View =
  | "queue"
  | "inbound"
  | "outbound"
  | "approvals"
  | "tracking"
  | "settings";
type Input = Record<string, unknown>;
type InboundEditDraft = {
  id: string;
  date: string;
  time: string;
  supplier: string;
  plate: string;
  driver: string;
  lines: VisitLine[];
};
const statusClass = (v: Visit) =>
  ["cleared", "completed"].includes(v.stage)
    ? "status-sent"
    : ["approval", "held"].includes(v.stage)
      ? "status-held"
      : v.stage === "rejected"
        ? "status-rejected"
        : ["called", "first_weigh", "second_weigh"].includes(v.stage)
          ? "status-called"
          : v.stage === "scheduled"
            ? "status-scheduled"
            : "status-waiting";
const stageLabel = (v: Visit) =>
  v.stage === "handling"
    ? v.direction === "inbound"
      ? "Unloading"
      : "Loading"
    : STAGES[v.stage];
function Badge({ visit }: { visit: Visit }) {
  return (
    <span className={"status " + statusClass(visit)}>{stageLabel(visit)}</span>
  );
}
function Pick({
  value,
  onChange,
  label,
  children,
  className = "",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}
function WeightResult({ visit }: { visit: Visit }) {
  const r = visit.result;
  if (!r)
    return (
      <div className="comparison-empty">
        <Scale size={24} />
        <div>
          <strong>Net weight comparison</strong>
          <p>
            Complete the initial truck weight and every product ticket to
            calculate net cargo weight and check the matched tolerances.
          </p>
        </div>
      </div>
    );
  return (
    <section
      className={
        "weight-result " +
        (r.within || visit.decision?.outcome === "approved"
          ? "result-good"
          : "result-exception")
      }
    >
      <div className="result-header">
        <h3>
          {r.within
            ? "Within tolerance"
            : visit.decision
              ? "Exception " + visit.decision.outcome
              : "Supervisor approval required"}
        </h3>
        <Badge visit={visit} />
      </div>
      <div className="result-numbers">
        <div>
          <span>Expected net</span>
          <strong>
            {kg(r.expected)} <small>kg</small>
          </strong>
        </div>
        <div>
          <span>Actual net</span>
          <strong>
            {kg(r.net)} <small>kg</small>
          </strong>
        </div>
        <div>
          <span>Variance</span>
          <strong>
            {r.variance > 0 ? "+" : ""}
            {kg(r.variance)} <small>kg</small>
          </strong>
          <em>
            {r.percent > 0 ? "+" : ""}
            {r.percent.toFixed(2)}%
          </em>
        </div>
      </div>
      <div className="formula-line">
        {kg(r.gross)} kg loaded âˆ’ {kg(r.tare)} kg empty ={" "}
        <strong>{kg(r.net)} kg net</strong>
      </div>
      <p className="tolerance-foot">
        {visit.productTickets.length > 1 ? (
          <>
            Each product ticket is checked independently using its matched
            material, plant, or company rule. Combined expected range:{" "}
            <strong>
              {kg(r.min)}â€“{kg(r.max)} kg
            </strong>
            .
          </>
        ) : (
          <>
            Allowed net range:{" "}
            <strong>
              {kg(r.min)}â€“{kg(r.max)} kg
            </strong>{" "}
            Â· {r.rule.appliedLevel ?? "company"} rule v{r.rule.version} Â· âˆ’
            {r.rule.shortage}
            {r.rule.unit === "percent" ? "%" : " kg"} / +{r.rule.excess}
            {r.rule.unit === "percent" ? "%" : " kg"}
          </>
        )}
      </p>
      {visit.decision && (
        <div className="decision-note">
          <strong>
            {visit.decision.outcome === "approved" ? "Approved" : "Rejected"} by{" "}
            {visit.decision.by}
          </strong>
          <p>{visit.decision.reason}</p>
          <small>
            {new Date(visit.decision.at).toLocaleString("en-GB", {
              timeZone: "Asia/Manila",
            })}{" "}
            PHT
          </small>
        </div>
      )}
    </section>
  );
}

function ProductTicketList({ visit }: { visit: Visit }) {
  const complete = visit.productTickets.filter((item) => item.result).length;
  return (
    <section className="product-tickets">
      <div className="aside-heading">
        <div>
          <h3>Product weighing tickets</h3>
          <p className="small-description">
            {complete} of {visit.productTickets.length} completed Â· one ticket
            per material
          </p>
        </div>
        <span className="count-badge">
          {complete}/{visit.productTickets.length}
        </span>
      </div>
      <div className="product-ticket-list">
        {visit.productTickets.map((item, index) => {
          const active =
            index === visit.activeTicket &&
            ["handling", "second_weigh"].includes(visit.stage);
          return (
            <article
              key={item.id}
              className={active ? "product-ticket active-ticket" : "product-ticket"}
            >
              <span className="reading-number">{item.sequence}</span>
              <div className="product-ticket-copy">
                <strong>{item.line.description}</strong>
                <p>
                  {productTicket(visit, item)} Â· {item.line.material} Â· {item.line.type}{" "}
                  {item.line.document}/{item.line.item}
                </p>
                {item.result && (
                  <small>
                    Rule: {item.result.rule.appliedLevel} Â·{" "}
                    {item.result.rule.appliedLabel} Â· v{item.result.rule.version}
                  </small>
                )}
              </div>
              <div className="product-ticket-weight">
                <span>Expected {kg(item.expectedKg)} kg</span>
                {item.result ? (
                  <>
                    <strong>{kg(item.result.net)} kg</strong>
                    <em className={item.result.within ? "ticket-pass" : "ticket-fail"}>
                      {item.result.within ? "Within tolerance" : "Exception"}
                    </em>
                  </>
                ) : (
                  <em>{active ? "Current product" : "Pending"}</em>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ProcessSteps({ state, visit }: { state: Workspace; visit: Visit }) {
  const steps = processFor(state, visit).steps.filter((step) => step.enabled);
  const current = currentProcessStep(visit);
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === current),
  );
  return (
    <div className="weigh-steps configured-steps">
      {steps.map((step, index) => {
        const done = visit.stage === "completed" || index < currentIndex;
        return (
          <div
            key={step.id}
            className={done ? "step-done" : index === currentIndex ? "step-current" : ""}
          >
            <span>{done ? <Check size={14} /> : index + 1}</span>
            {step.label}
          </div>
        );
      })}
    </div>
  );
}

export default function TruckQueue({ today }: { today: string }) {
  const [state, setState] = useState<Workspace | null>(null),
    [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false),
    [view, setView] = useState<View>("queue");
  const [importRows, setImportRows] = useState<InboundImportRow[] | null>(null),
    [importError, setImportError] = useState(""),
    [importBusy, setImportBusy] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const [editDraft, setEditDraft] = useState<InboundEditDraft | null>(null),
    [editError, setEditError] = useState(""),
    [editBusy, setEditBusy] = useState(false);
  const [plant, setPlant] = useState("PAG"),
    [date, setDate] = useState(today),
    [direction, setDirection] = useState<Direction>("inbound"),
    [queueType, setQueueType] = useState<"inbound" | "outbound" | "return">("inbound");
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [orderType, setOrderType] = useState("all");
  const [detail, setDetail] = useState(""),
    [qrId, setQrId] = useState(""),
    [qrImage, setQrImage] = useState("");
  const [emailId, setEmailId] = useState(""),
    [weighId, setWeighId] = useState(""),
    [reviewId, setReviewId] = useState("");
  const [dialog, setDialog] = useState<{
      kind: "checkin" | "hold";
      id: string;
    } | null>(null),
    [form, setForm] = useState({
      plate: "",
      driver: "",
      carrier: "",
      reason: "",
    });
  const [source, setSource] = useState("simulator"),
    [scenario, setScenario] = useState("within"),
    [weight, setWeight] = useState(""),
    [manualReason, setManualReason] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const initialized = useRef(false),
    busyRef = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/operations", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load operations.");
      setState((current) =>
        !current || data.revision >= current.revision ? data : current,
      );
      setLoadError("");
      if (!initialized.current) {
        const visitId = new URLSearchParams(window.location.search).get(
          "visit",
        );
        const visit = data.visits.find((item: Visit) => item.id === visitId);
        setDate(visit?.date ?? data.sampleDate);
        if (!data.actor.isAdmin) {
          setPlant(data.actor.plant);
          if (data.actor.direction === "return") {
            setDirection("inbound");
            setQueueType("return");
          } else if (data.actor.direction !== "both") {
            setDirection(data.actor.direction as Direction);
            setQueueType(data.actor.direction as Direction);
          }
        } else if (visit) setPlant(visit.plant);
        initialized.current = true;
      }
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Unable to load operations.",
      );
    }
  }, []);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const v = query.get("view");
    if (
      [
        "queue",
        "inbound",
        "outbound",
        "approvals",
        "tracking",
        "settings",
      ].includes(v ?? "")
    )
      setView(v as View);
    if (query.get("visit")) setReviewId(query.get("visit")!);
    void refresh();
    const timer = setInterval(() => {
      if (!busyRef.current) void refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!state) return;
    if (view === "settings" && !state.actor.isAdmin) setView("queue");
    if (view === "approvals" && state.actor.role === "operator") setView("queue");
  }, [state, view]);
  async function run(input: Input, success: string) {
    if (!state || busyRef.current) return false;
    setBusy(true);
    busyRef.current = true;
    try {
      const res = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: state.revision, ...input }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return false;
      }
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) await refresh();
        throw new Error(data.error || "Unable to save. Please try again.");
      }
      setState((current) =>
        !current || data.revision >= current.revision ? data : current,
      );
      setLoadError("");
      toast.success(success);
      return true;
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Unable to save. Your input has been kept.",
      );
      return false;
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  const qrVisit = state?.visits.find((v) => v.id === qrId);
  const trackingUrl =
    qrVisit && typeof window !== "undefined"
      ? window.location.origin + "/track/" + qrVisit.token
      : "";
  useEffect(() => {
    setQrImage("");
    let active = true;
    if (trackingUrl)
      QRCode.toDataURL(trackingUrl, {
        width: 360,
        margin: 4,
        errorCorrectionLevel: "M",
        color: { dark: "#143f37", light: "#ffffff" },
      })
        .then((url) => {
          if (active) setQrImage(url);
        })
        .catch(() =>
          toast.error(
            "QR code could not be generated. Use the tracking link below.",
          ),
        );
    return () => {
      active = false;
    };
  }, [trackingUrl]);
  function openCheck(v: Visit) {
    setForm({
      plate: v.plate,
      driver: v.driver,
      carrier: v.carrier,
      reason: "",
    });
    setDialog({ kind: "checkin", id: v.id });
    setDetail("");
  }
  function weigh(v: Visit) {
    setView(v.direction);
    setWeighId(v.id);
    setPlant(v.plant);
    setDate(v.date);
    setDetail("");
    setWeight("");
    setManualReason("");
  }
  const active =
    state?.visits.filter(
      (v) =>
        v.plant === plant &&
        v.date === date &&
        v.direction === direction &&
        (queueType === "return"
          ? v.lines.some((line) => line.type === "RD")
          : queueType === "inbound"
            ? !v.lines.some((line) => line.type === "RD")
            : true),
    ) ?? [];
  const shown = active
    .filter(
      (v) =>
        (filter === "all" ||
          (filter === "gate" &&
            ["waiting", "called", "held"].includes(v.stage)) ||
          (filter === "expected" && v.stage === "scheduled") ||
          (filter === "processing" &&
            ![
              "scheduled",
              "waiting",
              "called",
              "held",
              "completed",
              "rejected",
            ].includes(v.stage)) ||
          (filter === "completed" &&
            ["completed", "rejected"].includes(v.stage))) &&
        (queueType === "return" || orderType === "all" || v.lines.some((l) => l.type === orderType)) &&
        [
          v.plate,
          v.driver,
          v.origin,
          ticket(v),
          ...v.lines.flatMap((l) => [l.document, l.material, l.description]),
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase().trim()),
    )
    .sort((a, b) => a.time.localeCompare(b.time));
  const next = active.filter((v) => v.stage === "waiting").sort(
    (a, b) => (a.arrivedAt ?? "").localeCompare(b.arrivedAt ?? "") || (a.ticket ?? 0) - (b.ticket ?? 0),
  )[0] ?? null,
    called = active.find((v) => v.stage === "called");
  const waiting = active
    .filter((v) => v.stage === "waiting")
    .sort((a, b) => (a.arrivedAt ?? "").localeCompare(b.arrivedAt ?? ""));
  const selected = state?.visits.find((v) => v.id === detail);
  const weighCandidates =
    state?.visits.filter(
      (v) => v.direction === view && v.plant === plant && v.date === date,
    ) ?? [];
  const weighing =
    weighCandidates.find((v) => v.id === weighId) ??
    weighCandidates.find((v) =>
      ["first_weigh", "second_weigh"].includes(v.stage),
    ) ??
    weighCandidates[0];
  const reviews =
    state?.visits.filter(
      (v) =>
        v.result && !v.result.within && v.plant === plant && v.date === date,
    ) ?? [];
  const review =
    reviews.find((v) => v.id === reviewId) ??
    reviews.find((v) => v.stage === "approval") ??
    reviews[0];
  const email = state?.notifications.find((n) => n.id === emailId);
  const heading: Record<View, [string, string]> = {
    queue: [
      "Truck queue",
      "Scheduled deliveries, arrivals, and calls to the weighbridge.",
    ],
    inbound: [
      "Inbound weighing",
      "Loaded truck in. Empty truck out. Verify the delivered cargo.",
    ],
    outbound: [
      "Outbound weighing",
      "Empty truck in. Loaded truck out. Verify the dispatched cargo.",
    ],
    approvals: [
      "Weight exceptions",
      "Review variances and record an authorized delivery decision.",
    ],
    tracking: [
      "Trucker passes",
      "A QR pass for every inbound and outbound delivery.",
    ],
    settings: [
      "Configuration Settings",
      "Configure tolerance hierarchy, company process steps, and approval routing.",
    ],
  };

  return (
    <div className="app-shell">
      <Toaster theme="light" position="bottom-right" richColors />
      <header className="topbar">
        <a href="/" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-logo" src="/sanmiguel-logo.png" alt="San Miguel Foods" />
        </a>
        <span className="topbar-divider" />
        <span className="app-name">Truck Scale</span>
        <div className="topbar-right">
          <a className="board-link" href="/board" target="_blank" rel="noreferrer">
            <Monitor size={17} /> Status board
          </a>
          {state && (
            <span className="module-label">
              <UserCircle size={17} /> {state.actor.name} Â· {state.actor.role}
              {!state.actor.isAdmin && " Â· " + state.actor.plant}
            </span>
          )}
          <button
            className="btn btn-outline"
            onClick={async () => {
              await fetch("/api/logout", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </header>
      <div className="demo-banner">
        <span>
          <span className="demo-pill">DEMO</span> Sample SAP orders Â· Shared
          saved workflow Â· Simulated weighbridge
        </span>
        {state?.actor.isAdmin && (
          <button onClick={() => setView("settings")}>
            <Mail size={14} /> Email preview only <ChevronRight size={14} />
          </button>
        )}
      </div>
      {state?.actor.isAdmin && (
        <div className="public-demo-notice" role="note">
          <ShieldCheck size={19} />
          <span>
            <strong>Shared demo workflow.</strong> Changes made here are shared
            with every signed-in operator. Do not enter real or confidential
            information.
          </span>
          <button
            className="btn btn-outline"
            disabled={busy || !state}
            onClick={async () => {
              if (
                !window.confirm(
                  "Reset all shared demo changes and restore the sample trucks?",
                )
              )
                return;
              if (await run({ kind: "reset" }, "Sample data reset")) {
                setPlant("PAG");
                setDate(today);
                setView("queue");
                setDetail("");
                setReviewId("");
                setWeighId("");
              }
            }}
          >
            <RefreshCw size={15} /> Reset sample data
          </button>
        </div>
      )}
      <Tabs
        value={view}
        onValueChange={(value) => {
          setView(value as View);
          setDetail("");
        }}
      >
        <nav className="module-navigation">
          <TabsList variant="line">
            {[
              ["queue", "Truck queue", ListOrdered],
              ["inbound", "Inbound weighing", ArrowDownToLine],
              ["outbound", "Outbound weighing", ArrowUpFromLine],
              ["approvals", "Approvals", ShieldCheck],
              ["tracking", "QR tracking", QrCode],
              ["settings", "Settings", Settings2],
            ]
              .filter(([id]) => id !== "settings" || state?.actor.isAdmin)
              .filter(
                ([id]) => id !== "approvals" || state?.actor.role !== "operator",
              )
              .map(([id, label, Icon]) => {
              const I = Icon as typeof TruckIcon;
              return (
                <TabsTrigger key={id as string} value={id as string}>
                  <I size={16} />
                  {label as string}
                  {id === "approvals" && state && (
                    <span className="tab-count">
                      {
                        state.visits.filter((v) => v.stage === "approval")
                          .length
                      }
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </nav>
        <main className="workspace">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="red-line" />{" "}
                {view === "approvals"
                  ? "SUPERVISOR WORKSPACE"
                  : "SITE OPERATIONS"}
              </div>
              <h1>
                {heading[view][0]}
                <span className="title-dot">.</span>
              </h1>
              <p>{heading[view][1]}</p>
            </div>
            <div className="heading-actions">
              <button
                className="btn btn-outline"
                onClick={() => void refresh()}
                disabled={busy}
              >
                <RefreshCw size={16} /> Refresh
              </button>
              {view === "queue" && queueType === "inbound" && state &&
                (state.actor.isAdmin || state.actor.direction !== "outbound") && (
                  <>
                    <input
                      ref={importInput}
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      hidden
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        setImportError("");
                        try {
                          setImportRows(await parseInboundWorkbook(file));
                        } catch (error) {
                          setImportError(error instanceof Error ? error.message : "Unable to read the Excel workbook.");
                          toast.error(error instanceof Error ? error.message : "Unable to read the Excel workbook.");
                        }
                      }}
                    />
                    <button className="btn btn-outline" onClick={() => importInput.current?.click()} disabled={importBusy}>
                      <Upload size={16} /> Upload inbound Excel
                    </button>
                  </>
                )}
              {view === "queue" && (
                <button
                  className="btn btn-primary"
                  disabled={
                    busy || !active.some((v) => v.stage === "scheduled")
                  }
                  onClick={() => {
                    const v = active.find((v) => v.stage === "scheduled");
                    if (v) openCheck(v);
                  }}
                >
                  <TruckIcon size={18} /> Check in truck
                </button>
              )}
            </div>
          </div>
          {loadError && (
            <div className="service-error" role="alert">
              {loadError}{" "}
              <button onClick={() => void refresh()}>Try again</button>
            </div>
          )}
          {!state ? (
            <div className="loading-panel">
              <Loader2 className="animate-spin" size={25} />
              <p>
                {loadError
                  ? "The saved workflow could not be loaded."
                  : "Loading the saved truck scale workflowâ€¦"}
              </p>
            </div>
          ) : (
            <>
              <div className="location-bar">
                <div className="location-controls">
                  <MapPin size={18} className="muted" />
                  <Pick
                    value={plant}
                    onChange={setPlant}
                    label="Receiving or dispatch site"
                    className="site-select"
                    disabled={!state.actor.isAdmin}
                  >
                    {state.sites.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </Pick>
                  <span className="control-divider" />
                  <label className="sr-only" htmlFor="delivery-date">
                    Delivery date
                  </label>
                  <input
                    id="delivery-date"
                    type="date"
                    value={date}
                    onChange={(e) => {
                      if (e.target.value) setDate(e.target.value);
                    }}
                  />
                  {date !== state.sampleDate && (
                    <button
                      className="text-button"
                      onClick={() => setDate(state.sampleDate)}
                    >
                      Sample day
                    </button>
                  )}
                </div>
                <span className="clock-label">
                  <CheckCheck size={15} /> Saved Â· Refreshes every 15 seconds
                </span>
              </div>
              <TabsContent value={view}>
                {view === "queue" && (
                  <>
                    <div className="direction-switch">
                      <Pick
                        value={queueType}
                        onChange={(v) => {
                          const selected = v as "inbound" | "outbound" | "return";
                          setQueueType(selected);
                          setDirection(selected === "outbound" ? "outbound" : "inbound");
                          setOrderType("all");
                        }}
                        label="Delivery queue"
                        disabled={!state.actor.isAdmin && state.actor.direction !== "both" && state.actor.direction !== "inbound"}
                      >
                        <SelectItem value="inbound" disabled={!state.actor.isAdmin && state.actor.direction !== "both" && state.actor.direction !== "inbound"}>
                          Inbound deliveries
                        </SelectItem>
                        <SelectItem value="outbound" disabled={!state.actor.isAdmin && state.actor.direction !== "both" && state.actor.direction !== "outbound"}>
                          Outbound deliveries
                        </SelectItem>
                        <SelectItem value="return" disabled={!state.actor.isAdmin && state.actor.direction !== "both" && state.actor.direction !== "inbound" && state.actor.direction !== "return"}>
                          Return Delivery
                        </SelectItem>
                      </Pick>
                      <span>
                        {queueType === "return"
                          ? "Return Delivery - inbound weighing"
                          : direction === "inbound"
                            ? "Purchase orders & stock transport orders"
                            : "Delivery orders"}
                      </span>
                    </div>
                    <section className="metrics">
                      <div className="metric">
                        <div>
                          <span>Scheduled deliveries</span>
                          <strong>{active.length}</strong>
                        </div>
                        <CalendarIcon />
                        <small>For this site, date and direction</small>
                      </div>
                      <div className="metric">
                        <div>
                          <span>Awaiting arrival</span>
                          <strong>
                            {
                              active.filter((v) => v.stage === "scheduled")
                                .length
                            }
                          </strong>
                        </div>
                        <TruckIcon />
                        <small>Not yet checked in</small>
                      </div>
                      <div className="metric metric-emphasis">
                        <div>
                          <span>Trucks at gate</span>
                          <strong>
                            {
                              active.filter((v) =>
                                ["waiting", "held", "called"].includes(v.stage),
                              ).length
                            }
                          </strong>
                        </div>
                        <ListOrdered />
                        <small>
                          {waiting.length} waiting Â·{" "}
                          {active.filter((v) => v.stage === "held").length} on
                          hold
                        </small>
                      </div>
                      <div className="metric">
                        <div>
                          <span>Weight exceptions</span>
                          <strong>
                            {
                              active.filter((v) => v.stage === "approval")
                                .length
                            }
                          </strong>
                        </div>
                        <ShieldCheck />
                        <small>Awaiting supervisor decision</small>
                      </div>
                    </section>
                    <div className="operations-grid">
                      <section className="schedule-panel">
                        <div className="panel-heading">
                          <h2>Delivery schedule</h2>
                          <span className="small-description">
                            {queueType === "return"
                              ? "Return delivery"
                              : direction === "inbound"
                                ? "PO / STO"
                                : "Delivery order"}{" "}
                            references
                          </span>
                        </div>
                        <div className="table-tools">
                          <div className="search-box">
                            <Search size={17} />
                            <input
                              aria-label="Search deliveries"
                              placeholder="Truck, supplier, material or documentâ€¦"
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                            />
                          </div>
                          <Pick
                            value={filter}
                            onChange={setFilter}
                            label="Process status"
                          >
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="gate">At gate</SelectItem>
                            <SelectItem value="expected">Expected</SelectItem>
                            <SelectItem value="processing">
                              In process
                            </SelectItem>
                            <SelectItem value="completed">
                              Completed / rejected
                            </SelectItem>
                          </Pick>
                          {direction === "inbound" && queueType !== "return" && (
                            <Pick
                              value={orderType}
                              onChange={setOrderType}
                              label="Order type"
                            >
                              <SelectItem value="all">PO & STO</SelectItem>
                              <SelectItem value="PO">PO only</SelectItem>
                              <SelectItem value="STO">STO only</SelectItem>
                            </Pick>
                          )}
                        </div>
                        <Table className="delivery-table">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Scheduled</TableHead>
                              <TableHead>Truck / queue</TableHead>
                              <TableHead>
                                {direction === "inbound"
                                  ? "Supplier / sending plant"
                                  : "Destination"}
                              </TableHead>
                              <TableHead>Material / planned qty</TableHead>
                              <TableHead>Process step</TableHead>
                              <TableHead>
                                <span className="sr-only">Details</span>
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {shown.map((v) => (
                              <TableRow
                                key={v.id}
                                className={
                                  v.stage === "called" ? "called-row" : ""
                                }
                              >
                                <TableCell>
                                  <span className="mono">{v.time}</span>
                                  <span className="cell-secondary">
                                    {v.arrivedAt
                                      ? "In " + clock(v.arrivedAt)
                                      : "Not arrived"}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <button
                                    className="plate-link"
                                    onClick={() => setDetail(v.id)}
                                  >
                                    {v.plate || "Unassigned"}
                                  </button>
                                  <span className="cell-secondary mono">
                                    {ticket(v)}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <span className="cell-primary">
                                    {v.origin}
                                  </span>
                                  <span className="cell-secondary order-reference">
                                    <span
                                      className={
                                        "doc-type " +
                                        (v.lines[0].type === "STO" ? "sto" : "")
                                      }
                                    >
                                      {v.lines[0].type}
                                    </span>
                                    <span className="mono">
                                      {v.lines[0].document}
                                    </span>
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <span className="cell-primary">
                                    {v.lines[0].description}
                                  </span>
                                  <span className="cell-secondary quantity">
                                    {kg(v.lines[0].quantity)} {v.lines[0].unit}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <Badge visit={v} />
                                </TableCell>
                                <TableCell>
                                  {v.stage === "scheduled" ? (
                                    <button
                                      className="row-check"
                                      disabled={busy}
                                      onClick={() => openCheck(v)}
                                    >
                                      Check in
                                    </button>
                                  ) : (
                                    <button
                                      className="icon-button"
                                      onClick={() => setDetail(v.id)}
                                      aria-label={"Details for " + v.plate}
                                    >
                                      <ChevronRight size={18} />
                                    </button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {!shown.length && (
                          <EmptyMessage text="No deliveries match this site, date and filter." />
                        )}
                        <div className="table-footer">
                          <span>{shown.length} deliveries</span>
                          <span>Philippine time (UTC+8)</span>
                        </div>
                      </section>
                      <aside className="queue-aside">
                        <section className="call-card">
                          <div className="call-card-label">
                            <span className="signal-dot" />
                            <span>
                              {called
                                ? "CALLED TO WEIGHBRIDGE"
                                : "READY TO CALL"}
                            </span>
                            <Megaphone size={18} />
                          </div>
                          {called ? (
                            <>
                              <div className="big-ticket mono">
                                {ticket(called)}
                              </div>
                              <button
                                className="called-plate"
                                onClick={() => setDetail(called.id)}
                              >
                                {called.plate}
                                <ChevronRight size={18} />
                              </button>
                              <div className="call-origin">
                                {called.direction} Â· {called.origin}
                              </div>
                              <button
                                className="btn btn-call mt-6"
                                disabled={busy}
                                onClick={() =>
                                  void run(
                                    { kind: "send", id: called.id },
                                    "Truck sent to weighbridge",
                                  )
                                }
                              >
                                Send to scale <ArrowRight size={17} />
                              </button>
                              <button
                                className="call-secondary"
                                onClick={() => {
                                  setDialog({ kind: "hold", id: called.id });
                                  setForm({
                                    plate: "",
                                    driver: "",
                                    carrier: "",
                                    reason: "",
                                  });
                                }}
                              >
                                Place on hold
                              </button>
                            </>
                          ) : (
                            <>
                              <div className="ready-icon">
                                <TruckIcon size={36} />
                              </div>
                              <h3>
                                {next
                                  ? "Next truck is ready"
                                  : "Queue is clear"}
                              </h3>
                              <p>
                                {next
                                  ? ticket(next) + " Â· " + next.plate
                                  : "Arriving trucks will appear here."}
                              </p>
                              <button
                                className="btn btn-call"
                                disabled={busy || !next}
                                onClick={() =>
                                  next &&
                                  void run(
                                    { kind: "call", id: next.id },
                                    "Next truck called",
                                  )
                                }
                              >
                                Call next truck <Megaphone size={17} />
                              </button>
                            </>
                          )}
                        </section>
                        <section className="next-panel">
                          <div className="aside-heading">
                            <h2>Up next</h2>
                            <span className="count-badge">
                              {waiting.length}
                            </span>
                          </div>
                          <p className="small-description">
                            In order of arrival Â· {direction}
                          </p>
                          <ol className="next-list">
                            {waiting.map((v, i) => (
                              <li key={v.id}>
                                <button onClick={() => setDetail(v.id)}>
                                  <span
                                    className={
                                      "queue-position " +
                                      (i === 0 ? "first" : "")
                                    }
                                  >
                                    {String(i + 1).padStart(2, "0")}
                                  </span>
                                  <span className="next-truck">
                                    <strong>{v.plate}</strong>
                                    <span>
                                      {ticket(v)} Â· {v.lines[0].description}
                                    </span>
                                  </span>
                                  <QrCode size={15} />
                                </button>
                              </li>
                            ))}
                          </ol>
                        </section>
                        <div className="source-notice">
                          <strong>One ticket per product</strong>
                          <p>
                            Inbound: loaded â†’ unload product â†’ weigh again.
                            <br />
                            Outbound: empty â†’ load product â†’ weigh again. Repeat
                            for every material on the truck.
                          </p>
                        </div>
                      </aside>
                    </div>
                  </>
                )}

                {(view === "inbound" || view === "outbound") && (
                  <div className="weighing-layout">
                    <aside className="visit-picker">
                      <h2>
                        {view === "inbound" ? "Inbound" : "Outbound"} trucks
                      </h2>
                      <p className="small-description">
                        Select a truck to continue
                      </p>
                      {weighCandidates.map((v) => (
                        <button
                          key={v.id}
                          className={
                            "visit-choice " +
                            (weighing?.id === v.id ? "chosen" : "")
                          }
                          onClick={() => {
                            setWeighId(v.id);
                            setWeight("");
                            setManualReason("");
                          }}
                        >
                          <span>
                            <strong>{v.plate || "Unassigned"}</strong>
                            <small>
                              {v.lines[0].type} {v.lines[0].document}
                            </small>
                          </span>
                          <Badge visit={v} />
                        </button>
                      ))}
                      {!weighCandidates.length && (
                        <EmptyMessage text="No deliveries for this site and date." />
                      )}
                    </aside>
                    <section className="weighing-main">
                      {weighing ? (
                        <>
                          <div className="weigh-title">
                            <div>
                              <span className="eyebrow">
                                {ticket(weighing)} Â· {weighing.lines[0].type}{" "}
                                {weighing.lines[0].document}
                              </span>
                              <h2>{weighing.plate || "Unassigned truck"}</h2>
                              <p>
                                {weighing.origin} Â·{" "}
                                {weighing.lines[0].description}
                              </p>
                            </div>
                            <button
                              className="btn btn-outline"
                              onClick={() => setQrId(weighing.id)}
                            >
                              <QrCode size={17} /> Trucker pass
                            </button>
                          </div>
                          <ProcessSteps state={state} visit={weighing} />
                          <div className="weigh-data-grid">
                            <div>
                              <span>Total order reference weight</span>
                              <strong>
                                {kg(weighing.expectedKg)} <small>kg</small>
                              </strong>
                              <p>
                                {weighing.productTickets.length} product ticket
                                {weighing.productTickets.length === 1 ? "" : "s"}
                              </p>
                            </div>
                            <div>
                              <span>Initial truck weight</span>
                              <strong>
                                {kg(weighing.readings[0]?.kg)}{" "}
                                <small>kg</small>
                              </strong>
                              <p>
                                {view === "inbound"
                                  ? "Loaded before unloading"
                                  : "Empty before loading"}
                              </p>
                            </div>
                            <div>
                              <span>Latest truck weight</span>
                              <strong>
                                {kg(weighing.readings.at(-1)?.kg)}{" "}
                                <small>kg</small>
                              </strong>
                              <p>
                                {weighing.productTickets.filter((item) => item.result).length}{" "}
                                material ticket
                                {weighing.productTickets.filter((item) => item.result).length === 1
                                  ? ""
                                  : "s"}{" "}
                                completed
                              </p>
                            </div>
                          </div>
                          <ProductTicketList visit={weighing} />
                          {["first_weigh", "second_weigh"].includes(
                            weighing.stage,
                          ) && (
                            <section className="capture-panel">
                              <div className="scale-display">
                                <div>
                                  <span className="eyebrow">
                                    {weighing.stage === "first_weigh"
                                      ? "INITIAL TRUCK WEIGHT"
                                      : "PRODUCT TICKET " +
                                        (weighing.activeTicket + 1) +
                                        " OF " +
                                        weighing.productTickets.length}
                                  </span>
                                  <h3>
                                    {weighing.stage === "first_weigh"
                                      ? "Capture " +
                                        (weighing.direction === "inbound"
                                          ? "loaded"
                                          : "empty") +
                                        " truck weight"
                                      : "Weigh after " +
                                        (weighing.direction === "inbound"
                                          ? "unloading "
                                          : "loading ") +
                                        weighing.productTickets[
                                          weighing.activeTicket
                                        ].line.description}
                                  </h3>
                                  <p>
                                    Keep the truck stationary and fully on the
                                    weighbridge.
                                  </p>
                                </div>
                                <Scale size={45} strokeWidth={1.3} />
                              </div>
                              <div className="capture-form">
                                <label>
                                  Capture method
                                  <Pick
                                    value={source}
                                    onChange={setSource}
                                    label="Weight capture method"
                                    className="full-width"
                                  >
                                    <SelectItem value="simulator">
                                      Demo weighbridge simulator
                                    </SelectItem>
                                    <SelectItem value="manual">
                                      Manual weight entry
                                    </SelectItem>
                                    <SelectItem
                                      value="scale"
                                      disabled={
                                        !state.capabilities.scaleConfigured
                                      }
                                    >
                                      Connected weighbridge
                                      {!state.capabilities.scaleConfigured
                                        ? " Â· not connected"
                                        : ""}
                                    </SelectItem>
                                  </Pick>
                                </label>
                                {source === "simulator" &&
                                  weighing.stage === "second_weigh" && (
                                  <label>
                                    Demonstration scenario
                                    <Pick
                                      value={scenario}
                                      onChange={setScenario}
                                      label="Demo weight scenario"
                                      className="full-width"
                                    >
                                      <SelectItem value="within">
                                        Within tolerance (+0.1%)
                                      </SelectItem>
                                      <SelectItem value="shortage">
                                        Short delivery (âˆ’3.5%)
                                      </SelectItem>
                                      <SelectItem value="excess">
                                        Excess delivery (+2.5%)
                                      </SelectItem>
                                    </Pick>
                                    <small>
                                      The scenario applies only to this product
                                      ticket. Each material is compared
                                      separately with its matched tolerance.
                                    </small>
                                  </label>
                                  )}
                                {source === "manual" && (
                                  <>
                                    <label>
                                      Scale weight (kg)
                                      <input
                                        aria-label="Scale weight in kilograms"
                                        type="number"
                                        min="0.01"
                                        max="200000"
                                        step="0.01"
                                        value={weight}
                                        onChange={(e) =>
                                          setWeight(e.target.value)
                                        }
                                        placeholder="Enter displayed scale weight"
                                      />
                                    </label>
                                    <label>
                                      Manual entry reason
                                      <input
                                        value={manualReason}
                                        onChange={(e) =>
                                          setManualReason(e.target.value)
                                        }
                                        maxLength={1000}
                                        placeholder="e.g. Scale interface unavailable; read from display"
                                      />
                                    </label>
                                  </>
                                )}
                                <button
                                  className="btn btn-primary"
                                  disabled={
                                    busy ||
                                    (source === "manual" &&
                                      (!weight || !manualReason.trim()))
                                  }
                                  onClick={async () => {
                                    if (
                                      await run(
                                        {
                                          kind: "capture",
                                          id: weighing.id,
                                          source,
                                          scenario,
                                          ...(source === "manual"
                                            ? {
                                                weightKg: Number(weight),
                                                reason: manualReason,
                                              }
                                            : {}),
                                        },
                                        "Weight captured and saved",
                                      )
                                    ) {
                                      setWeight("");
                                      setManualReason("");
                                    }
                                  }}
                                >
                                  <Scale size={18} />{" "}
                                  {busy
                                    ? "Savingâ€¦"
                                    : source === "simulator"
                                      ? "Capture simulated weight"
                                      : "Capture weight"}
                                </button>
                                <p className="capture-note">
                                  {source === "simulator"
                                    ? "Simulation is clearly recorded in the weighing history. No physical scale is connected."
                                    : source === "manual"
                                      ? "The entered value, reason, time and signed-in operator are recorded."
                                      : "Only a stable, recent reading from the configured scale gateway will be accepted."}
                                </p>
                              </div>
                            </section>
                          )}
                          {weighing.stage === "handling" && (
                            <section className="next-action-panel">
                              <Package size={30} />
                              <div>
                                <h3>
                                  {view === "inbound" ? "Unload" : "Load"}{" "}
                                  product {weighing.activeTicket + 1} of{" "}
                                  {weighing.productTickets.length}:{" "}
                                  {
                                    weighing.productTickets[
                                      weighing.activeTicket
                                    ].line.description
                                  }
                                </h3>
                                <p>
                                  {view === "inbound"
                                    ? "Unload only this product, then return the truck to the scale. The weight difference becomes this materialâ€™s ticket quantity."
                                    : "Load only this product, then return the truck to the scale. The weight increase becomes this materialâ€™s ticket quantity."}
                                </p>
                                <button
                                  className="btn btn-primary"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(
                                      {
                                        kind: "handling_done",
                                        id: weighing.id,
                                      },
                                      "Truck ready for product ticket weighing",
                                    )
                                  }
                                >
                                  {view === "inbound"
                                    ? "Confirm this product is unloaded"
                                    : "Confirm this product is loaded"}{" "}
                                  <ArrowRight size={17} />
                                </button>
                              </div>
                            </section>
                          )}
                          <WeightResult visit={weighing} />
                          {weighing.stage === "approval" && (
                            <div className="workflow-callout">
                              <ShieldCheck size={22} />
                              <div>
                                <strong>
                                  Release is blocked until supervisor approval.
                                </strong>
                                <p>
                                  {view === "inbound"
                                    ? "For inbound deliveries, each product net weight is confirmed as it is unloaded. Rejection requires site instructions for the goods and truck."
                                    : "The truck must not leave with an unresolved weight exception."}
                                </p>
                                <button
                                  className="text-button"
                                  onClick={() => {
                                    setReviewId(weighing.id);
                                    setView("approvals");
                                  }}
                                >
                                  Review exception
                                </button>
                              </div>
                            </div>
                          )}
                          {weighing.stage === "cleared" && (
                            <button
                              className="btn btn-primary"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  { kind: "complete", id: weighing.id },
                                  "Gate exit recorded",
                                )
                              }
                            >
                              <CheckCheck size={18} /> Record gate exit
                            </button>
                          )}
                          {["scheduled", "waiting", "called", "held"].includes(
                            weighing.stage,
                          ) && (
                            <div className="workflow-callout">
                              <ListOrdered size={22} />
                              <div>
                                <strong>{stageLabel(weighing)}</strong>
                                <p>
                                  Complete the gate queue steps before weighing
                                  this truck.
                                </p>
                                <button
                                  className="text-button"
                                  onClick={() => {
                                    setDirection(weighing.direction);
                                    setView("queue");
                                    setDetail(weighing.id);
                                  }}
                                >
                                  Open gate details
                                </button>
                              </div>
                            </div>
                          )}
                          <ReadingHistory visit={weighing} />
                        </>
                      ) : (
                        <EmptyMessage text="Select a site and date with scheduled deliveries." />
                      )}
                    </section>
                  </div>
                )}

                {view === "approvals" && (
                  <div className="approval-layout">
                    <aside className="visit-picker">
                      <h2>Delivery exceptions</h2>
                      <p className="small-description">
                        Inbound and outbound Â·{" "}
                        {reviews.filter((v) => v.stage === "approval").length}{" "}
                        awaiting decision
                      </p>
                      {reviews.map((v) => (
                        <button
                          key={v.id}
                          className={
                            "visit-choice " +
                            (review?.id === v.id ? "chosen" : "")
                          }
                          onClick={() => {
                            setReviewId(v.id);
                            setDecisionReason("");
                          }}
                        >
                          <span>
                            <strong>{v.plate}</strong>
                            <small>
                              {v.direction} Â· {v.lines[0].document}
                            </small>
                            <em>
                              {kg(v.result!.variance)} kg Â·{" "}
                              {v.result!.percent.toFixed(2)}%
                            </em>
                          </span>
                          <Badge visit={v} />
                        </button>
                      ))}
                      {!reviews.length && (
                        <EmptyMessage text="No weight exceptions for this site and date." />
                      )}
                    </aside>
                    <section className="weighing-main">
                      {review ? (
                        <>
                          <div className="weigh-title">
                            <div>
                              <span className="eyebrow">
                                {review.direction.toUpperCase()} Â·{" "}
                                {review.lines[0].type}{" "}
                                {review.lines[0].document}
                              </span>
                              <h2>{review.plate}</h2>
                              <p>{review.origin}</p>
                            </div>
                            <button
                              className="btn btn-outline"
                              onClick={() => setDetail(review.id)}
                            >
                              <FileText size={17} /> History
                            </button>
                          </div>
                          <ProductTicketList visit={review} />
                          <WeightResult visit={review} />
                          {review.stage === "approval" && (
                            <section className="decision-panel">
                              <div className="aside-heading">
                                <h3>
                                  <ShieldCheck size={21} /> Supervisor decision
                                </h3>
                                <span className="small-description">
                                  {canApprove(state.actor, review)
                                    ? "Authorized: " + state.actor.name
                                    : "Supervisor access required"}
                                </span>
                              </div>
                              <label htmlFor="decision-reason">
                                Reason for approval or rejection
                              </label>
                              <textarea
                                id="decision-reason"
                                value={decisionReason}
                                onChange={(e) =>
                                  setDecisionReason(e.target.value)
                                }
                                maxLength={1000}
                                placeholder="Record your assessment and instructions for the site team."
                                disabled={
                                  !canApprove(state.actor, review)
                                }
                              />
                              <div className="decision-buttons">
                                <button
                                  className="btn btn-reject"
                                  disabled={
                                    busy ||
                                    !decisionReason.trim() ||
                                    !canApprove(state.actor, review)
                                  }
                                  onClick={async () => {
                                    if (
                                      await run(
                                        {
                                          kind: "reject",
                                          id: review.id,
                                          reason: decisionReason,
                                        },
                                        "Delivery rejected",
                                      )
                                    )
                                      setDecisionReason("");
                                  }}
                                >
                                  <X size={18} /> Reject delivery
                                </button>
                                <button
                                  className="btn btn-green"
                                  disabled={
                                    busy ||
                                    !decisionReason.trim() ||
                                    !canApprove(state.actor, review)
                                  }
                                  onClick={async () => {
                                    if (
                                      await run(
                                        {
                                          kind: "approve",
                                          id: review.id,
                                          reason: decisionReason,
                                        },
                                        "Delivery approved",
                                      )
                                    )
                                      setDecisionReason("");
                                  }}
                                >
                                  <Check size={18} /> Approve delivery
                                </button>
                              </div>
                              <p className="capture-note">
                                The decision, reason, supervisor and time are
                                saved. Approval clears this weight exception; it
                                does not post goods receipt or goods issue to
                                SAP.
                              </p>
                            </section>
                          )}
                          <section className="email-panel">
                            <h3>
                              <Mail size={20} /> Supervisor email notifications
                            </h3>
                            {state.notifications
                              .filter((n) => n.visitId === review.id)
                              .map((n) => (
                                <div className="email-row" key={n.id}>
                                  <div>
                                    <strong>
                                      {n.status === "sent"
                                        ? "Accepted by email gateway"
                                        : n.status === "not_configured"
                                          ? "Email not sent Â· connection required"
                                          : n.status.replaceAll("_", " ")}
                                    </strong>
                                    <p>
                                      {n.to.length
                                        ? n.to.join(", ")
                                        : "No assigned supervisors"}
                                    </p>
                                    <small>{n.detail}</small>
                                  </div>
                                  <button
                                    className="btn btn-outline"
                                    onClick={() => setEmailId(n.id)}
                                  >
                                    Preview
                                  </button>
                                </div>
                              ))}
                          </section>
                        </>
                      ) : (
                        <EmptyMessage text="No delivery exceptions need review." />
                      )}
                    </section>
                  </div>
                )}

                {view === "tracking" && (
                  <>
                    <div className="tracking-banner">
                      <QrCode size={27} />
                      <div>
                        <h2>One pass. Every process step.</h2>
                        <p>
                          Truckers scan the QR code with their phone to see
                          their queue position, weighing, loading or unloading,
                          approval, and exit status.
                        </p>
                        <small>
                          Anyone holding the pass can view this truckâ€™s process
                          status. Passes expire after seven days and can be
                          renewed by the gate team.
                        </small>
                      </div>
                    </div>
                    <div className="pass-grid">
                      {state.visits
                        .filter((v) => v.plant === plant && v.date === date)
                        .map((v) => (
                          <article className="pass-card" key={v.id}>
                            <div className="aside-heading">
                              <span className="direction-tag">
                                {v.direction}
                              </span>
                              <Badge visit={v} />
                            </div>
                            <h3>{v.plate || "Truck not assigned"}</h3>
                            <p className="mono">{ticket(v)}</p>
                            <span>
                              {v.lines[0].type} {v.lines[0].document} Â· {v.time}
                            </span>
                            <button
                              className="btn btn-outline full-width"
                              onClick={() => setQrId(v.id)}
                            >
                              <QrCode size={17} /> Open QR pass
                            </button>
                          </article>
                        ))}
                    </div>
                  </>
                )}
                {view === "settings" && (
                  <SettingsPanel
                    state={state}
                    plant={plant}
                    busy={busy}
                    run={run}
                  />
                )}
              </TabsContent>
            </>
          )}
          <footer className="workspace-footer">
            <span>
              <Factory size={14} /> San Miguel Foods / Truck Scale
            </span>
            <span>
              Net cargo = loaded truck âˆ’ empty truck Â· All comparisons in kg
            </span>
            <span>Powered by DeloitteAutomate</span>
          </footer>
        </main>
      </Tabs>

      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setDetail("");
        }}
      >
        <SheetContent className="truck-sheet">
          {selected && (
            <>
              <SheetHeader>
                <div className="eyebrow">
                  {selected.direction.toUpperCase()} DELIVERY{" "}
                  <span>{selected.id}</span>
                </div>
                <SheetTitle>
                  {selected.plate || "Truck to be assigned"}
                </SheetTitle>
                <SheetDescription>{selected.origin}</SheetDescription>
                <div className="sheet-status">
                  <span className="detail-ticket mono">{ticket(selected)}</span>
                  <Badge visit={selected} />
                </div>
              </SheetHeader>
              <div className="sheet-body">
                <dl className="detail-grid">
                  <div>
                    <dt>Scheduled</dt>
                    <dd>
                      {selected.date} Â· {selected.time}
                    </dd>
                  </div>
                  <div>
                    <dt>Driver</dt>
                    <dd>{selected.driver || "Not assigned"}</dd>
                  </div>
                  <div>
                    <dt>Haulier</dt>
                    <dd>{selected.carrier}</dd>
                  </div>
                  <div>
                    <dt>Expected net cargo</dt>
                    <dd>{kg(selected.expectedKg)} kg</dd>
                  </div>
                </dl>
                {selected.lines.map((l) => (
                  <div className="detail-order" key={l.document + l.item}>
                    <div>
                      <span className="doc-type">{l.type}</span>
                      <strong className="mono">{l.document}</strong>
                      <span>Item {l.item}</span>
                    </div>
                    <h4>{l.description}</h4>
                    <p>
                      {l.material} Â· {kg(l.quantity)} {l.unit}
                    </p>
                  </div>
                ))}
                {selected.holdReason && (
                  <div className="hold-notice">
                    <Pause size={17} />
                    {selected.holdReason}
                  </div>
                )}
                <ProductTicketList visit={selected} />
                <WeightResult visit={selected} />
                <h3 className="history-heading">Process history</h3>
                <ol className="history-list">
                  {selected.events.map((e, i) => (
                    <li key={i}>
                      <time>{clock(e.at)}</time>
                      <span>
                        {e.text}
                        <small>{e.by}</small>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="sheet-actions">
                {selected.stage === "scheduled" && (
                  <button
                    className="btn btn-primary"
                    onClick={() => openCheck(selected)}
                  >
                    Check in truck
                  </button>
                )}
                {state?.actor.isAdmin && selected.direction === "inbound" && selected.stage === "scheduled" && (
                  <>
                    <button className="btn btn-outline" onClick={() => {
                      setEditError("");
                      setEditDraft({
                        id: selected.id,
                        date: selected.date,
                        time: selected.time,
                        supplier: selected.origin,
                        plate: selected.plate,
                        driver: selected.driver,
                        lines: selected.lines.map((line) => ({ ...line })),
                      });
                      setDetail("");
                    }}>Edit scheduled delivery</button>
                    <button className="btn btn-outline" disabled={editBusy} onClick={async () => {
                      if (!window.confirm(`Remove scheduled inbound delivery ${selected.lines[0]?.document}? This cannot be undone.`)) return;
                      setEditBusy(true);
                      try {
                        const response = await fetch("/api/inbound-schedule", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ kind: "delete", id: selected.id, revision: state.revision }),
                        });
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.error || "Unable to remove the delivery.");
                        setDetail("");
                        toast.success("Scheduled delivery removed.");
                        await refresh();
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Unable to remove the delivery.");
                      } finally {
                        setEditBusy(false);
                      }
                    }}>Remove scheduled delivery</button>
                  </>
                )}
                {selected.stage === "called" && (
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        { kind: "send", id: selected.id },
                        "Truck sent to scale",
                      )
                    }
                  >
                    Send to scale
                  </button>
                )}
                {["waiting", "called"].includes(selected.stage) && (
                  <button
                    className="btn btn-outline"
                    disabled={busy}
                    onClick={() => {
                      setDialog({ kind: "hold", id: selected.id });
                      setForm({
                        plate: "",
                        driver: "",
                        carrier: "",
                        reason: "",
                      });
                      setDetail("");
                    }}
                  >
                    Place on hold
                  </button>
                )}
                {selected.stage === "held" && (
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        { kind: "resume", id: selected.id },
                        "Truck returned to queue",
                      )
                    }
                  >
                    Return to queue
                  </button>
                )}
                {[
                  "first_weigh",
                  "second_weigh",
                  "handling",
                  "cleared",
                ].includes(selected.stage) && (
                  <button
                    className="btn btn-primary"
                    onClick={() => weigh(selected)}
                  >
                    <Scale size={17} /> Open weighing screen
                  </button>
                )}
                {selected.stage === "approval" && (
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setReviewId(selected.id);
                      setView("approvals");
                      setDetail("");
                    }}
                  >
                    Review variance
                  </button>
                )}
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    setQrId(selected.id);
                    setDetail("");
                  }}
                >
                  <QrCode size={17} /> Trucker QR pass
                </button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog
        open={!!editDraft}
        onOpenChange={(open) => {
          if (!open && !editBusy) { setEditDraft(null); setEditError(""); }
        }}
      >
        <DialogContent className="checkin-dialog">
          <DialogHeader>
            <DialogTitle>Edit scheduled inbound delivery</DialogTitle>
            <DialogDescription>Correct delivery details or product rows. Edits are available only before check-in.</DialogDescription>
          </DialogHeader>
          {editDraft && (
            <div className="checkin-form">
              {editError && <p className="form-error">{editError}</p>}
              <div className="form-grid">
                <label>Date<input type="date" value={editDraft.date} onChange={(event) => setEditDraft({ ...editDraft, date: event.target.value })} /></label>
                <label>Time<input type="time" value={editDraft.time} onChange={(event) => setEditDraft({ ...editDraft, time: event.target.value })} /></label>
                <label>Supplier<input maxLength={150} value={editDraft.supplier} onChange={(event) => setEditDraft({ ...editDraft, supplier: event.target.value })} /></label>
                <label>Truck plate<input maxLength={20} value={editDraft.plate} onChange={(event) => setEditDraft({ ...editDraft, plate: event.target.value.toUpperCase() })} /></label>
                <label>Driver name<input maxLength={100} value={editDraft.driver} onChange={(event) => setEditDraft({ ...editDraft, driver: event.target.value })} /></label>
              </div>
              <h3>Products</h3>
              {editDraft.lines.map((line, index) => (
                <div className="form-grid" key={index}>
                  <label>Type<Pick value={line.type} onChange={(value) => setEditDraft({ ...editDraft, lines: editDraft.lines.map((item, i) => i === index ? { ...item, type: value as VisitLine["type"] } : item) })} label={`Product ${index + 1} document type`}><SelectItem value="PO">PO</SelectItem><SelectItem value="STO">STO</SelectItem><SelectItem value="RD">Return Delivery</SelectItem></Pick></label>
                  <label>Document<input maxLength={60} value={line.document} onChange={(event) => setEditDraft({ ...editDraft, lines: editDraft.lines.map((item, i) => i === index ? { ...item, document: event.target.value } : item) })} /></label>
                  <label>Item<input maxLength={20} value={line.item} onChange={(event) => setEditDraft({ ...editDraft, lines: editDraft.lines.map((item, i) => i === index ? { ...item, item: event.target.value } : item) })} /></label>
                  <label>Product code<input maxLength={80} value={line.material} onChange={(event) => setEditDraft({ ...editDraft, lines: editDraft.lines.map((item, i) => i === index ? { ...item, material: event.target.value } : item) })} /></label>
                  <label>Product<input maxLength={150} value={line.description} onChange={(event) => setEditDraft({ ...editDraft, lines: editDraft.lines.map((item, i) => i === index ? { ...item, description: event.target.value } : item) })} /></label>
                  <label>Expected net cargo (kg)<input type="number" min="0.01" max="200000" step="0.01" value={line.quantity} onChange={(event) => setEditDraft({ ...editDraft, lines: editDraft.lines.map((item, i) => i === index ? { ...item, quantity: Number(event.target.value) } : item) })} /></label>
                  <button className="text-button" type="button" disabled={editDraft.lines.length <= 1} onClick={() => setEditDraft({ ...editDraft, lines: editDraft.lines.filter((_, i) => i !== index) })}>Remove product row</button>
                </div>
              ))}
              <button className="text-button" type="button" onClick={() => setEditDraft({ ...editDraft, lines: [...editDraft.lines, { type: "PO", document: editDraft.lines[0]?.document ?? "", item: String(editDraft.lines.length + 1).padStart(5, "0"), material: "", description: "", quantity: 1, unit: "KG" }] })}>Add product row</button>
              <div className="form-actions">
                <button className="btn btn-outline" disabled={editBusy} onClick={() => setEditDraft(null)}>Cancel</button>
                <button className="btn btn-primary" disabled={editBusy} onClick={async () => {
                  if (!state || !editDraft) return;
                  setEditBusy(true);
                  setEditError("");
                  try {
                    const response = await fetch("/api/inbound-schedule", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ kind: "edit", revision: state.revision, ...editDraft }),
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || "Unable to update the delivery.");
                    setDate(editDraft.date);
                    setEditDraft(null);
                    toast.success("Scheduled delivery updated.");
                    await refresh();
                  } catch (error) {
                    setEditError(error instanceof Error ? error.message : "Unable to update the delivery.");
                  } finally {
                    setEditBusy(false);
                  }
                }}>Save changes</button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!importRows}
        onOpenChange={(open) => {
          if (!open && !importBusy) setImportRows(null);
        }}
      >
        <DialogContent className="checkin-dialog">
          <DialogHeader>
            <DialogTitle>Review inbound schedule upload</DialogTitle>
            <DialogDescription>
              {importRows?.length ?? 0} product rows for {plant}. Rows with the same date, time, type, document, supplier, plate, and driver become one delivery.
            </DialogDescription>
          </DialogHeader>
          {importError && <p className="form-error">{importError}</p>}
          <div className="table-scroll">
            <table className="delivery-table">
              <thead><tr><th>Date / time</th><th>Type / document</th><th>Plate</th><th>Product</th><th>Expected kg</th></tr></thead>
              <tbody>
                {(importRows ?? []).slice(0, 12).map((row, index) => (
                  <tr key={index}><td>{row.date} {row.time}</td><td>{row.type} {row.document}</td><td>{row.plate || "Unassigned"}</td><td>{row.material} - {row.product}</td><td>{row.quantity.toLocaleString()}</td></tr>
                ))}
              </tbody>
            </table>
            {(importRows?.length ?? 0) > 12 && <p className="small-description">Showing the first 12 rows; all rows will be imported.</p>}
          </div>
          <div className="form-actions">
            <button className="btn btn-outline" disabled={importBusy} onClick={() => setImportRows(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={importBusy || !importRows?.length || !state} onClick={async () => {
              if (!importRows || !state) return;
              setImportBusy(true);
              try {
                const response = await fetch("/api/inbound-import", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ revision: state.revision, plant, rows: importRows }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || "Unable to import the schedule.");
                setDate(importRows[0].date);
                setImportRows(null);
                toast.success(`${result.imported} deliveries (${result.products} product rows) imported.`);
                await refresh();
              } catch (error) {
                setImportError(error instanceof Error ? error.message : "Unable to import the schedule.");
              } finally {
                setImportBusy(false);
              }
            }}>{importBusy ? "Importing..." : "Import schedule"}</button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="checkin-dialog">
          <DialogHeader>
            <DialogTitle>
              {dialog?.kind === "checkin"
                ? "Check in truck"
                : "Place truck on hold"}
            </DialogTitle>
            <DialogDescription>
              {dialog?.kind === "checkin"
                ? "Record the arriving truck. A queue number will be assigned automatically."
                : "Record why the truck cannot continue. Arrival priority is retained."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="checkin-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                dialog &&
                (await run(
                  {
                    kind: dialog.kind,
                    id: dialog.id,
                    ...(dialog.kind === "checkin"
                      ? {
                          plate: form.plate,
                          driver: form.driver,
                          carrier: form.carrier,
                        }
                      : { reason: form.reason }),
                  },
                  dialog.kind === "checkin"
                    ? "Truck checked in"
                    : "Truck placed on hold",
                ))
              )
                setDialog(null);
            }}
          >
            {dialog?.kind === "checkin" ? (
              <>
                <label>
                  Scheduled delivery
                  <Pick
                    value={dialog.id}
                    onChange={(id) => {
                      const v = state?.visits.find((v) => v.id === id);
                      if (v) openCheck(v);
                    }}
                    label="Scheduled delivery"
                    className="full-width"
                  >
                    {active
                      .filter((v) => v.stage === "scheduled")
                      .map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.time} Â· {v.lines[0].document} Â· {v.origin}
                        </SelectItem>
                      ))}
                  </Pick>
                </label>
                <label>
                  Truck plate
                  <input
                    required
                    value={form.plate}
                    maxLength={20}
                    onChange={(e) =>
                      setForm({ ...form, plate: e.target.value.toUpperCase() })
                    }
                  />
                </label>
                <label>
                  Driver name
                  <input
                    required
                    value={form.driver}
                    maxLength={100}
                    onChange={(e) =>
                      setForm({ ...form, driver: e.target.value })
                    }
                  />
                </label>
                <label>
                  Haulier
                  <input
                    value={form.carrier}
                    maxLength={150}
                    onChange={(e) =>
                      setForm({ ...form, carrier: e.target.value })
                    }
                  />
                </label>
              </>
            ) : (
              <label>
                Hold reason
                <textarea
                  required
                  value={form.reason}
                  maxLength={1000}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                />
              </label>
            )}
            <div className="form-actions">
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => setDialog(null)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy} type="submit">
                {busy ? "Savingâ€¦" : "Confirm"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!qrVisit}
        onOpenChange={(open) => {
          if (!open) setQrId("");
        }}
      >
        <DialogContent className="qr-dialog">
          <DialogHeader>
            <DialogTitle>Trucker tracking pass</DialogTitle>
            <DialogDescription>
              {qrVisit?.plate || "Truck not assigned"} Â· {qrVisit?.direction} Â·{" "}
              {qrVisit && ticket(qrVisit)}
            </DialogDescription>
          </DialogHeader>
          {qrImage ? (
            <img
              className="qr-image"
              src={qrImage}
              width={280}
              height={280}
              alt={"QR code to track " + (qrVisit?.plate || "this delivery")}
            />
          ) : (
            <div className="qr-loading">
              <Loader2 className="animate-spin" />
            </div>
          )}
          <p className="qr-instruction">
            Scan with your phoneâ€™s camera to follow this delivery.
          </p>
          <div className="qr-actions">
            <a
              className="btn btn-green"
              href={trackingUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open tracker <ArrowRight size={16} />
            </a>
            <button
              className="btn btn-outline"
              onClick={() =>
                navigator.clipboard
                  .writeText(trackingUrl)
                  .then(() => toast.success("Tracking link copied"))
                  .catch(() =>
                    toast.error("Copy the tracking URL shown below."),
                  )
              }
            >
              <Copy size={16} /> Copy link
            </button>
            {qrImage && (
              <a
                className="btn btn-outline"
                href={qrImage}
                download={"SMF_Truck_Pass_" + qrVisit?.id + ".png"}
              >
                <Download size={16} /> QR image
              </a>
            )}
          </div>
          <input
            aria-label="Tracking link"
            className="qr-link"
            readOnly
            value={trackingUrl}
            onFocus={(e) => e.currentTarget.select()}
          />
          <p className="qr-private">
            Keep this pass private. Anyone with the link can view this truckâ€™s
            process status. Pass expires{" "}
            {qrVisit &&
              new Date(qrVisit.tokenExpires).toLocaleDateString("en-GB")}
            .
          </p>
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              qrVisit &&
              void run(
                { kind: "renew_qr", id: qrVisit.id },
                "New QR pass created; previous pass invalidated",
              )
            }
          >
            Renew pass and invalidate previous QR
          </button>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!email}
        onOpenChange={(open) => {
          if (!open) setEmailId("");
        }}
      >
        <DialogContent className="email-dialog">
          <DialogHeader>
            <DialogTitle>Supervisor notification</DialogTitle>
            <DialogDescription>
              {email?.status === "sent"
                ? "Accepted by the email gateway."
                : "Preview of the saved notification. This preview does not send an email."}
            </DialogDescription>
          </DialogHeader>
          {email && (
            <>
              <dl className="email-meta">
                <dt>To</dt>
                <dd>{email.to.join(", ") || "No assigned supervisors"}</dd>
                <dt>Subject</dt>
                <dd>{email.subject}</dd>
              </dl>
              <pre className="email-body">{email.body}</pre>
              <a
                className="text-button"
                href={
                  "/?view=approvals&visit=" + encodeURIComponent(email.visitId)
                }
              >
                Review this delivery in the application
              </a>
              <div className="source-notice">{email.detail}</div>
              <button
                className="btn btn-primary"
                disabled={
                  busy ||
                  !state?.capabilities.emailConfigured ||
                  !state.emailEnabled ||
                  ["sent", "sending", "unknown"].includes(email.status)
                }
                onClick={() =>
                  void run(
                    { kind: "notify", id: email.id },
                    "Notification processed",
                  )
                }
              >
                <Mail size={17} /> Send to assigned supervisors
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function CalendarIcon() {
  return <Clock3 />;
}
function EmptyMessage({ text }: { text: string }) {
  return (
    <div className="empty-message">
      <Package size={27} />
      <p>{text}</p>
    </div>
  );
}
function ReadingHistory({ visit }: { visit: Visit }) {
  return (
    <section className="readings-history">
      <h3>Recorded weighings</h3>
      {visit.readings.length ? (
        visit.readings.map((r, i) => (
          <div key={i}>
            <span className="reading-number">{i + 1}</span>
            <div>
              <strong>
                {kg(r.kg)} kg <span className="source-tag">{r.source}</span>
              </strong>
              {r.label && <p className="reading-label">{r.label}</p>}
              <p>
                {r.device} Â· {clock(r.at)} PHT Â· {r.by}
              </p>
              <small>{r.reason}</small>
            </div>
          </div>
        ))
      ) : (
        <p className="small-description">No weights have been captured yet.</p>
      )}
    </section>
  );
}

function SettingsPanel({
  state,
  plant,
  busy,
  run,
}: {
  state: Workspace;
  plant: string;
  busy: boolean;
  run: (input: Input, success: string) => Promise<boolean>;
}) {
  const defaultCompany =
    state.sites.find((item) => item.id === plant)?.company ?? state.companyCodes[0]?.id ?? "1000";
  const defaultPlant =
    state.sites.find((item) => item.id === plant && item.company === defaultCompany)
      ?.id ?? state.sites.find((item) => item.company === defaultCompany)?.id ?? "";
  const firstMaterial =
    state.visits
      .find((visit) => visit.company === defaultCompany && visit.plant === defaultPlant)
      ?.lines[0]?.material ?? "RM-100101";
  const [company, setCompany] = useState(defaultCompany),
    [configPlant, setConfigPlant] = useState(defaultPlant),
    [level, setLevel] = useState<ToleranceLevel>("company"),
    [material, setMaterial] = useState(firstMaterial),
    [direction, setDirection] = useState<Direction>("inbound");
  const selectorKey = toleranceRuleKey({
    level,
    company,
    plant: configPlant,
    material,
    direction,
  });
  function selectedRule(): Rule {
    const direct = state.rules[selectorKey];
    if (direct) return { ...direct };
    if (level === "material")
      return {
        ...resolveTolerance(
          state,
          { company, plant: configPlant, direction },
          material,
        ),
      };
    return {
      ...(state.rules[
        toleranceRuleKey({ level: "company", company, direction })
      ] ?? { unit: "percent", shortage: 1, excess: 1, version: 1 }),
    };
  }
  const [rule, setRule] = useState<Rule>(selectedRule());
  const [process, setProcess] = useState<ProcessTemplate>(
    state.processes[processKey(company, direction)] ??
      processFor(state, { company, direction }),
  );
  const [emailEnabled, setEmailEnabled] = useState(state.emailEnabled),
    [draftRevision, setDraftRevision] = useState(state.revision);
  const [dirty, setDirty] = useState(false);
  const settingsSnapshot = JSON.stringify({
    rule: state.rules[selectorKey],
    process: state.processes[processKey(company, direction)],
    emailEnabled: state.emailEnabled,
  });
  const baseSettings = useRef(settingsSnapshot);
  useEffect(() => {
    if (!dirty) baseSettings.current = settingsSnapshot;
    else if (baseSettings.current === settingsSnapshot)
      setDraftRevision(state.revision);
  }, [dirty, settingsSnapshot, state.revision]);
  function loadDraft() {
    setRule(selectedRule());
    setProcess(
      structuredClone(
        state.processes[processKey(company, direction)] ??
          processFor(state, { company, direction }),
      ),
    );
    setEmailEnabled(state.emailEnabled);
    setDraftRevision(state.revision);
    setDirty(false);
  }
  const selection = [company, configPlant, level, material, direction].join(":");
  const lastKey = useRef(selection);
  useEffect(() => {
    if (lastKey.current !== selection) {
      lastKey.current = selection;
      setRule(selectedRule());
      setProcess(
        structuredClone(
          state.processes[processKey(company, direction)] ??
            processFor(state, { company, direction }),
        ),
      );
      setEmailEnabled(state.emailEnabled);
      setDraftRevision(state.revision);
      setDirty(false);
    } else if (!dirty) {
      setRule(selectedRule());
      setProcess(
        structuredClone(
          state.processes[processKey(company, direction)] ??
            processFor(state, { company, direction }),
        ),
      );
      setEmailEnabled(state.emailEnabled);
      setDraftRevision(state.revision);
    }
  }, [selection, state, dirty]);
  const companyPlants = state.sites.filter((item) => item.company === company);
  const materials = [
    ...new Map(
      state.visits
        .filter(
          (visit) =>
            visit.company === company && visit.plant === configPlant,
        )
        .flatMap((visit) => visit.lines)
        .map((line) => [line.material, line]),
    ).values(),
  ];
  const configuredRule = state.rules[selectorKey];
  return (
    <div className="settings-layout">
      <div className="settings-main">
        <section className="settings-card">
          <Collapsible>
            <div className="aside-heading">
              <h2>
                <Settings2 size={19} /> Tolerance hierarchy
              </h2>
              <div className="settings-card-header-actions">
                <span className="small-description">
                  {configuredRule
                    ? level + " rule Â· v" + configuredRule.version
                    : "New " + level + " override Â· inherited values shown"}
                </span>
                <CollapsibleTrigger
                  className="icon-button"
                  aria-label="Toggle Tolerance hierarchy section"
                >
                  <ChevronDown size={18} />
                </CollapsibleTrigger>
              </div>
            </div>
            <CollapsibleContent>
          <div className="form-grid">
            <label>
              Company
              <Pick
                value={company}
                onChange={(nextCompany) => {
                  const nextPlant = state.sites.find(
                    (item) => item.company === nextCompany,
                  )?.id ?? "";
                  const nextMaterial =
                    state.visits.find(
                      (visit) =>
                        visit.company === nextCompany &&
                        visit.plant === nextPlant,
                    )?.lines[0]?.material ?? "RM-100101";
                  setCompany(nextCompany);
                  setConfigPlant(nextPlant);
                  setMaterial(nextMaterial);
                }}
                label="Tolerance company"
                className="full-width"
              >
                {state.companyCodes.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </Pick>
            </label>
            <label>
              Delivery direction
              <Pick
                value={direction}
                onChange={(d) => setDirection(d as Direction)}
                label="Tolerance direction"
                className="full-width"
              >
                <SelectItem value="inbound">Inbound</SelectItem>
                <SelectItem value="outbound">Outbound</SelectItem>
              </Pick>
            </label>
            <label>
              Configuration level
              <Pick
                value={level}
                onChange={(value) => setLevel(value as ToleranceLevel)}
                label="Tolerance configuration level"
                className="full-width"
              >
                <SelectItem value="company">Company default</SelectItem>
                <SelectItem value="plant">Plant override</SelectItem>
                <SelectItem value="material">Material override</SelectItem>
              </Pick>
            </label>
            {level !== "company" && (
              <label>
                Plant
                <Pick
                  value={configPlant}
                  onChange={(nextPlant) => {
                    setConfigPlant(nextPlant);
                    setMaterial(
                      state.visits.find(
                        (visit) =>
                          visit.company === company &&
                          visit.plant === nextPlant,
                      )?.lines[0]?.material ?? "RM-100101",
                    );
                  }}
                  label="Tolerance plant"
                  className="full-width"
                >
                  {companyPlants.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </Pick>
              </label>
            )}
            {level === "material" && (
              <label>
                Material
                <Pick
                  value={material}
                  onChange={setMaterial}
                  label="Tolerance material"
                  className="full-width"
                >
                  {materials.map((line) => (
                    <SelectItem key={line.material} value={line.material}>
                      {line.material} Â· {line.description}
                    </SelectItem>
                  ))}
                </Pick>
              </label>
            )}
            <label>
              Tolerance unit
              <Pick
                value={rule.unit}
                onChange={(unit) => {
                  setRule({ ...rule, unit: unit as Rule["unit"] });
                  setDirty(true);
                }}
                label="Tolerance unit"
                className="full-width"
              >
                <SelectItem value="percent">
                  Percentage of expected net weight
                </SelectItem>
                <SelectItem value="kg">Absolute kilograms</SelectItem>
              </Pick>
            </label>
            <label>
              Allowed shortage ({rule.unit === "kg" ? "kg" : "%"})
              <input
                type="number"
                min="0"
                max={rule.unit === "percent" ? "100" : "200000"}
                step="0.01"
                value={Number.isNaN(rule.shortage) ? "" : rule.shortage}
                onChange={(e) => {
                  setRule({
                    ...rule,
                    shortage:
                      e.target.value === "" ? NaN : Number(e.target.value),
                  });
                  setDirty(true);
                }}
              />
            </label>
            <label>
              Allowed excess ({rule.unit === "kg" ? "kg" : "%"})
              <input
                type="number"
                min="0"
                max={rule.unit === "percent" ? "100" : "200000"}
                step="0.01"
                value={Number.isNaN(rule.excess) ? "" : rule.excess}
                onChange={(e) => {
                  setRule({
                    ...rule,
                    excess:
                      e.target.value === "" ? NaN : Number(e.target.value),
                  });
                  setDirty(true);
                }}
              />
            </label>
          </div>
          <p className="capture-note">
            Rule precedence is material â†’ plant â†’ company. A value exactly on
            the matched limit passes. Every product ticket stores the level and
            rule version used, so later configuration changes do not rewrite a
            completed comparison.
          </p>
            </CollapsibleContent>
          </Collapsible>
        </section>
        <section className="settings-card">
          <Collapsible>
            <div className="aside-heading">
              <div>
                <h2>
                  <ListOrdered size={19} /> Company process steps
                </h2>
                <p className="small-description">
                  {state.companyCodes.find((item) => item.id === company)?.name} Â·{" "}
                  {direction} Â· Template v
                  {state.processes[processKey(company, direction)]?.version ?? 1}
                </p>
              </div>
              <div className="settings-card-header-actions">
                <span className="count-badge">
                  {process.steps.filter((step) => step.enabled).length} active
                </span>
                <CollapsibleTrigger
                  className="icon-button"
                  aria-label="Toggle Company process steps section"
                >
                  <ChevronDown size={18} />
                </CollapsibleTrigger>
              </div>
            </div>
            <CollapsibleContent>
          <p className="capture-note">
            Rename, enable, and order the process shown to operators and
            truckers. Core weighing and clearance controls remain required.
          </p>
          <div className="process-config-list">
            {process.steps.map((step, index) => (
              <div className="process-config-row" key={step.id}>
                <span className="process-order">{index + 1}</span>
                <div className="process-config-copy">
                  <label>
                    <span>{step.id.replaceAll("_", " ")}</span>
                    <input
                      value={step.label}
                      maxLength={80}
                      onChange={(event) => {
                        const steps = process.steps.map((item) =>
                          item.id === step.id
                            ? { ...item, label: event.target.value }
                            : item,
                        );
                        setProcess({ ...process, steps });
                        setDirty(true);
                      }}
                    />
                  </label>
                  <small>
                    {step.required
                      ? "Required system step"
                      : step.enabled
                        ? "Included in this company flow"
                        : "Hidden from this company flow"}
                  </small>
                </div>
                <Switch
                  aria-label={"Enable " + step.label}
                  checked={step.enabled}
                  disabled={step.required}
                  onCheckedChange={(enabled) => {
                    setProcess({
                      ...process,
                      steps: process.steps.map((item) =>
                        item.id === step.id ? { ...item, enabled } : item,
                      ),
                    });
                    setDirty(true);
                  }}
                />
                <div className="process-move-buttons">
                  <button
                    className="icon-button"
                    aria-label={"Move " + step.label + " up"}
                    disabled={index === 0}
                    onClick={() => {
                      const steps = [...process.steps];
                      [steps[index - 1], steps[index]] = [
                        steps[index],
                        steps[index - 1],
                      ];
                      setProcess({ ...process, steps });
                      setDirty(true);
                    }}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"Move " + step.label + " down"}
                    disabled={index === process.steps.length - 1}
                    onClick={() => {
                      const steps = [...process.steps];
                      [steps[index], steps[index + 1]] = [
                        steps[index + 1],
                        steps[index],
                      ];
                      setProcess({ ...process, steps });
                      setDirty(true);
                    }}
                  >
                    <ArrowDown size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
            </CollapsibleContent>
          </Collapsible>
        </section>
        <CompanyCodesPanel state={state} run={run} />
        <SitesPanel state={state} run={run} />
        <RecipientsPanel state={state} run={run} />
        <UsersPanel isAdmin={state.actor.isAdmin} />
        <SmtpPanel isAdmin={state.actor.isAdmin} />
        <section className="settings-card">
          <Collapsible>
            <div className="aside-heading">
              <div>
                <h2>
                  <Mail size={19} /> Email notifications
                </h2>
                <p className="small-description">
                  Create and review exception-email records for the assigned
                  site supervisors.
                </p>
              </div>
              <div className="settings-card-header-actions">
                <Switch
                  aria-label="Enable email sending"
                  checked={emailEnabled}
                  disabled={
                    !state.actor.isAdmin || !state.capabilities.emailConfigured
                  }
                  onCheckedChange={(enabled) => {
                    setEmailEnabled(enabled);
                    setDirty(true);
                  }}
                />
                <CollapsibleTrigger
                  className="icon-button"
                  aria-label="Toggle Email notifications section"
                >
                  <ChevronDown size={18} />
                </CollapsibleTrigger>
              </div>
            </div>
            <CollapsibleContent>
          <div className="source-notice">
            {state.capabilities.emailConfigured
              ? "SMTP is configured. When enabled, new weight exceptions notify the assigned supervisors."
              : "SMTP is not configured yet. Set it up in Manage SMTP above to notify recipients for real."}
          </div>
            </CollapsibleContent>
          </Collapsible>
        </section>
        <div className="settings-actions">
          <button
            className="btn btn-outline"
            onClick={loadDraft}
          >
            Reload saved configuration
          </button>
          <button
            className="btn btn-primary"
            disabled={
              busy ||
              !state.actor.isAdmin ||
              !dirty ||
              !Number.isFinite(rule.shortage) ||
              !Number.isFinite(rule.excess)
            }
            onClick={async () => {
              if (
                await run(
                  {
                    kind: "settings",
                    revision: draftRevision,
                    company,
                    level,
                    ...(level === "company" ? {} : { plant: configPlant }),
                    ...(level === "material" ? { material } : {}),
                    direction,
                    rule,
                    process,
                    emailEnabled,
                  },
                  "Configuration settings saved",
                )
              )
                setDirty(false);
            }}
          >
            Save configuration
          </button>
        </div>
        {!state.actor.isAdmin && (
          <p className="capture-note">
            Only the administrator can change these settings.
          </p>
        )}
      </div>
      <aside className="settings-aside">
        <div className="call-card">
          <Scale size={30} />
          <h3>Configuration precedence</h3>
          <p>
            Material overrides plant; plant overrides company. Mixed-product
            trucks keep a separate comparison and applied rule on every
            weighing ticket.
          </p>
        </div>
        <section className="settings-card">
          <Collapsible>
            <div className="aside-heading">
              <h2>Connection status</h2>
              <CollapsibleTrigger
                className="icon-button"
                aria-label="Toggle Connection status section"
              >
                <ChevronDown size={18} />
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
          <ul className="connection-list">
            <li>
              <span>S/4HANA</span>
              <strong>Sample data</strong>
            </li>
            <li>
              <span>Weighbridge</span>
              <strong>
                {state.capabilities.scaleConfigured
                  ? "Gateway configured"
                  : "Not connected"}
              </strong>
            </li>
            <li>
              <span>Email gateway</span>
              <strong>
                {state.capabilities.emailConfigured
                  ? "Configured"
                  : "Not connected"}
              </strong>
            </li>
            <li>
              <span>Driver access</span>
              <strong>QR pass access</strong>
            </li>
          </ul>
          <p className="capture-note">
            This build uses sample SAP orders and simulated/manual weights.
            Live SAP and weighbridge integrations are disabled. Drivers can
            still open their individual QR passes.
          </p>
            </CollapsibleContent>
          </Collapsible>
        </section>
        {state.audit.length > 0 && (
          <section className="settings-card">
            <Collapsible>
              <div className="aside-heading">
                <h2>Settings history</h2>
                <CollapsibleTrigger
                  className="icon-button"
                  aria-label="Toggle Settings history section"
                >
                  <ChevronDown size={18} />
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
            {state.audit
              .slice(-5)
              .reverse()
              .map((e, i) => (
                <div className="settings-audit" key={i}>
                  <strong>
                    {clock(e.at)} Â· {e.by}
                  </strong>
                  <p>{e.text}</p>
                </div>
              ))}
              </CollapsibleContent>
            </Collapsible>
          </section>
        )}
      </aside>
    </div>
  );
}
function CompanyCodesPanel({
  state,
  run,
}: {
  state: Workspace;
  run: (input: Input, success: string) => Promise<boolean>;
}) {
  const [companyId, setCompanyId] = useState(""),
    [companyName, setCompanyName] = useState("");
  const isAdmin = state.actor.isAdmin;
  return (
    <section className="settings-card">
      <Collapsible>
        <div className="aside-heading">
          <h2>
            <Factory size={19} /> Company codes
          </h2>
          <CollapsibleTrigger
            className="icon-button"
            aria-label="Toggle Company codes section"
          >
            <ChevronDown size={18} />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <p className="small-description">
            Company codes used for tolerance rules and process configuration.
            A company code with active deliveries cannot be removed.
          </p>
          <div className="supervisor-list">
            {state.companyCodes.map((c) => (
              <div key={c.id}>
                <div>
                  <strong>{c.name}</strong>
                  <p className="mono">{c.id}</p>
                </div>
                {isAdmin && (
                  <button
                    className="icon-button"
                    aria-label={"Remove company " + c.id}
                    onClick={() =>
                      void run(
                        { kind: "remove_company", companyId: c.id },
                        "Company code removed",
                      )
                    }
                  >
                    <X size={17} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {isAdmin && (
            <div className="add-person">
              <div className="form-grid">
                <label>
                  Company code
                  <input
                    value={companyId}
                    maxLength={10}
                    placeholder="e.g. 3000"
                    onChange={(e) =>
                      setCompanyId(
                        e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                      )
                    }
                  />
                </label>
                <label>
                  Company name
                  <input
                    value={companyName}
                    maxLength={100}
                    placeholder="e.g. SMF Poultry Â· Company 3000"
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </label>
              </div>
              <button
                className="btn btn-outline"
                disabled={!companyId.trim() || !companyName.trim()}
                onClick={async () => {
                  if (
                    await run(
                      {
                        kind: "add_company",
                        companyId: companyId.trim(),
                        companyName: companyName.trim(),
                      },
                      "Company code added",
                    )
                  ) {
                    setCompanyId("");
                    setCompanyName("");
                  }
                }}
              >
                Add company code
              </button>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
function SitesPanel({
  state,
  run,
}: {
  state: Workspace;
  run: (input: Input, success: string) => Promise<boolean>;
}) {
  const [siteId, setSiteId] = useState(""),
    [siteLabel, setSiteLabel] = useState(""),
    [siteCompany, setSiteCompany] = useState(state.companyCodes[0]?.id ?? "");
  const isAdmin = state.actor.isAdmin;
  return (
    <section className="settings-card">
      <Collapsible>
        <div className="aside-heading">
          <h2>
            <MapPin size={19} /> Sites
          </h2>
          <CollapsibleTrigger
            className="icon-button"
            aria-label="Toggle Sites section"
          >
            <ChevronDown size={18} />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <p className="small-description">
            Sites (plants) where trucks are weighed. A site with active
            deliveries cannot be removed.
          </p>
          <div className="supervisor-list">
            {state.sites.map((p) => (
              <div key={p.id}>
                <div>
                  <strong>{p.label}</strong>
                  <p>
                    <span className="mono">{p.id}</span> Â·{" "}
                    {state.companyCodes.find((c) => c.id === p.company)?.name ??
                      p.company}
                  </p>
                </div>
                {isAdmin && (
                  <button
                    className="icon-button"
                    aria-label={"Remove site " + p.id}
                    onClick={() =>
                      void run(
                        { kind: "remove_site", siteId: p.id },
                        "Site removed",
                      )
                    }
                  >
                    <X size={17} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {isAdmin && (
            <div className="add-person">
              <div className="form-grid">
                <label>
                  Site code
                  <input
                    value={siteId}
                    maxLength={10}
                    placeholder="e.g. MNL"
                    onChange={(e) =>
                      setSiteId(
                        e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                      )
                    }
                  />
                </label>
                <label>
                  Site label
                  <input
                    value={siteLabel}
                    maxLength={100}
                    placeholder="e.g. Manila Â· NCR"
                    onChange={(e) => setSiteLabel(e.target.value)}
                  />
                </label>
                <label>
                  Company
                  <Pick
                    value={siteCompany}
                    onChange={setSiteCompany}
                    label="Site company"
                    className="full-width"
                  >
                    {state.companyCodes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </Pick>
                </label>
              </div>
              <button
                className="btn btn-outline"
                disabled={!siteId.trim() || !siteLabel.trim() || !siteCompany}
                onClick={async () => {
                  if (
                    await run(
                      {
                        kind: "add_site",
                        siteId: siteId.trim(),
                        siteLabel: siteLabel.trim(),
                        siteCompany,
                      },
                      "Site added",
                    )
                  ) {
                    setSiteId("");
                    setSiteLabel("");
                  }
                }}
              >
                Add site
              </button>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
function RecipientsPanel({
  state,
  run,
}: {
  state: Workspace;
  run: (input: Input, success: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [plant, setPlant] = useState("ALL"),
    [direction, setDirection] = useState<Direction | "both">("both");
  const isAdmin = state.actor.isAdmin;
  return (
    <section className="settings-card">
      <Collapsible>
        <div className="aside-heading">
          <h2>
            <ShieldCheck size={19} /> Notification recipients
          </h2>
          <CollapsibleTrigger
            className="icon-button"
            aria-label="Toggle Notification recipients section"
          >
            <ChevronDown size={18} />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <p className="small-description">
            Who receives weight-exception e-mail notifications, maintained
            per site and delivery direction. Separate from the sign-in
            accounts managed below.
          </p>
          <div className="supervisor-list">
            {state.supervisors.map((s) => (
              <div key={s.email}>
                <div>
                  <strong>{s.name}</strong>
                  <p>{s.email}</p>
                  <span>
                    {s.plant === "ALL" ? "All sites" : s.plant} Â· {s.direction}
                  </span>
                </div>
                {isAdmin && (
                  <button
                    className="icon-button"
                    aria-label={"Remove " + s.name}
                    onClick={() =>
                      void run(
                        { kind: "remove_recipient", email: s.email },
                        "Recipient removed",
                      )
                    }
                  >
                    <X size={17} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {isAdmin && (
            <div className="add-person">
              <div className="form-grid">
                <label>
                  Name
                  <input
                    value={name}
                    maxLength={100}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    maxLength={200}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  Site
                  <Pick
                    value={plant}
                    onChange={setPlant}
                    label="Recipient site"
                    className="full-width"
                  >
                    <SelectItem value="ALL">All sites</SelectItem>
                    {state.sites.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </Pick>
                </label>
                <label>
                  Direction
                  <Pick
                    value={direction}
                    onChange={(v) => setDirection(v as Direction | "both")}
                    label="Recipient delivery direction"
                    className="full-width"
                  >
                    <SelectItem value="both">Inbound & outbound</SelectItem>
                    <SelectItem value="inbound">Inbound only</SelectItem>
                    <SelectItem value="outbound">Outbound only</SelectItem>
                  </Pick>
                </label>
              </div>
              <button
                className="btn btn-outline"
                disabled={
                  !name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
                }
                onClick={async () => {
                  if (
                    await run(
                      {
                        kind: "add_recipient",
                        email: email.trim().toLowerCase(),
                        name: name.trim(),
                        recipientPlant: plant,
                        recipientDirection: direction,
                      },
                      "Recipient added",
                    )
                  ) {
                    setName("");
                    setEmail("");
                    setPlant("ALL");
                    setDirection("both");
                  }
                }}
              >
                Add recipient
              </button>
              <p className="capture-note">
                Added recipients are notified for new weight exceptions
                matching their site and direction; this does not create a
                sign-in account.
              </p>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
function UsersPanel({ isAdmin }: { isAdmin: boolean }) {
  const [users, setUsers] = useState<PublicUserRecord[] | null>(null),
    [usersRevision, setUsersRevision] = useState(0),
    [usersError, setUsersError] = useState(""),
    [usersBusy, setUsersBusy] = useState(false),
    [mailerReady, setMailerReady] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "",
    name: "",
    password: "",
    role: "operator" as Role,
    plant: "PAG" as PlantScope,
    direction: "both" as Direction | "return" | "both",
  });
  const [resetTarget, setResetTarget] = useState(""),
    [resetPassword, setResetPassword] = useState("");
  const [editingUser, setEditingUser] = useState<{
    email: string;
    role: Role;
    plant: PlantScope;
    direction: Direction | "return" | "both";
  } | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/users", { cache: "no-store" });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setUsersError(data.error || "Unable to load users.");
          return;
        }
        setUsers(data.users);
        setUsersRevision(data.revision);
        setMailerReady(!!data.mailerConfigured);
      } catch {
        if (active) setUsersError("Unable to load users.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  async function send(input: Input) {
    setUsersBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: usersRevision, ...input }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return null;
      }
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Unable to save. Please try again.");
        return null;
      }
      setUsers(data.users);
      setUsersRevision(data.revision);
      setMailerReady(!!data.mailerConfigured);
      return data as { emailSent: boolean; emailError?: string };
    } catch {
      toast.error("Unable to save. Please try again.");
      return null;
    } finally {
      setUsersBusy(false);
    }
  }
  function notifyEmailOutcome(result: { emailSent: boolean; emailError?: string }) {
    if (result.emailSent) toast.success("Credentials email sent to the user");
    else
      toast.warning(
        "Saved, but the credentials email was not sent" +
          (result.emailError ? ": " + result.emailError : "") +
          ". Share the password with the user directly.",
      );
  }
  return (
    <section className="settings-card">
      <Collapsible>
        <div className="aside-heading">
          <h2>
            <UserCircle size={19} /> Manage users
          </h2>
          <CollapsibleTrigger
            className="icon-button"
            aria-label="Toggle Manage users section"
          >
            <ChevronDown size={18} />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
      <p className="small-description">
        Create sign-in accounts for operators and supervisors. Each account is
        scoped to one site and delivery direction; administrators see and
        manage every site.
      </p>
      {usersError && <p className="form-error">{usersError}</p>}
      {users && (
        <div className="supervisor-list">
          {users.map((u) => (
            <div key={u.email}>
              <div>
                <strong>
                  {u.name}
                  {!u.active && " Â· deactivated"}
                </strong>
                <p>{u.email}</p>
                <span>
                  {u.role} Â· {u.plant === "ALL" ? "All sites" : u.plant} Â·{" "}
                  {u.direction === "return" ? "Return Delivery only" : u.direction === "both" ? "All" : u.direction}
                </span>
              </div>
              {isAdmin &&
                (editingUser?.email === u.email ? (
                  <div className="user-row-actions user-access-editor">
                    <label>
                      Role
                      <Pick
                        value={editingUser.role}
                        onChange={(value) =>
                          setEditingUser({
                            ...editingUser,
                            role: value as Role,
                            plant:
                              value === "admin"
                                ? "ALL"
                                : editingUser.plant === "ALL"
                                  ? "PAG"
                                  : editingUser.plant,
                          })
                        }
                        label={"Role for " + u.name}
                      >
                        <SelectItem value="admin">Administrator</SelectItem>
                        <SelectItem value="supervisor">Supervisor</SelectItem>
                        <SelectItem value="operator">Operator</SelectItem>
                      </Pick>
                    </label>
                    {editingUser.role !== "admin" && (
                      <label>
                        Site
                        <Pick
                          value={editingUser.plant}
                          onChange={(value) =>
                            setEditingUser({
                              ...editingUser,
                              plant: value as PlantScope,
                            })
                          }
                          label={"Site for " + u.name}
                        >
                          {PLANTS.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </Pick>
                      </label>
                    )}
                    <label>
                      Direction
                      <Pick
                        value={editingUser.direction}
                        onChange={(value) =>
                          setEditingUser({
                            ...editingUser,
                            direction: value as Direction | "return" | "both",
                          })
                        }
                        label={"Direction for " + u.name}
                      >
                        <SelectItem value="both">All</SelectItem>
                        <SelectItem value="inbound">Inbound only</SelectItem>
                        <SelectItem value="outbound">Outbound only</SelectItem>
                        <SelectItem value="return">Return Delivery only</SelectItem>
                      </Pick>
                    </label>
                    <button
                      className="icon-button"
                      aria-label={"Save access for " + u.name}
                      disabled={usersBusy}
                      onClick={async () => {
                        const saved = await send({
                          kind: "update_access",
                          ...editingUser,
                        });
                        if (saved) {
                          toast.success(
                            "User access updated. The change takes effect immediately; ask them to refresh the app.",
                          );
                          setEditingUser(null);
                        }
                      }}
                    >
                      <Check size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Cancel access changes"
                      disabled={usersBusy}
                      onClick={() => setEditingUser(null)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : resetTarget === u.email ? (
                  <div className="user-row-actions">
                    <input
                      type="password"
                      placeholder="New password"
                      value={resetPassword}
                      maxLength={200}
                      onChange={(e) => setResetPassword(e.target.value)}
                    />
                    <button
                      className="icon-button"
                      aria-label={"Confirm new password for " + u.name}
                      disabled={usersBusy || resetPassword.length < 8}
                      onClick={async () => {
                        const result = await send({
                          kind: "reset_password",
                          email: u.email,
                          password: resetPassword,
                        });
                        if (result) {
                          notifyEmailOutcome(result);
                          setResetTarget("");
                          setResetPassword("");
                        }
                      }}
                    >
                      <Check size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Cancel password reset"
                      onClick={() => {
                        setResetTarget("");
                        setResetPassword("");
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="user-row-actions">
                    <button
                      className="text-button"
                      disabled={usersBusy}
                      onClick={() => setEditingUser({ email: u.email, role: u.role, plant: u.plant, direction: u.direction })}
                    >
                      Change access
                    </button>
                    <button
                      className="text-button"
                      onClick={() => {
                        setResetTarget(u.email);
                        setResetPassword("");
                      }}
                    >
                      Reset password
                    </button>
                    <button
                      className="icon-button"
                      aria-label={
                        (u.active ? "Deactivate " : "Activate ") + u.name
                      }
                      disabled={usersBusy}
                      onClick={async () => {
                        if (
                          await send({
                            kind: "set_active",
                            email: u.email,
                            active: !u.active,
                          })
                        )
                          toast.success(
                            u.active ? "User deactivated" : "User activated",
                          );
                      }}
                    >
                      {u.active ? <X size={17} /> : <Check size={17} />}
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
      {isAdmin && (
        <div className="add-person">
          <div className="form-grid">
            <label>
              Name
              <input
                value={newUser.name}
                maxLength={100}
                onChange={(e) =>
                  setNewUser({ ...newUser, name: e.target.value })
                }
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={newUser.email}
                maxLength={200}
                onChange={(e) =>
                  setNewUser({ ...newUser, email: e.target.value })
                }
              />
            </label>
            <label>
              Temporary password
              <input
                type="password"
                value={newUser.password}
                maxLength={200}
                onChange={(e) =>
                  setNewUser({ ...newUser, password: e.target.value })
                }
              />
            </label>
            <label>
              Role
              <Pick
                value={newUser.role}
                onChange={(role) =>
                  setNewUser({ ...newUser, role: role as Role })
                }
                label="New user role"
                className="full-width"
              >
                <SelectItem value="admin">Administrator</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
                <SelectItem value="operator">Operator</SelectItem>
              </Pick>
            </label>
            {newUser.role !== "admin" && (
              <label>
                Site
                <Pick
                  value={newUser.plant}
                  onChange={(plant) =>
                    setNewUser({ ...newUser, plant: plant as PlantScope })
                  }
                  label="New user site"
                  className="full-width"
                >
                  {PLANTS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </Pick>
              </label>
            )}
            <label>
              Direction
              <Pick
                value={newUser.direction}
                onChange={(direction) =>
                  setNewUser({
                    ...newUser,
                    direction: direction as Direction | "return" | "both",
                  })
                }
                label="New user delivery direction"
                className="full-width"
              >
                <SelectItem value="both">All</SelectItem>
                <SelectItem value="inbound">Inbound only</SelectItem>
                <SelectItem value="outbound">Outbound only</SelectItem>
                <SelectItem value="return">Return Delivery only</SelectItem>
              </Pick>
            </label>
          </div>
          <button
            className="btn btn-outline"
            disabled={
              usersBusy ||
              !newUser.name.trim() ||
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.email) ||
              newUser.password.length < 8
            }
            onClick={async () => {
              const result = await send({
                kind: "create",
                email: newUser.email.trim().toLowerCase(),
                name: newUser.name.trim(),
                password: newUser.password,
                role: newUser.role,
                plant: newUser.role === "admin" ? "ALL" : newUser.plant,
                direction: newUser.direction,
              });
              if (result) {
                notifyEmailOutcome(result);
                setNewUser({
                  email: "",
                  name: "",
                  password: "",
                  role: "operator",
                  plant: "PAG",
                  direction: "both",
                });
              }
            }}
          >
            Create user
          </button>
          <p className="capture-note">
            The new account can sign in immediately with this password.
            {mailerReady
              ? " A credentials email is sent to the address above."
              : " SMTP is not configured, so no email is sent â€” share the password with them directly."}
          </p>
        </div>
      )}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
function SmtpPanel({ isAdmin }: { isAdmin: boolean }) {
  const [loaded, setLoaded] = useState(false),
    [revision, setRevision] = useState(0),
    [configured, setConfigured] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    host: "",
    port: 587,
    user: "",
    password: "",
    from: "",
    secure: false,
    allowSelfSigned: false,
  });
  const [testTo, setTestTo] = useState("");
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/smtp", { cache: "no-store" });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setError(data.error || "Unable to load SMTP settings.");
          return;
        }
        setRevision(data.revision);
        setConfigured(!!data.settings);
        if (data.settings)
          setForm({
            host: data.settings.host,
            port: data.settings.port,
            user: data.settings.user,
            password: "",
            from: data.settings.from,
            secure: data.settings.secure,
            allowSelfSigned: data.settings.allowSelfSigned,
          });
        setLoaded(true);
      } catch {
        if (active) setError("Unable to load SMTP settings.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  async function send(input: Input) {
    setBusy(true);
    try {
      const res = await fetch("/api/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.kind === "test" ? input : { revision, ...input }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return null;
      }
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Unable to save. Please try again.");
        return null;
      }
      if (typeof data.revision === "number") setRevision(data.revision);
      if ("settings" in data) {
        setConfigured(!!data.settings);
        if (data.settings) setForm((f) => ({ ...f, password: "" }));
      }
      return data;
    } catch {
      toast.error("Unable to save. Please try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  if (!isAdmin) return null;
  return (
    <section className="settings-card">
      <Collapsible>
        <div className="aside-heading">
          <h2>
            <Mail size={19} /> Manage SMTP
          </h2>
          <CollapsibleTrigger
            className="icon-button"
            aria-label="Toggle Manage SMTP section"
          >
            <ChevronDown size={18} />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
      <p className="small-description">
        Used for account-credential emails (new users and password resets)
        sent from Manage users above, and for weight-exception notifications
        once "Enable email sending" is turned on in the Email notifications
        card below. Settings saved here override the SMTP_* environment
        variables.
      </p>
      {error && <p className="form-error">{error}</p>}
      {loaded && (
        <>
          <div className="form-grid">
            <label>
              Host
              <input
                value={form.host}
                maxLength={200}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
              />
            </label>
            <label>
              Port
              <input
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) =>
                  setForm({ ...form, port: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Username
              <input
                value={form.user}
                maxLength={200}
                onChange={(e) => setForm({ ...form, user: e.target.value })}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                placeholder={configured ? "Unchanged" : ""}
                value={form.password}
                maxLength={200}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value })
                }
              />
            </label>
            <label>
              From address
              <input
                value={form.from}
                maxLength={200}
                onChange={(e) => setForm({ ...form, from: e.target.value })}
              />
            </label>
            <div className="aside-heading">
              <span>Use TLS (typically port 465)</span>
              <Switch
                aria-label="Use TLS"
                checked={form.secure}
                onCheckedChange={(secure) => setForm({ ...form, secure })}
              />
            </div>
            <div className="aside-heading">
              <div>
                <span>Allow self-signed certificate</span>
                <p className="small-description">
                  Only needed for internal mail relays that don&apos;t have a
                  certificate from a public authority.
                </p>
              </div>
              <Switch
                aria-label="Allow self-signed certificate"
                checked={form.allowSelfSigned}
                onCheckedChange={(allowSelfSigned) =>
                  setForm({ ...form, allowSelfSigned })
                }
              />
            </div>
          </div>
          <div className="settings-actions">
            {configured && (
              <button
                className="btn btn-outline"
                disabled={busy}
                onClick={async () => {
                  if (await send({ kind: "clear" })) toast.success("SMTP settings cleared");
                }}
              >
                Clear
              </button>
            )}
            <button
              className="btn btn-primary"
              disabled={
                busy ||
                !form.host.trim() ||
                !form.user.trim() ||
                !form.from.trim() ||
                (!configured && !form.password)
              }
              onClick={async () => {
                if (
                  await send({
                    kind: "save",
                    host: form.host.trim(),
                    port: form.port,
                    user: form.user.trim(),
                    ...(form.password ? { password: form.password } : {}),
                    from: form.from.trim(),
                    secure: form.secure,
                    allowSelfSigned: form.allowSelfSigned,
                  })
                )
                  toast.success("SMTP settings saved");
              }}
            >
              Save SMTP settings
            </button>
          </div>
          <div className="form-grid">
            <label>
              Send a test email to
              <input
                type="email"
                value={testTo}
                maxLength={200}
                onChange={(e) => setTestTo(e.target.value)}
              />
            </label>
          </div>
          <button
            className="btn btn-outline"
            disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo)}
            onClick={async () => {
              if (await send({ kind: "test", to: testTo }))
                toast.success("Test email sent to " + testTo);
            }}
          >
            <Mail size={15} /> Send test email
          </button>
        </>
      )}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
