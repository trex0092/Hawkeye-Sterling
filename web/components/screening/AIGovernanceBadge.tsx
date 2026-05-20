"use client";

import { useEffect, useState } from "react";

interface GovernanceData {
  biasMonitor?: {
    biasDetected: boolean;
    flaggedGroups?: Array<{ script: string }>;
    sampleSize?: number;
  };
  models?: Array<{ modelId: string }>;
}

interface DriftData {
  report?: {
    driftDetected: boolean;
    driftReason?: string;
    thisWeek?: { approveRate: number };
  } | null;
}

export function AIGovernanceBadge() {
  const [gov, setGov] = useState<GovernanceData | null>(null);
  const [drift, setDrift] = useState<DriftData | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [gRes, dRes] = await Promise.all([
          fetch("/api/ai-governance", { headers: { accept: "application/json" } }),
          fetch("/api/admin/model-drift", { headers: { accept: "application/json" } }),
        ]);
        if (gRes.ok && !cancelled) setGov((await gRes.json()) as GovernanceData);
        if (dRes.ok && !cancelled) setDrift((await dRes.json()) as DriftData);
      } catch { /* non-critical */ }
    };
    void load();
    const t = window.setInterval(() => { void load(); }, 120_000); // 2-min poll
    return () => { cancelled = true; window.clearInterval(t); };
  }, []);

  if (!gov) return null;

  const biasAlert  = gov.biasMonitor?.biasDetected;
  const driftAlert = drift?.report?.driftDetected;
  const modelCount = gov.models?.length ?? 0;

  const overallOk = !biasAlert && !driftAlert;

  return (
    <div className="mt-3 flex items-center gap-3 flex-wrap">
      {/* AI Governance status pill */}
      <div className={`flex items-center gap-1.5 border rounded px-2.5 py-1 ${
        overallOk
          ? "border-green/30 bg-green-dim"
          : "border-red/30 bg-red-dim"
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${overallOk ? "bg-green" : "bg-red animate-pulse"}`} />
        <span className={`text-10 font-semibold uppercase tracking-wide-3 ${overallOk ? "text-green" : "text-red"}`}>
          AI Governance
        </span>
        <span className="text-10 text-ink-3 font-mono">
          {modelCount} model{modelCount !== 1 ? "s" : ""} · {overallOk ? "OK" : "ALERT"}
        </span>
      </div>

      {/* Bias alert */}
      {biasAlert && (
        <div className="flex items-center gap-1.5 border border-red/30 bg-red-dim rounded px-2.5 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red shrink-0 animate-pulse" />
          <span className="text-10 font-semibold text-red uppercase tracking-wide-3">Bias detected</span>
          <span className="text-10 text-ink-2 font-mono">
            {gov.biasMonitor?.flaggedGroups?.map((g) => g.script).join(", ")}
          </span>
        </div>
      )}

      {/* Drift alert */}
      {driftAlert && (
        <div className="flex items-center gap-1.5 border border-amber/30 bg-amber-dim rounded px-2.5 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber shrink-0 animate-pulse" />
          <span className="text-10 font-semibold text-amber uppercase tracking-wide-3">Model drift</span>
        </div>
      )}
    </div>
  );
}
