"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  Loader2,
  MapPin,
  RefreshCw,
  Truck,
} from "lucide-react";
import { clock, STAGES, type driverView } from "@/lib/operations";

type Tracking = NonNullable<ReturnType<typeof driverView>>;

export default function Tracker({ token }: { token: string }) {
  const [data, setData] = useState<Tracking | null>(null),
    [error, setError] = useState(""),
    [updating, setUpdating] = useState(false),
    [checkedAt, setCheckedAt] = useState("");

  const load = useCallback(async () => {
    setUpdating(true);
    try {
      const response = await fetch(
        "/api/tracking/" + encodeURIComponent(token),
        { cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 404) setData(null);
        throw new Error(body.error || "Unable to check progress.");
      }
      setData(body);
      setCheckedAt(new Date().toISOString());
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Tracking is unavailable. Please retry.",
      );
    } finally {
      setUpdating(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [load]);

  const steps = data?.processSteps ?? [];
  let index = data
    ? steps.findIndex((step) => step.id === data.currentProcessStep)
    : 0;
  if (index < 0 && data) {
    const fallback =
      data.currentProcessStep === "product_handling"
        ? "product_weighing"
        : data.currentProcessStep === "approval"
          ? "weight_check"
          : "gate_exit";
    index = Math.max(0, steps.findIndex((step) => step.id === fallback));
  }

  return (
    <main className="driver-shell">
      <header className="driver-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo" src="/sanmiguel-logo.png" alt="San Miguel Foods" />
        <span>
          <small>TRUCKER TRACKING</small>
        </span>
        <span className="prototype-tag">DEMO</span>
      </header>
      {error && (
        <div className="service-error" role="alert">
          {error}
        </div>
      )}
      {!data ? (
        <section className="driver-loading">
          {!error && <Loader2 className="animate-spin" size={28} />}
          <h1>{error ? "Tracking unavailable" : "Checking your delivery…"}</h1>
          <p>
            {error
              ? "Ask the gate operator for help or a new QR pass."
              : "Your progress will appear here."}
          </p>
          <button
            className="btn btn-outline"
            disabled={updating}
            onClick={() => void load()}
          >
            <RefreshCw size={17} /> Try again
          </button>
        </section>
      ) : (
        <>
          <section className="driver-ticket">
            <div className="driver-direction">
              <Truck size={17} /> {data.direction} delivery
            </div>
            <h1>{data.plate}</h1>
            <div className="driver-ticket-number">{data.ticket}</div>
            <p>
              <MapPin size={16} /> {data.site}
            </p>
            <span>
              Scheduled {data.date} · {data.scheduledTime} PHT
            </span>
          </section>
          <section
            className={
              "driver-current " +
              (data.stage === "rejected" ? "driver-rejected" : "")
            }
          >
            <span className="eyebrow">CURRENT STEP</span>
            <h2>
              {steps[index]?.label ??
                (data.stage === "handling"
                  ? data.direction === "inbound"
                    ? "Unloading"
                    : "Loading"
                  : STAGES[data.stage])}
            </h2>
            <p>{data.message}</p>
            {data.ticketProgress.total > 1 && (
              <div className="driver-position">
                <strong>
                  {data.ticketProgress.completed}/{data.ticketProgress.total}
                </strong>
                <span>product weighing tickets completed</span>
              </div>
            )}
            {data.ahead !== null && (
              <div className="driver-position">
                <strong>{data.ahead === 0 ? "You are next" : data.ahead}</strong>
                <span>
                  {data.ahead === 0
                    ? "in the waiting queue"
                    : "truck" +
                      (data.ahead === 1 ? "" : "s") +
                      " ahead in the waiting queue"}
                </span>
              </div>
            )}
            {data.stage === "called" && (
              <div className="driver-call">
                <ArrowRight size={20} /> Proceed to the weighbridge
              </div>
            )}
          </section>
          <section className="driver-progress">
            <h2>Your delivery progress</h2>
            <ol>
              {steps.map((step, stepIndex) => (
                <li
                  key={step.id}
                  className={
                    stepIndex < index || data.stage === "completed"
                      ? "done"
                      : stepIndex === index
                        ? "current"
                        : ""
                  }
                >
                  <span className="driver-step-icon">
                    {stepIndex < index || data.stage === "completed" ? (
                      <Check size={17} />
                    ) : (
                      stepIndex + 1
                    )}
                  </span>
                  <div>
                    <strong>{step.label}</strong>
                    {stepIndex === index && data.stage !== "completed" && (
                      <small>
                        {data.stage === "approval"
                          ? "Waiting for supervisor"
                          : data.stage === "rejected"
                            ? "Contact the gate operator"
                            : data.stage === "cleared"
                              ? "Cleared — proceed to exit processing"
                              : "You are here"}
                      </small>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section className="driver-updates">
            <h2>
              <Clock3 size={18} /> Latest updates
            </h2>
            {data.milestones
              .slice(-5)
              .reverse()
              .map((event, eventIndex) => (
                <div key={eventIndex}>
                  <time>{clock(event.at)}</time>
                  <p>{event.label}</p>
                </div>
              ))}
          </section>
          <footer className="driver-footer">
            <button
              className="btn btn-outline full-width"
              disabled={updating}
              onClick={() => void load()}
            >
              <RefreshCw
                size={16}
                className={updating ? "animate-spin" : ""}
              />
              {updating ? "Checking progress…" : "Refresh status"}
            </button>
            <p>
              {error
                ? "Updates are interrupted; the status above may be out of date."
                : "Checked at " +
                  (checkedAt ? clock(checkedAt) : "—") +
                  " PHT · Automatically updates every 15 seconds"}
            </p>
            <p>
              Delivery tracking · QR pass access
              <br />
              Keep this pass private. It shows only this delivery.
            </p>
          </footer>
        </>
      )}
    </main>
  );
}
