"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
type Payload = { action: "approve" | "reject"; expiresAt: string; recipient: string; delivery: { plate: string; ticket: string; plant: string; direction: string; date: string; lines: { document: string; material: string; description: string; expectedKg: number }[]; expectedKg: number; measuredKg: number; varianceKg: number; variancePercent: number } };
export default function EmailApprovalPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/email-approval/" + encodeURIComponent(token), { cache: "no-store" }).then(async (r) => { const body = await r.json(); if (!r.ok) throw new Error(body.error || "This link is unavailable."); setData(body); }).catch((e) => setError(e.message)); }, [token]);
  async function submit() {
    if (!data || busy) return;
    setBusy(true); setError("");
    try { const response = await fetch("/api/email-approval/" + encodeURIComponent(token), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Could not submit your decision."); setDone(body.outcome === "approved" ? "Delivery approved." : "Delivery rejected."); setData(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not submit your decision."); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 680, margin: "48px auto", padding: 24, background: "white", border: "1px solid #dce5df", borderRadius: 12, color: "#18352c", fontFamily: "Segoe UI, Arial, sans-serif" }}>
    <p style={{ color: "#47715e", fontWeight: 700 }}>SMF TRUCK SCALE · EMAIL DECISION</p>
    <h1 style={{ marginBottom: 8 }}>{data ? (data.action === "approve" ? "Approve weight exception?" : "Reject weight exception?") : "Delivery decision"}</h1>
    <p>Confirm the delivery details and enter a reason. This link can be used once and expires after 48 hours.</p>
    {error && <p role="alert" style={{ color: "#b42335", background: "#fff0f1", padding: 12, borderRadius: 6 }}>{error}</p>}
    {done && <p role="status" style={{ color: "#185d3f", background: "#eaf6ee", padding: 12, borderRadius: 6 }}>{done}</p>}
    {data && <>
      <dl style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: 10 }}><dt>Truck plate</dt><dd>{data.delivery.plate}</dd><dt>Site / direction</dt><dd>{data.delivery.plant} / {data.delivery.direction}</dd><dt>Queue ticket</dt><dd>{data.delivery.ticket}</dd><dt>Expected net</dt><dd>{data.delivery.expectedKg.toLocaleString()} kg</dd><dt>Measured net</dt><dd>{data.delivery.measuredKg.toLocaleString()} kg</dd><dt>Variance</dt><dd>{data.delivery.varianceKg.toLocaleString()} kg ({data.delivery.variancePercent.toFixed(2)}%)</dd></dl>
      <h2>Products / documents</h2><ul>{data.delivery.lines.map((line, i) => <li key={i}>{line.document} · {line.material} {line.description} · expected {line.expectedKg.toLocaleString()} kg</li>)}</ul>
      <label style={{ display: "block", marginTop: 20 }}>Decision reason<textarea value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={1000} rows={4} style={{ display: "block", width: "100%", marginTop: 8, padding: 10, border: "1px solid #bdcbc3", borderRadius: 6 }} /></label>
      <button onClick={submit} disabled={busy || reason.trim().length < 3} style={{ marginTop: 16, padding: "12px 20px", border: 0, borderRadius: 6, background: data.action === "approve" ? "#216247" : "#a52a3a", color: "white", fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>{busy ? "Submitting…" : data.action === "approve" ? "Confirm approval" : "Confirm rejection"}</button>
    </>}
  </main>;
}
