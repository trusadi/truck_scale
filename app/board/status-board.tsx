"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Maximize2,
  Minimize2,
  RefreshCw,
  Truck,
} from "lucide-react";

type Stage = "scheduled" | "waiting" | "called" | "held" | "first_weigh" | "handling" | "second_weigh" | "approval" | "cleared" | "rejected" | "completed";
type BoardVisit = {
  id: string; company: string; plant: string; date: string; scheduledTime: string;
  direction: "inbound" | "outbound"; plate: string; queueTicket: string;
  stage: Stage; status: string; productProgress: { completed: number; total: number; current: number };
  updatedAt: string;
};
type BoardData = {
  revision: number; sampleDate: string; updatedAt: string;
  companies: { id: string; name: string }[];
  plants: { id: string; company: string; name: string; label: string }[];
  visits: BoardVisit[];
};

const activeStages: Stage[] = ["called", "first_weigh", "handling", "second_weigh", "approval", "cleared", "held"];
const clock = (value: Date) => value.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Manila" });
const dateLabel = (value: string) => new Date(`${value}T00:00:00+08:00`).toLocaleDateString("en-PH", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Manila" });
const updatedTime = (value: string) => new Date(value).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Manila" });

function Row({ visit }: { visit: BoardVisit }) {
  const progress = visit.productProgress.total > 1 && ["handling", "second_weigh"].includes(visit.stage)
    ? `Product ${visit.productProgress.current}/${visit.productProgress.total}` : "";
  return (
    <div className={`flight-row board-${visit.stage}`}>
      <div className="flight-time mono">{visit.scheduledTime}</div>
      <div className="flight-ticket mono">{visit.queueTicket}</div>
      <div className="flight-truck">
        <strong>{visit.plate}</strong>
        <span>{visit.direction === "inbound" ? "INBOUND" : "OUTBOUND"}</span>
      </div>
      <div className="flight-progress">{progress || "-"}</div>
      <div className="flight-status"><span className="board-status-dot" />{visit.status}</div>
      <div className="flight-updated mono">{updatedTime(visit.updatedAt)}</div>
    </div>
  );
}

function Section({ title, visits, empty }: { title: string; visits: BoardVisit[]; empty: string }) {
  return (
    <section className="flight-section">
      <header><h2>{title}</h2><span>{visits.length} truck{visits.length === 1 ? "" : "s"}</span></header>
      <div className="flight-columns" aria-hidden="true">
        <span>TIME</span><span>QUEUE</span><span>TRUCK</span><span>PRODUCT</span><span>STATUS / INSTRUCTION</span><span>UPDATED</span>
      </div>
      {visits.length ? visits.map((visit) => <Row key={visit.id} visit={visit} />) : <div className="flight-empty">{empty}</div>}
    </section>
  );
}

export default function StatusBoard() {
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState("");
  const [company, setCompany] = useState("all");
  const [plant, setPlant] = useState("all");
  const [direction, setDirection] = useState("all");
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/board", { cache: "no-store" });
      if (!response.ok) throw new Error("Status unavailable");
      const next = (await response.json()) as BoardData;
      setData(next); setDate((current) => current || next.sampleDate); setError("");
    } catch { setError("Unable to refresh the truck status board."); }
  }, []);

  useEffect(() => {
    void refresh();
    setNow(new Date());
    const refreshTimer = window.setInterval(() => void refresh(), 10000);
    const clockTimer = window.setInterval(() => setNow(new Date()), 1000);
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => { window.clearInterval(refreshTimer); window.clearInterval(clockTimer); document.removeEventListener("fullscreenchange", onFullscreen); };
  }, [refresh]);

  const plants = data?.plants.filter((item) => company === "all" || item.company === company) ?? [];
  const filtered = useMemo(() => (data?.visits ?? []).filter((visit) =>
    visit.date === date && (company === "all" || visit.company === company) &&
    (plant === "all" || visit.plant === plant) && (direction === "all" || visit.direction === direction) && (!search.trim() || (visit.plate + " " + visit.queueTicket + " " + visit.id).toLowerCase().includes(search.trim().toLowerCase()))),
    [company, data, date, direction, plant, search]);
  const byTime = (a: BoardVisit, b: BoardVisit) => a.scheduledTime.localeCompare(b.scheduledTime) || a.queueTicket.localeCompare(b.queueTicket);
  const processing = filtered.filter((visit) => activeStages.includes(visit.stage)).sort(byTime);
  const next = filtered.filter((visit) => ["waiting", "scheduled"].includes(visit.stage)).sort((a, b) => {
    if (a.stage !== b.stage) return a.stage === "waiting" ? -1 : 1;
    return byTime(a, b);
  }).slice(0, 8);
  const recent = filtered.filter((visit) => ["completed", "rejected"].includes(visit.stage)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
  const plantLabel = plant === "all" ? (company === "all" ? "All SMF Plants" : data?.companies.find((item) => item.id === company)?.name ?? "Company") : data?.plants.find((item) => item.id === plant)?.label ?? plant;

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  };

  return (
    <main className="status-board-shell">
      <header className="board-header">
        <div className="board-brand">{/* eslint-disable-next-line @next/next/no-img-element */}<img className="board-logo" src="/sanmiguel-logo.png" alt="San Miguel Foods" /><div><strong>TRUCK STATUS BOARD</strong></div></div>
        <div className="board-place"><span>LIVE OPERATIONS</span><h1>{plantLabel}</h1><p>{date ? dateLabel(date) : "Loading schedule"}</p></div>
        <div className="board-clock"><Clock3 size={20} /><div><strong className="mono">{now ? clock(now) : "--:--:--"}</strong><small>PHILIPPINE TIME</small></div></div>
      </header>

      <div className="board-controls">
        <div className="board-filters">
          <label>Company<select value={company} onChange={(event) => { setCompany(event.target.value); setPlant("all"); }}><option value="all">All companies</option>{data?.companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Plant<select value={plant} onChange={(event) => setPlant(event.target.value)}><option value="all">All plants</option>{plants.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label>Direction<select value={direction} onChange={(event) => setDirection(event.target.value)}><option value="all">Inbound and outbound</option><option value="inbound">Inbound</option><option value="outbound">Outbound</option></select></label>
          <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label>Truck / plate<input type="search" placeholder="Search truck number or plate" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        </div>
        <div className="board-actions"><Link href="/" className="board-button"><ArrowLeft size={17} /> Operations</Link><button className="board-button" onClick={() => void refresh()}><RefreshCw size={17} /> Refresh</button><button className="board-button board-fullscreen" onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}{fullscreen ? "Exit full screen" : "Full screen"}</button></div>
      </div>

      {error && <div className="board-error" role="alert">{error}</div>}
      {!data ? <div className="board-loading"><RefreshCw className="animate-spin" /><p>Loading truck movements...</p></div> : <div className="board-content">
        <Section title="Now Processing" visits={processing} empty="No trucks are currently processing." />
        <Section title="Next Trucks" visits={next} empty="No trucks are waiting or scheduled." />
        {recent.length > 0 && <Section title="Recently Completed" visits={recent} empty="No completed trucks." />}
      </div>}
      <footer className="board-footer"><span><span className="live-dot" /> Updates automatically every 10 seconds</span><span>Revision {data?.revision ?? "-"} · Last synchronized {data ? updatedTime(data.updatedAt) : "-"}</span><span><Truck size={17} /> Follow the displayed instruction or contact the gate team</span><span>Powered by DeloitteAutomate</span></footer>
    </main>
  );
}
