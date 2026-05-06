"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Invalid credentials");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
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
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
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
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
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
            disabled={loading}
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
            href="mailto:compliance@hawkeye-sterling.ae?subject=Password%20Reset%20Request"
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
        © 2025 Hawkeye Sterling · Precision Screening · UAE
      </div>
    </div>
  );
}
