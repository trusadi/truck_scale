"use client";
import { useState } from "react";
import { LogIn } from "lucide-react";
import Link from "next/link";

export default function LoginForm() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="login-page">
      <form
        className="login-card checkin-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const res = await fetch("/api/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Sign-in failed.");
            window.location.href = "/";
          } catch (err) {
            setError(err instanceof Error ? err.message : "Sign-in failed.");
            setBusy(false);
          }
        }}
      >
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-logo" src="/sanmiguel-logo.png" alt="San Miguel Foods" />
        </div>
        <div>
          <h1 className="login-title">Truck Scale sign in</h1>
          <p className="login-subtitle">Sign in with your operator account to continue.</p>
        </div>
        <label>
          Email
          <input
            type="email"
            required
            autoFocus
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <p className="login-recovery-link"><Link href="/forgot-password">Forgot password?</Link></p>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            <LogIn size={15} /> {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
      <p className="login-powered-by">Powered by DeloitteAutomate</p>
    </div>
  );
}
