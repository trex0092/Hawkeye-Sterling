"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

type Step = "loading" | "scan" | "verify" | "done" | "disable" | "error";

export default function TotpSetupPage() {
  const [step, setStep] = useState<Step>("loading");
  const [uri, setUri] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { ok: boolean; user?: { totpEnabled?: boolean } }) => {
        if (!d.ok) { window.location.href = "/login?next=/totp-setup"; return; }
        setTotpEnabled(d.user?.totpEnabled ?? false);
        setStep(d.user?.totpEnabled ? "disable" : "scan");
      })
      .catch(() => setStep("error"));
  }, []);

  // Fetch the pending TOTP secret when the scan step is active.
  useEffect(() => {
    if (step !== "scan") return;
    setLoading(true);
    fetch("/api/auth/totp/setup", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { ok: boolean; uri?: string; key?: string }) => {
        if (!d.ok || !d.uri || !d.key) { setStep("error"); return; }
        setUri(d.uri);
        setSecretKey(d.key);
      })
      .catch(() => setStep("error"))
      .finally(() => setLoading(false));
  }, [step]);

  const verifyCode = async () => {
    const code = codeRef.current?.value.replace(/\s/g, "") ?? "";
    if (!/^\d{6}$/.test(code)) { setError("Enter the 6-digit code from the app"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/totp/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });
      const d = await res.json() as { ok: boolean; error?: string };
      if (!d.ok) { setError(d.error ?? "Incorrect code"); return; }
      setStep("done");
      setTotpEnabled(true);
    } catch { setError("Network error — please try again"); }
    finally { setLoading(false); }
  };

  const disableTotp = async () => {
    const code = codeRef.current?.value.replace(/\s/g, "") ?? "";
    if (!/^\d{6}$/.test(code)) { setError("Enter the 6-digit code from the app"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/totp/disable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });
      const d = await res.json() as { ok: boolean; error?: string };
      if (!d.ok) { setError(d.error ?? "Incorrect code"); return; }
      setTotpEnabled(false);
      setStep("scan");
    } catch { setError("Network error — please try again"); }
    finally { setLoading(false); }
  };

  const card: React.CSSProperties = {
    width: "100%",
    maxWidth: "440px",
    background: "#111118",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    padding: "40px 36px",
    boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
    fontFamily: "'Inter','SF Pro Text',system-ui,sans-serif",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    padding: "11px 14px",
    fontSize: "22px",
    letterSpacing: "0.3em",
    textAlign: "center",
    color: "#fff",
    outline: "none",
    boxSizing: "border-box",
  };

  const btnPrimary: React.CSSProperties = {
    width: "100%",
    padding: "12px",
    background: loading ? "rgba(233,30,140,0.4)" : "#e91e8c",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#fff",
    cursor: loading ? "not-allowed" : "pointer",
    marginTop: "16px",
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0f",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem",
    }}>
      <div style={card}>
        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <Link href="/" style={{ color: "rgba(255,255,255,0.3)", fontSize: "12px", textDecoration: "none" }}>
            ← Back to app
          </Link>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#fff", marginTop: "14px" }}>
            Two-factor authentication
          </div>
          <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
            {totpEnabled ? "TOTP is active on your account" : "Add Google Authenticator to your account"}
          </div>
        </div>

        {step === "loading" && (
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>Loading…</div>
        )}

        {step === "error" && (
          <div style={{ color: "#f87171", fontSize: "13px" }}>
            Failed to load. <a href="/totp-setup" style={{ color: "#e91e8c" }}>Refresh</a>
          </div>
        )}

        {/* Step 1: Scan QR / manual entry */}
        {step === "scan" && (
          <>
            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", marginBottom: "20px", lineHeight: 1.6 }}>
              Open <strong style={{ color: "#fff" }}>Google Authenticator</strong> on your phone, tap <em>+</em>, then choose <em>Scan a QR code</em> or <em>Enter a setup key</em>.
            </div>

            {/* QR code via Google Charts API (server-side rendering alternative) */}
            {uri && (
              <div style={{ textAlign: "center", marginBottom: "20px" }}>
                {/* Using browser QR rendering via img with a data: URL would require a lib.
                    Instead we show the otpauth URI as a clickable link that opens on mobile. */}
                <a
                  href={uri}
                  style={{
                    display: "inline-block",
                    padding: "10px 18px",
                    background: "rgba(233,30,140,0.1)",
                    border: "1px solid rgba(233,30,140,0.3)",
                    borderRadius: "8px",
                    color: "#e91e8c",
                    fontSize: "13px",
                    textDecoration: "none",
                    marginBottom: "14px",
                  }}
                >
                  📱 Tap to open in Authenticator app
                </a>
              </div>
            )}

            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "8px" }}>
                Manual entry key
              </div>
              <div style={{
                fontFamily: "monospace",
                fontSize: "15px",
                letterSpacing: "0.15em",
                color: "#fff",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px",
                padding: "12px 14px",
                wordBreak: "break-all",
                userSelect: "all",
              }}>
                {secretKey.match(/.{1,4}/g)?.join(" ")}
              </div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)", marginTop: "6px" }}>
                Type this key into the app. Algorithm: SHA1 · Digits: 6 · Period: 30s
              </div>
            </div>

            <button style={btnPrimary} onClick={() => { setStep("verify"); setError(""); }}>
              I&apos;ve added the account →
            </button>
          </>
        )}

        {/* Step 2: Verify the code */}
        {step === "verify" && (
          <>
            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", marginBottom: "20px", lineHeight: 1.6 }}>
              Enter the 6-digit code shown in Google Authenticator to confirm the setup.
            </div>

            <input
              ref={codeRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#e91e8c"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
              onChange={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/\D/g, "").slice(0, 6); }}
              autoFocus
            />

            {error && (
              <div style={{ marginTop: "10px", fontSize: "13px", color: "#f87171" }}>{error}</div>
            )}

            <button style={btnPrimary} disabled={loading} onClick={verifyCode}>
              {loading ? "Verifying…" : "Enable two-factor authentication"}
            </button>

            <button
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: "12px", cursor: "pointer", marginTop: "10px", padding: 0 }}
              onClick={() => { setStep("scan"); setError(""); }}
            >
              ← Back
            </button>
          </>
        )}

        {/* Done */}
        {step === "done" && (
          <>
            <div style={{ fontSize: "15px", color: "#4ade80", marginBottom: "12px", fontWeight: 600 }}>
              ✓ Two-factor authentication enabled
            </div>
            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
              From now on, you will be asked for a 6-digit code from Google Authenticator each time you sign in.
            </div>
            <Link href="/" style={{ display: "block", marginTop: "20px", ...btnPrimary, textAlign: "center", textDecoration: "none" }}>
              Back to app
            </Link>
          </>
        )}

        {/* Disable TOTP */}
        {step === "disable" && (
          <>
            <div style={{
              marginBottom: "16px",
              padding: "10px 14px",
              background: "rgba(74,222,128,0.08)",
              border: "1px solid rgba(74,222,128,0.2)",
              borderRadius: "8px",
              fontSize: "13px",
              color: "#4ade80",
            }}>
              Two-factor authentication is active on your account.
            </div>

            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", marginBottom: "20px", lineHeight: 1.6 }}>
              To disable it, enter your current authenticator code to confirm.
            </div>

            <input
              ref={codeRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#e91e8c"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
              onChange={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/\D/g, "").slice(0, 6); }}
            />

            {error && (
              <div style={{ marginTop: "10px", fontSize: "13px", color: "#f87171" }}>{error}</div>
            )}

            <button
              style={{ ...btnPrimary, background: loading ? "rgba(239,68,68,0.3)" : "rgba(239,68,68,0.8)" }}
              disabled={loading}
              onClick={disableTotp}
            >
              {loading ? "Disabling…" : "Disable two-factor authentication"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
