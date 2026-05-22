"use client";

import { useState, FormEvent, useEffect, useRef } from "react";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Hydration gate: keeps the submit button disabled until React has mounted
  // so a tap before the onSubmit handler is attached can't trigger a native
  // form GET that would lose the XHR path and reload with empty query params.
  const [isHydrated, setIsHydrated] = useState(false);

  // Uncontrolled refs — React never writes value back to the DOM, so iOS
  // password-manager autofill (Face ID / Fill Password) is never overwritten
  // by a React re-render. Values are read directly from the DOM on submit.
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    setIsHydrated(true);
    return () => { mountedRef.current = false; };
  }, []);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const username = usernameRef.current?.value.trim() ?? "";
    const password = passwordRef.current?.value ?? "";
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json().catch(() => ({})) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        if (!mountedRef.current) return;
        setError(json.error ?? "Invalid credentials");
        return;
      }
      const nextParam = new URLSearchParams(window.location.search).get("next");
      window.location.href = nextParam && /^\/[^/]/.test(nextParam) ? nextParam : "/";
    } catch {
      if (mountedRef.current) setError("Network error — please try again");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0f",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', 'SF Pro Text', system-ui, sans-serif",
        padding: "1rem",
      }}
    >
      {/* Top regulatory ticker */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "2px",
          background: "linear-gradient(90deg, #e91e8c 0%, #ff4dc4 50%, #e91e8c 100%)",
        }}
      />

      {/* Card */}
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          background: "#111118",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "12px",
          padding: "40px 36px",
          boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
        }}
      >
        {/* Logo block */}
        <div style={{ marginBottom: "32px", textAlign: "center" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "44px",
              height: "44px",
              background: "#e91e8c",
              borderRadius: "10px",
              marginBottom: "16px",
              fontSize: "20px",
              fontWeight: 700,
              color: "#fff",
            }}
          >
            H
          </div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff", letterSpacing: "-0.3px" }}>
            Hawkeye Sterling
          </div>
          <div style={{ fontSize: "11.5px", color: "rgba(255,255,255,0.35)", marginTop: "4px", letterSpacing: "0.5px" }}>
            AML COMPLIANCE PLATFORM · UAE
          </div>
        </div>

        <form onSubmit={submit}>
          {/* Username */}
          <div style={{ marginBottom: "14px" }}>
            <label
              style={{
                display: "block",
                fontSize: "11px",
                fontWeight: 600,
                color: "rgba(255,255,255,0.45)",
                letterSpacing: "0.6px",
                textTransform: "uppercase",
                marginBottom: "6px",
              }}
            >
              Username
            </label>
            <input
              ref={usernameRef}
              type="text"
              name="username"
              autoComplete="username"
              defaultValue=""
              placeholder="e.g. luisa"
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                padding: "11px 14px",
                fontSize: "14px",
                color: "#fff",
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#e91e8c";
                e.currentTarget.style.background = "rgba(233,30,140,0.04)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                e.currentTarget.style.background = "rgba(255,255,255,0.04)";
              }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                fontSize: "11px",
                fontWeight: 600,
                color: "rgba(255,255,255,0.45)",
                letterSpacing: "0.6px",
                textTransform: "uppercase",
                marginBottom: "6px",
              }}
            >
              Password
            </label>
            <input
              ref={passwordRef}
              type="password"
              name="password"
              autoComplete="current-password"
              defaultValue=""
              placeholder="••••••••"
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                padding: "11px 14px",
                fontSize: "14px",
                color: "#fff",
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#e91e8c";
                e.currentTarget.style.background = "rgba(233,30,140,0.04)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                e.currentTarget.style.background = "rgba(255,255,255,0.04)";
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                marginBottom: "16px",
                padding: "10px 14px",
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: "8px",
                fontSize: "13px",
                color: "#f87171",
              }}
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !isHydrated}
            style={{
              width: "100%",
              padding: "12px",
              background: loading ? "rgba(233,30,140,0.4)" : "#e91e8c",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              letterSpacing: "0.2px",
              transition: "background 0.15s",
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* Forgot password */}
        <div
          style={{
            marginTop: "18px",
            textAlign: "center",
            fontSize: "12px",
            color: "rgba(255,255,255,0.35)",
          }}
        >
          Forgotten your password?{" "}
          <a
            href="mailto:hawkeye.sterling.v2@gmail.com?subject=Password%20Reset%20Request"
            style={{ color: "#e91e8c", textDecoration: "none" }}
          >
            Contact your MLRO
          </a>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: "20px",
            paddingTop: "18px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            textAlign: "center",
            fontSize: "10.5px",
            color: "rgba(255,255,255,0.2)",
            lineHeight: 1.6,
          }}
        >
          Regulated under UAE FDL 10/2025 · Access logged per Art.26-27
          <br />
          Unauthorized access is a criminal offence
        </div>
      </div>

      {/* Bottom legal */}
      <div
        style={{
          marginTop: "24px",
          fontSize: "10px",
          color: "rgba(255,255,255,0.15)",
          textAlign: "center",
        }}
      >
        © 2026 Hawkeye Sterling · Precision Screening · UAE
      </div>
    </div>
  );
}
