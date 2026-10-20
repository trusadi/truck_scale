"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setToken(new URLSearchParams(window.location.search).get("token") ?? ""), []);
  return <div className="login-page"><form className="login-card checkin-form" onSubmit={async (event) => {
    event.preventDefault(); setError(""); setMessage("");
    if (password !== confirm) { setError("The passwords do not match."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/password-reset/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to reset password.");
      setMessage(data.message);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to reset password."); }
    finally { setBusy(false); }
  }}>
    <div className="brand"><img className="brand-logo" src="/sanmiguel-logo.png" alt="San Miguel Foods" /></div>
    <div><h1 className="login-title">Set a new password</h1><p className="login-subtitle">Choose a password with at least 8 characters.</p></div>
    {!token && <p className="form-error">This reset link is missing or invalid. Request a new link.</p>}
    <label>New password<input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    <label>Confirm new password<input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>
    {error && <p className="form-error">{error}</p>}{message && <p role="status">{message}</p>}
    <div className="form-actions"><button className="btn btn-primary" type="submit" disabled={busy || !token || !!message}>{busy ? "Saving…" : "Reset password"}</button></div>
    <p className="login-recovery-link"><Link href="/login">Back to sign in</Link></p>
  </form><p className="login-powered-by">Powered by DeloitteAutomate</p></div>;
}
