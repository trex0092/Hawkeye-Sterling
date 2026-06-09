"use client";

import { useEffect, useState } from "react";
import { ModuleHero } from "@/components/layout/ModuleLayout";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";
import type { RmfStatusResponse, RmfFunctionScore, AtlasTactic } from "@/app/api/governance/rmf-status/route";

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 85) return "text-emerald-300";
  if (score >= 70) return "text-amber-300";
  return "text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 85) return "bg-emerald-950/40 border-emerald-500/30";
  if (score >= 70) return "bg-amber-950/40 border-amber-500/30";
  return "bg-red-950/40 border-red-500/30";
}

function statusBadge(status: "green" | "amber" | "red"): string {
  if (status === "green") return "bg-emerald-950/40 text-emerald-300 border-emerald-500/30";
  if (status === "amber") return "bg-amber-950/40 text-amber-300 border-amber-500/30";
  return "bg-red-950/40 text-red-400 border-red-500/30";
}

function attestBadge(status: "current" | "due" | "overdue"): string {
  if (status === "current") return "bg-emerald-950/40 text-emerald-300 border-emerald-500/30";
  if (status === "due")     return "bg-amber-950/40 text-amber-300 border-amber-500/30";
  return "bg-red-950/40 text-red-400 border-red-500/30";
}

// ── NIST AI RMF Scorecard ────────────────────────────────────────────────────

function RmfFunctionCard({ fn }: { fn: RmfFunctionScore }) {
  return (
    <div className={`border rounded-xl p-4 flex flex-col gap-3 ${scoreBg(fn.score)}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">{fn.fn}</div>
          <div className="text-13 font-semibold text-ink-0 mt-0.5">{fn.label}</div>
        </div>
        <div className={`text-28 font-display font-bold tabular-nums ${scoreColor(fn.score)}`}>
          {fn.score}
        </div>
      </div>

      <div className="w-full bg-bg-2 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all duration-700 ${
            fn.score >= 85 ? "bg-emerald-500" : fn.score >= 70 ? "bg-amber-400" : "bg-red-500"
          }`}
          style={{ width: `${fn.score}%` }}
        />
      </div>

      <ul className="space-y-0.5">
        {fn.controls.map((c, i) => (
          <li key={i} className="flex items-start gap-1.5 text-11 text-ink-2">
            <span className="text-emerald-400 mt-0.5 shrink-0">✓</span>
            <span>{c}</span>
          </li>
        ))}
      </ul>

      {fn.gaps.length > 0 && (
        <div className="border-t border-amber-500/20 pt-2 space-y-0.5">
          {fn.gaps.map((g, i) => (
            <div key={i} className="flex items-start gap-1.5 text-11 text-amber-300">
              <span className="mt-0.5 shrink-0">⚠</span>
              <span>{g}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Model Registry Table ─────────────────────────────────────────────────────

function ModelTable({ models }: { models: RmfStatusResponse["models"] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-hair-2">
      <table className="w-full text-11 border-collapse">
        <thead>
          <tr className="border-b border-hair-2 bg-bg-1">
            <th className="text-left px-3 py-2 font-semibold text-ink-3 uppercase tracking-wide-2">Purpose</th>
            <th className="text-left px-3 py-2 font-semibold text-ink-3 uppercase tracking-wide-2">Model</th>
            <th className="text-left px-3 py-2 font-semibold text-ink-3 uppercase tracking-wide-2">Risk Tier</th>
            <th className="text-left px-3 py-2 font-semibold text-ink-3 uppercase tracking-wide-2">Attestation</th>
            <th className="text-left px-3 py-2 font-semibold text-ink-3 uppercase tracking-wide-2">Due Date</th>
            <th className="text-left px-3 py-2 font-semibold text-ink-3 uppercase tracking-wide-2">Approved By</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m, i) => (
            <tr key={i} className="border-b border-hair-2 last:border-0 hover:bg-bg-1/50 transition-colors">
              <td className="px-3 py-2 text-ink-1 max-w-[220px] truncate" title={m.purpose}>{m.purpose}</td>
              <td className="px-3 py-2 font-mono text-ink-2 text-10">{m.modelId.split("-").slice(-3).join("-")}</td>
              <td className="px-3 py-2">
                <span className={`inline-flex px-1.5 py-px rounded border font-semibold text-9 uppercase tracking-wide-2 ${
                  m.riskTier === "critical" ? "bg-red-950/40 text-red-400 border-red-500/30" :
                  m.riskTier === "high"     ? "bg-amber-950/40 text-amber-300 border-amber-500/30" :
                  "bg-bg-1 text-ink-3 border-hair-2"
                }`}>
                  {m.riskTier}
                </span>
              </td>
              <td className="px-3 py-2">
                <span className={`inline-flex px-1.5 py-px rounded border font-semibold text-9 uppercase tracking-wide-2 ${attestBadge(m.attestationStatus)}`}>
                  {m.attestationStatus}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-10 text-ink-3">{m.nextAttestationDue}</td>
              <td className="px-3 py-2 text-ink-2 uppercase text-10">{m.approvedBy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── MITRE ATLAS Coverage Heatmap ─────────────────────────────────────────────

function AtlasHeatmap({ tactics }: { tactics: AtlasTactic[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {tactics.map((t) => (
        <div
          key={t.id}
          title={t.probeIds.length > 0 ? `Covered by: ${t.probeIds.join(", ")}` : "No probe coverage"}
          className={`relative border rounded-lg p-3 flex flex-col gap-1 cursor-default transition-all hover:scale-[1.02] ${
            t.covered
              ? "bg-emerald-950/30 border-emerald-500/30"
              : "bg-red-950/20 border-red-500/20"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-9 text-ink-4">{t.id}</span>
            <span className={`text-13 ${t.covered ? "text-emerald-400" : "text-red-400 opacity-40"}`}>
              {t.covered ? "✓" : "✗"}
            </span>
          </div>
          <div className="text-10 font-semibold text-ink-1 leading-snug">{t.name}</div>
          <div className="text-9 text-ink-4">{t.phase}</div>
          {t.probeIds.length > 0 && (
            <div className="flex flex-wrap gap-0.5 mt-1">
              {t.probeIds.slice(0, 3).map((id) => (
                <span key={id} className="font-mono text-8 bg-emerald-950/40 text-emerald-300 px-1 rounded">{id}</span>
              ))}
              {t.probeIds.length > 3 && (
                <span className="font-mono text-8 text-ink-4">+{t.probeIds.length - 3}</span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main Section ──────────────────────────────────────────────────────────────

export function GovernanceSection() {
  const [data, setData] = useState<RmfStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/governance/rmf-status")
      .then((r) => {
        if (!r.ok) throw new Error(apiErrorMessage(r.status, "Governance"));
        return r.json() as Promise<RmfStatusResponse>;
      })
      .then((d) => setData(d))
      .catch((e) => setError(caughtErrorMessage(e, "Failed to load governance data")))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-bg-1 rounded w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-48 bg-bg-1 rounded-xl" />)}
        </div>
        <div className="h-40 bg-bg-1 rounded-xl" />
      </div>
    );
  }

  if (error || !data || !Array.isArray(data.rmfFunctions) || !Array.isArray(data.models) || !Array.isArray(data.atlasTactics)) {
    return <div className="text-red-400 text-13 p-4 border border-red-500/30 rounded-xl bg-red-950/20">{error ?? "No data"}</div>;
  }

  const overallStatus = data.overallRmfScore >= 85 ? "green" : data.overallRmfScore >= 70 ? "amber" : "red";

  return (
    <div className="space-y-8">
      <ModuleHero
        eyebrow={`NIST AI RMF · MITRE ATLAS · Federal Decree-Law No. 10 of 2025 Art.18 — ${data.models.length} models registered`}
        title="AI Governance"
      />

      {/* Overall score */}
      <div className={`flex items-center gap-4 border rounded-xl p-4 ${scoreBg(data.overallRmfScore)}`}>
        <div className={`text-48 font-display font-bold tabular-nums ${scoreColor(data.overallRmfScore)}`}>
          {data.overallRmfScore}
        </div>
        <div>
          <div className="text-14 font-semibold text-ink-0">Overall NIST AI RMF Score</div>
          <div className="text-12 text-ink-2 mt-0.5">
            Policy v{data.policyVersion} ·{" "}
            {data.overdueCount === 0
              ? <span className="text-emerald-300">All attestations current</span>
              : <span className="text-amber-300">{data.overdueCount} attestation(s) overdue</span>
            } · ATLAS gaps: {data.atlasGapCount}
          </div>
        </div>
        <div className="ml-auto">
          <span className={`inline-flex px-2 py-1 rounded border font-semibold text-11 uppercase tracking-wide-2 ${statusBadge(overallStatus)}`}>
            {overallStatus === "green" ? "COMPLIANT" : overallStatus === "amber" ? "REVIEW" : "ACTION REQUIRED"}
          </span>
        </div>
      </div>

      {/* RMF Functions */}
      <div>
        <h3 className="text-12 font-semibold uppercase tracking-wide-3 text-ink-3 mb-3">NIST AI RMF Functions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {data.rmfFunctions.map((fn) => (
            <RmfFunctionCard key={fn.fn} fn={fn} />
          ))}
        </div>
      </div>

      {/* Model registry */}
      <div>
        <h3 className="text-12 font-semibold uppercase tracking-wide-3 text-ink-3 mb-3">
          Model Registry — {data.models.length} models · Federal Decree-Law No. 10 of 2025 Art.18
        </h3>
        <ModelTable models={data.models} />
      </div>

      {/* MITRE ATLAS heatmap */}
      <div>
        <h3 className="text-12 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1">
          MITRE ATLAS Attack Coverage Heatmap
        </h3>
        <p className="text-11 text-ink-3 mb-3">
          {data.atlasTactics.filter((t) => t.covered).length}/{data.atlasTactics.length} tactics covered by adversarial probes
          {data.atlasGapCount > 0 && <span className="text-amber-300 ml-1">· {data.atlasGapCount} gap(s)</span>}
        </p>
        <AtlasHeatmap tactics={data.atlasTactics} />
      </div>

      {/* Policy attestation */}
      <div className="border border-hair-2 rounded-xl p-4 bg-bg-panel">
        <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1">
          Governance Policy Attestation
        </div>
        <p className="text-12 text-ink-2 leading-relaxed">{data.policyAttestation}</p>
        <div className="mt-2 text-10 text-ink-4">
          Generated {new Date(data.generatedAt).toLocaleString()} · Tenant: {data.tenantId}
        </div>
      </div>
    </div>
  );
}
