"use client";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <div className="login-page"><form className="login-card checkin-form" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/password-reset/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to request a password reset.");
      setMessage(data.message);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to request a password reset."); }
    finally { setBusy(false); }
  }}>
    <div className="brand"><img className="brand-logo" src="/sanmiguel-logo.png" alt="San Miguel Foods" /></div>
    <div><h1 className="login-title">Forgot password?</h1><p className="login-subtitle">Enter your account email and we’ll send a password reset link.</p></div>
    <label>Email<input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    {error && <p className="form-error">{error}</p>}{message && <p role="status">{message}</p>}
    <div className="form-actions"><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button></div>
    <p className="login-recovery-link"><Link href="/login">Back to sign in</Link></p>
  </form><p className="login-powered-by">Powered by DeloitteAutomate</p></div>;
}
