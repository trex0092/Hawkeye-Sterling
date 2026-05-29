"use client";

// Hawkeye Security Scan Banner — renders a GitHub-Actions-style notification
// card showing the latest platform security scan result. Polls /api/security-scan
// on mount and refreshes every 5 minutes. Dismissible per-session via
// localStorage; re-appears whenever the status degrades to FAILED.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { SecurityScanResult, ScanFinding, ScanModule } from "@/app/api/security-scan/route";

const POLL_MS = 5 * 60 * 1000;
const DISMISS_KEY = "hawkeye.secScan.dismissedAt";
const DISMISS_TTL_MS = 60 * 60 * 1000; // re-show after 1h even if dismissed (unless PASSED)

// ── Status display helpers ────────────────────────────────────────────────────

function statusConfig(s: SecurityScanResult["status"]) {
  switch (s) {
    case "PASSED":
      return {
        icon: "✅",
        label: "PASSED",
        bannerCls: "border-emerald-400/40 bg-emerald-950/30",
        badgeCls: "bg-emerald-900/60 text-emerald-300 border-emerald-500/40",
        dotCls: "bg-emerald-400",
        scoreCls: "text-emerald-400",
      };
    case "ATTENTION":
      return {
        icon: "⚠️",
        label: "ATTENTION",
        bannerCls: "border-amber-400/40 bg-amber-950/20",
        badgeCls: "bg-amber-900/50 text-amber-300 border-amber-500/40",
        dotCls: "bg-amber-400 animate-pulse",
        scoreCls: "text-amber-400",
      };
    case "FAILED":
      return {
        icon: "❌",
        label: "FAILED",
        bannerCls: "border-red-400/40 bg-red-950/20",
        badgeCls: "bg-red-900/50 text-red-300 border-red-500/40",
        dotCls: "bg-red-500 animate-pulse",
        scoreCls: "text-red-400",
      };
  }
}

function severityConfig(s: ScanFinding["severity"]) {
  switch (s) {
    case "CRITICAL": return "bg-red-900/60 text-red-300 border-red-500/40";
    case "HIGH":     return "bg-orange-900/50 text-orange-300 border-orange-500/40";
    case "MEDIUM":   return "bg-amber-900/50 text-amber-300 border-amber-500/40";
    case "LOW":      return "bg-sky-900/50 text-sky-300 border-sky-500/40";
    default:         return "bg-zinc-800/60 text-zinc-300 border-zinc-600/40";
  }
}

function moduleStatusIcon(s: ScanModule["status"]) {
  if (s === "pass") return <span className="text-emerald-400 text-12">✓</span>;
  if (s === "warn") return <span className="text-amber-400 text-12">⚠</span>;
  return <span className="text-red-400 text-12">✗</span>;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  /** If true, rendered inline in a page (full width). Default: fixed bottom-right banner. */
  inline?: boolean;
}

export function SecurityScanBanner({ inline = false }: Props) {
  const [result, setResult] = useState<SecurityScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const fetchScan = useCallback(async () => {
    try {
      const res = await fetch("/api/security-scan");
      if (!res.ok) return;
      const data = (await res.json()) as SecurityScanResult & { ok?: boolean };
      setResult(data);

      // Re-show banner if status is FAILED regardless of dismissal
      if (data.status === "FAILED") {
        localStorage.removeItem(DISMISS_KEY);
        setDismissed(false);
      }
    } catch {
      // Network error — keep previous result
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Check dismissal state
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const age = Date.now() - Number(dismissedAt);
      if (age < DISMISS_TTL_MS) {
        setDismissed(true);
        setLoading(false);
      }
    }

    void fetchScan();
    const interval = setInterval(() => void fetchScan(), POLL_MS);
    return () => clearInterval(interval);
  }, [fetchScan]);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }, []);

  // Don't render while loading or dismissed (unless inline)
  if (loading || (!inline && dismissed) || !result) return null;
  if (!inline && dismissed) return null;

  const cfg = statusConfig(result.status);

  // ── Inline full-width card ──────────────────────────────────────────────────
  if (inline) {
    return (
      <div className={`rounded-xl border-2 ${cfg.bannerCls} overflow-hidden`}>
        {/* Header row */}
        <div className="flex items-start gap-3 px-4 py-3">
          <div className="shrink-0 mt-0.5">
            <span className="text-20">{cfg.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-13 font-bold text-ink-0">Hawkeye Security Scan</span>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-10 font-bold tracking-wider ${cfg.badgeCls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotCls}`} />
                {cfg.label}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-12 text-ink-2">
              <span>
                <span className="font-semibold text-ink-1">Overall Score:</span>{" "}
                <span className={`font-mono font-bold ${cfg.scoreCls}`}>{result.score}/100</span>
              </span>
              <span className="text-ink-4">|</span>
              <span>
                <span className="font-semibold text-ink-1">Critical findings:</span>{" "}
                <span className={`font-mono font-bold ${result.criticalFindings > 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {result.criticalFindings}
                </span>
              </span>
              {result.highFindings > 0 && (
                <>
                  <span className="text-ink-4">|</span>
                  <span>
                    <span className="font-semibold text-ink-1">High:</span>{" "}
                    <span className="font-mono font-bold text-orange-400">{result.highFindings}</span>
                  </span>
                </>
              )}
            </div>
            {result.totalFindings === 0 && (
              <div className="text-11 text-ink-3 italic mt-0.5">No security findings — all checks passed.</div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-10 text-ink-4 font-mono">{relTime(result.scannedAt)}</span>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="text-10 font-semibold text-brand hover:text-brand-light px-2 py-1 rounded border border-brand/30 hover:border-brand/60 transition-colors"
            >
              {expanded ? "Hide details ↑" : "Details ↓"}
            </button>
          </div>
        </div>

        {/* Module strip */}
        <div className="flex gap-0 border-t border-white/5 divide-x divide-white/5">
          {result.modules.map((mod) => (
            <div key={mod.id} className="flex-1 flex items-center gap-2 px-3 py-2">
              <span className="text-14">{mod.icon}</span>
              <div className="min-w-0">
                <div className="text-10 text-ink-2 truncate">{mod.name}</div>
                <div className="flex items-center gap-1">
                  {moduleStatusIcon(mod.status)}
                  <span className="text-9 font-mono text-ink-4">{mod.checksRun} check{mod.checksRun !== 1 ? "s" : ""}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Expanded findings */}
        {expanded && result.findings.length > 0 && (
          <div className="border-t border-white/10 divide-y divide-white/5">
            {result.findings.map((f) => (
              <div key={f.id} className="px-4 py-3 flex gap-3">
                <span className={`shrink-0 self-start mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded border text-9 font-bold tracking-wider ${severityConfig(f.severity)}`}>
                  {f.severity}
                </span>
                <div className="min-w-0">
                  <div className="text-12 font-semibold text-ink-0">{f.title}</div>
                  <div className="text-11 text-ink-2 mt-0.5">{f.detail}</div>
                  <div className="text-10 text-ink-3 mt-1">
                    <span className="font-semibold text-ink-2">Fix: </span>
                    {f.remediation}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {expanded && result.findings.length === 0 && (
          <div className="border-t border-white/10 px-4 py-3 text-12 text-emerald-400 text-center">
            All security checks passed — no findings to display.
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-white/5 bg-black/10">
          <span className="text-10 text-ink-4">
            Powered by{" "}
            <span className="font-semibold text-ink-3">Hawkeye Security Suite</span>
            {" — "}AI-powered security analysis
          </span>
          <div className="flex items-center gap-3">
            <Link href="/security-scan" className="text-10 font-semibold text-brand hover:underline">
              Full report →
            </Link>
            <button
              type="button"
              onClick={() => void fetchScan()}
              className="text-10 font-semibold text-ink-3 hover:text-ink-1"
            >
              Re-scan
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Floating notification (bottom-right) ──────────────────────────────────
  if (dismissed) return null;

  return (
    <div
      className={`fixed bottom-4 right-4 z-[9000] w-80 rounded-xl border-2 shadow-2xl backdrop-blur-lg overflow-hidden ${cfg.bannerCls}`}
      style={{ animation: "hawkeye-scan-in 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}
      role="status"
      aria-live="polite"
    >
      {/* Header */}
      <div className="flex items-start gap-2.5 px-3.5 py-3">
        <span className="text-18 shrink-0 mt-0.5">{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-12 font-bold text-ink-0">Hawkeye Security Scan</span>
            <span className={`inline-flex items-center gap-1 px-1.5 py-px rounded border text-9 font-bold tracking-wider ${cfg.badgeCls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotCls}`} />
              {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-2 text-11 text-ink-2">
            <span>
              Score: <span className={`font-mono font-bold ${cfg.scoreCls}`}>{result.score}/100</span>
            </span>
            <span className="text-ink-4">|</span>
            <span>
              Critical: <span className={`font-mono font-bold ${result.criticalFindings > 0 ? "text-red-400" : "text-emerald-400"}`}>{result.criticalFindings}</span>
            </span>
          </div>
          {result.totalFindings === 0 ? (
            <div className="text-10 text-ink-3 italic mt-0.5">No scannable issues found.</div>
          ) : (
            <div className="text-10 text-ink-3 mt-0.5">
              {result.totalFindings} finding{result.totalFindings !== 1 ? "s" : ""} — {result.highFindings} high, {result.mediumFindings} medium
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 text-ink-3 hover:text-ink-0 text-16 leading-none p-1 -mr-1 -mt-1"
          aria-label="Dismiss scan notification"
        >
          ×
        </button>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3.5 py-2 border-t border-white/5 bg-black/15">
        <span className="text-9 text-ink-4">
          Powered by <span className="font-semibold text-ink-3">Hawkeye Security Suite</span>
        </span>
        <Link
          href="/security-scan"
          className="text-10 font-semibold text-brand hover:underline"
        >
          View report →
        </Link>
      </div>

      <style jsx>{`
        @keyframes hawkeye-scan-in {
          from { transform: translateY(20px) scale(0.95); opacity: 0; }
          to   { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default SecurityScanBanner;
