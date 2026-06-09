"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { SecurityScanBanner } from "@/components/layout/SecurityScanBanner";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";
import type { SecurityScanResult, ScanFinding, ScanModule } from "@/app/api/security-scan/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreGradient(score: number): string {
  if (score >= 90) return "from-emerald-600 to-emerald-400";
  if (score >= 70) return "from-amber-600 to-amber-400";
  return "from-red-600 to-red-400";
}

function severityBadge(s: ScanFinding["severity"]): string {
  switch (s) {
    case "CRITICAL": return "bg-red-900/60 text-red-200 border-red-500/50";
    case "HIGH":     return "bg-orange-900/50 text-orange-200 border-orange-500/50";
    case "MEDIUM":   return "bg-amber-900/50 text-amber-200 border-amber-500/50";
    case "LOW":      return "bg-sky-900/50 text-sky-200 border-sky-500/50";
    default:         return "bg-zinc-800/60 text-zinc-300 border-zinc-600/50";
  }
}

function moduleCard(mod: ScanModule) {
  const borderCls =
    mod.status === "fail" ? "border-red-500/40 bg-red-950/20"
    : mod.status === "warn" ? "border-amber-500/40 bg-amber-950/10"
    : "border-emerald-500/30 bg-emerald-950/10";
  const statusDot =
    mod.status === "fail" ? "bg-red-500 animate-pulse"
    : mod.status === "warn" ? "bg-amber-400"
    : "bg-emerald-400";
  const statusLabel =
    mod.status === "fail" ? "FAIL"
    : mod.status === "warn" ? "WARN"
    : "PASS";
  const statusCls =
    mod.status === "fail" ? "text-red-300"
    : mod.status === "warn" ? "text-amber-300"
    : "text-emerald-300";

  return (
    <div key={mod.id} className={`rounded-lg border p-4 flex flex-col gap-2 ${borderCls}`}>
      <div className="flex items-center gap-2">
        <span className="text-18">{mod.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-12 font-semibold text-ink-0 truncate">{mod.name}</div>
          <div className="text-10 text-ink-3 font-mono">{mod.checksRun} check{mod.checksRun !== 1 ? "s" : ""} · {mod.findings} finding{mod.findings !== 1 ? "s" : ""}</div>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1.5 font-mono text-10 font-bold ${statusCls}`}>
          <span className={`w-2 h-2 rounded-full ${statusDot}`} />
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

// ── Score ring (SVG) ──────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const trackCls = score >= 90 ? "#10b981" : score >= 70 ? "#f59e0b" : "#ef4444";

  return (
    <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
      <circle
        cx="60" cy="60" r={r}
        fill="none"
        stroke={trackCls}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        style={{ transition: "stroke-dasharray 0.8s ease-out" }}
      />
      <text x="60" y="56" textAnchor="middle" fill="white" fontSize="22" fontWeight="700" fontFamily="monospace">
        {score}
      </text>
      <text x="60" y="72" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="sans-serif">
        / 100
      </text>
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SecurityScanPage() {
  const [result, setResult] = useState<SecurityScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/security-scan");
      if (!res.ok) {
        setError(apiErrorMessage(res.status, "Security scan"));
        return;
      }
      const data = (await res.json()) as SecurityScanResult & { ok?: boolean; error?: string };
      if (data.ok === false) {
        setError(data.error ?? "Security scan returned an error.");
        return;
      }
      setResult(data);
    } catch (e) {
      setError(caughtErrorMessage(e, "Scan failed — please try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void runScan(); }, [runScan]);

  const statusLabel = result?.status ?? "—";
  const statusIcon = result?.status === "PASSED" ? "✅" : result?.status === "ATTENTION" ? "⚠️" : result?.status === "FAILED" ? "❌" : "🔍";

  return (
    <ModuleLayout asanaModule="security-scan" asanaLabel="Security Scan" onRun={() => void runScan()}>
      <ModuleHero
        eyebrow={`🛡️ Hawkeye Security Suite — ${statusIcon} ${statusLabel}`}
        title="Platform Security Scan"
        titleEm="report."
      />

      <div className="w-full pb-16 space-y-6">

        {/* Inline banner */}
        <SecurityScanBanner inline />

        {/* Score + overview card */}
        {!loading && result && (
          <div className="rounded-xl border border-hair-2 bg-bg-panel p-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <ScoreRing score={result.score} />

              <div className="flex-1 space-y-3">
                <div className="flex flex-wrap gap-4">
                  {[
                    { label: "Critical", count: result.criticalFindings, cls: "text-red-400" },
                    { label: "High",     count: result.highFindings,     cls: "text-orange-400" },
                    { label: "Medium",   count: result.mediumFindings,   cls: "text-amber-400" },
                    { label: "Low",      count: result.lowFindings,      cls: "text-sky-400" },
                  ].map(({ label, count, cls }) => (
                    <div key={label} className="text-center">
                      <div className={`text-24 font-mono font-bold ${cls}`}>{count}</div>
                      <div className="text-10 text-ink-3 uppercase tracking-wide">{label}</div>
                    </div>
                  ))}
                </div>

                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${scoreGradient(result.score)} transition-all duration-700`}
                    style={{ width: `${result.score}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-11 text-ink-3">
                  <span>
                    Scan ID: <span className="font-mono text-ink-2">{result.scanId}</span>
                  </span>
                  <span>
                    {new Date(result.scannedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-hair-2 bg-bg-panel p-8 text-center text-ink-3 text-13">
            <div className="mb-3 text-30 animate-spin inline-block">🔍</div>
            <div>Running security scan…</div>
          </div>
        )}

        {error && (
          <div role="alert" aria-live="assertive" className="rounded-xl border border-red-500/30 bg-red-950/20 p-6 text-13 text-red-300">
            {error}
          </div>
        )}

        {/* Modules grid */}
        {!loading && result && (
          <div>
            <h2 className="text-13 font-semibold text-ink-1 mb-3">Scan Modules</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {result.modules.map((mod) => moduleCard(mod))}
            </div>
          </div>
        )}

        {/* Findings list */}
        {!loading && result && (
          <div>
            <h2 className="text-13 font-semibold text-ink-1 mb-3">
              Findings
              {result.totalFindings > 0 && (
                <span className="ml-2 font-mono text-11 text-ink-3">({result.totalFindings})</span>
              )}
            </h2>

            {result.findings.length === 0 ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/15 px-5 py-6 text-center">
                <div className="text-30 mb-2">✅</div>
                <div className="text-13 font-semibold text-emerald-300">No security findings</div>
                <div className="text-11 text-ink-3 mt-1">All checks passed — the platform meets baseline security requirements.</div>
              </div>
            ) : (
              <div className="space-y-3">
                {result.findings.map((f) => (
                  <div key={f.id} className="rounded-xl border border-hair-2 bg-bg-panel px-4 py-4">
                    <div className="flex items-start gap-3">
                      <span className={`shrink-0 self-start mt-0.5 inline-flex items-center px-2 py-0.5 rounded border text-9 font-bold tracking-wider ${severityBadge(f.severity)}`}>
                        {f.severity}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-12 font-semibold text-ink-0">{f.title}</span>
                          <span className="text-10 text-ink-4 font-mono">{f.id}</span>
                          <span className="text-10 text-ink-3 border border-hair-2 rounded px-1.5 py-px">{f.category}</span>
                        </div>
                        <p className="text-11 text-ink-2 mb-2">{f.detail}</p>
                        <div className="rounded-lg bg-black/20 px-3 py-2 text-10 text-ink-2">
                          <span className="font-semibold text-emerald-400">Remediation: </span>
                          {f.remediation}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Re-scan button + powered-by */}
        {!loading && result && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-11 text-ink-4">
              Powered by <span className="font-semibold text-ink-3">Hawkeye Security Suite</span> — AI-powered security analysis
            </span>
            <button
              type="button"
              onClick={() => void runScan()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand/40 text-12 font-semibold text-brand hover:bg-brand/10 transition-colors"
            >
              🔄 Re-scan
            </button>
          </div>
        )}
      </div>
    </ModuleLayout>
  );
}
