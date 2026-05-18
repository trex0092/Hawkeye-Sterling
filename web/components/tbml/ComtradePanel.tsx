"use client";

import { useState, useCallback } from "react";
import { PRECIOUS_METALS_HS, UAE_REPORTER_CODE, type ComtradeRecord, type ComtradeQueryResult, type HsCode } from "@/lib/comtrade";
import { runTBMLAnalysis, type TBMLAnalysisResult, type TBMLFlag, type TBMLRiskLevel } from "@/lib/tbml-analysis";
import { fetchJson } from "@/lib/api/fetchWithRetry";

// ── Types ─────────────────────────────────────────────────────────────────────

interface QueryForm {
  reporterCode: string;
  cmdCode: HsCode;
  period: string;
  flowCode: "M" | "X";
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();

const RISK_BADGE: Record<TBMLRiskLevel, string> = {
  LOW: "bg-green-dim text-green border-green/30",
  MEDIUM: "bg-amber-dim text-amber border-amber/30",
  HIGH: "bg-red-dim text-red border-red/30",
};

const FLAG_BADGE: Record<TBMLFlag["type"], string> = {
  mirror_discrepancy: "bg-amber-dim text-amber border-amber/30",
  price_anomaly: "bg-red-dim text-red border-red/30",
  high_risk_partner: "bg-red-dim text-red border-red/30",
  volume_spike: "bg-amber-dim text-amber border-amber/30",
};

const ROW_BG: Record<TBMLRiskLevel, string> = {
  LOW: "",
  MEDIUM: "bg-amber-dim/20",
  HIGH: "bg-red-dim/20",
};

// ── Helper ────────────────────────────────────────────────────────────────────

function fmtUsd(val: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);
}

function fmtKg(val: number | null): string {
  if (val === null || val === 0) return "—";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(val)} kg`;
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: TBMLRiskLevel }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-10 font-bold uppercase border ${RISK_BADGE[level]}`}
    >
      {level}
    </span>
  );
}

function FlagPill({ flag }: { flag: TBMLFlag }) {
  return (
    <span
      title={flag.detail}
      className={`inline-flex items-center px-1.5 py-px rounded text-10 font-semibold border cursor-help ${FLAG_BADGE[flag.type]}`}
    >
      {flag.label}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-10 text-center text-12 text-ink-3">{message}</div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ComtradePanel() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<QueryForm>({
    reporterCode: String(UAE_REPORTER_CODE),
    cmdCode: "7108",
    period: String(CURRENT_YEAR - 1),
    flowCode: "M",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<ComtradeQueryResult | null>(null);
  const [analysis, setAnalysis] = useState<TBMLAnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const handleQuery = useCallback(async () => {
    setLoading(true);
    setError(null);
    setQueryResult(null);
    setAnalysis(null);

    const res = await fetchJson<ComtradeQueryResult>("/api/comtrade-query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reporterCode: form.reporterCode,
        cmdCode: form.cmdCode,
        flowCode: form.flowCode,
        period: form.period,
      }),
      label: "Comtrade query failed",
      timeoutMs: 25_000,
    });

    setLoading(false);

    if (!res.ok || !res.data?.ok) {
      setError(res.error ?? res.data?.error ?? "Query failed");
      return;
    }
    setQueryResult(res.data);
  }, [form]);

  const handleRunAnalysis = useCallback(async () => {
    if (!queryResult?.data?.length) return;
    setAnalysisLoading(true);

    // For mirror-trade discrepancy we need partner export data. We fetch the
    // top-5 partners' export figures concurrently to avoid hitting rate limits.
    const records: ComtradeRecord[] = queryResult.data;
    const topPartners = records
      .slice()
      .sort((a, b) => b.primaryValue - a.primaryValue)
      .slice(0, 5)
      .map((r) => r.partnerCode)
      .filter((code) => code !== 0 && code !== 999); // 0=world, 999=unspecified

    const partnerExportValues: Record<number, number> = {};

    await Promise.all(
      topPartners.map(async (partnerCode) => {
        const res = await fetchJson<ComtradeQueryResult>("/api/comtrade-query", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reporterCode: partnerCode,
            cmdCode: form.cmdCode,
            flowCode: "X",
            period: form.period,
            partnerCode: form.reporterCode,
          }),
          label: "Mirror-trade fetch failed",
          timeoutMs: 20_000,
        });
        if (res.ok && res.data?.ok && res.data.data.length > 0) {
          const total = res.data.data.reduce((s, r) => s + r.primaryValue, 0);
          partnerExportValues[partnerCode] = total;
        }
      }),
    );

    const result = runTBMLAnalysis(records, { partnerExportValues });
    setAnalysis(result);
    setAnalysisLoading(false);
  }, [queryResult, form]);

  const hsOptions = Object.entries(PRECIOUS_METALS_HS) as [HsCode, string][];

  return (
    <div className="border border-hair-2 rounded-xl overflow-hidden bg-bg-panel">
      {/* Panel header / toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-bg-2/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-14 font-semibold text-ink-0">
            TBML Trade Intelligence — UN Comtrade
          </span>
          <span className="text-10 font-mono text-ink-3 border border-hair-2 rounded px-1.5 py-0.5">
            free public API
          </span>
        </div>
        <span className="text-ink-3 text-12">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-hair-2 p-5 space-y-5">
          {/* Query form */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">
                Reporter (ISO numeric)
              </label>
              <input
                type="number"
                value={form.reporterCode}
                onChange={(e) => setForm((f) => ({ ...f, reporterCode: e.target.value }))}
                placeholder="784"
                className="w-full text-12 text-ink-0 bg-bg-1 border border-hair-2 rounded px-2 py-1.5 focus:outline-none focus:border-brand/50"
              />
              <p className="text-10 text-ink-3">UAE = 784</p>
            </div>

            <div className="space-y-1">
              <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">
                HS Code
              </label>
              <select
                value={form.cmdCode}
                onChange={(e) => setForm((f) => ({ ...f, cmdCode: e.target.value as HsCode }))}
                className="w-full text-12 text-ink-0 bg-bg-1 border border-hair-2 rounded px-2 py-1.5 focus:outline-none focus:border-brand/50"
              >
                {hsOptions.map(([code, desc]) => (
                  <option key={code} value={code}>
                    {code} — {desc.slice(0, 30)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">
                Year
              </label>
              <input
                type="number"
                value={form.period}
                min="2000"
                max={CURRENT_YEAR}
                onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
                className="w-full text-12 text-ink-0 bg-bg-1 border border-hair-2 rounded px-2 py-1.5 focus:outline-none focus:border-brand/50"
              />
            </div>

            <div className="space-y-1">
              <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">
                Flow
              </label>
              <select
                value={form.flowCode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, flowCode: e.target.value as "M" | "X" }))
                }
                className="w-full text-12 text-ink-0 bg-bg-1 border border-hair-2 rounded px-2 py-1.5 focus:outline-none focus:border-brand/50"
              >
                <option value="M">Imports (M)</option>
                <option value="X">Exports (X)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleQuery}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-12 font-semibold bg-brand-dim text-brand border border-brand/30 hover:opacity-80 disabled:opacity-40 transition-opacity"
            >
              {loading ? "Fetching…" : "Fetch Trade Data"}
            </button>

            {queryResult?.data && queryResult.data.length > 0 && (
              <button
                type="button"
                onClick={handleRunAnalysis}
                disabled={analysisLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-12 font-semibold bg-amber-dim text-amber border border-amber/30 hover:opacity-80 disabled:opacity-40 transition-opacity"
              >
                {analysisLoading ? "Analysing…" : "Run TBML Analysis"}
              </button>
            )}

            {analysis && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-11 text-ink-3">Overall risk</span>
                <RiskBadge level={analysis.overallRisk} />
                <span className="text-11 text-ink-3 font-mono">
                  {analysis.flagCount} flag{analysis.flagCount !== 1 ? "s" : ""},{" "}
                  {analysis.criticalCount} critical
                </span>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="text-11 text-red bg-red-dim border border-red/30 rounded px-3 py-2 font-mono">
              {error}
            </div>
          )}

          {/* Results */}
          {queryResult && !error && (
            <>
              {queryResult.data.length === 0 ? (
                <EmptyState message="No trade data available for this period." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-12 border-collapse">
                    <thead>
                      <tr className="border-b border-hair-2">
                        <th className="text-left text-10 font-semibold uppercase tracking-wide-3 text-ink-3 pb-2 pr-4">
                          Partner Country
                        </th>
                        <th className="text-right text-10 font-semibold uppercase tracking-wide-3 text-ink-3 pb-2 pr-4">
                          Trade Value (USD)
                        </th>
                        <th className="text-right text-10 font-semibold uppercase tracking-wide-3 text-ink-3 pb-2 pr-4">
                          Net Weight (kg)
                        </th>
                        <th className="text-right text-10 font-semibold uppercase tracking-wide-3 text-ink-3 pb-2 pr-4">
                          Unit Price (USD/kg)
                        </th>
                        <th className="text-left text-10 font-semibold uppercase tracking-wide-3 text-ink-3 pb-2">
                          TBML Risk
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hair">
                      {(analysis?.rows ?? queryResult.data.map((r) => ({
                        record: r,
                        flags: [] as TBMLFlag[],
                        unitPriceUsdKg: r.netWgt && r.netWgt > 0 ? r.primaryValue / r.netWgt : null,
                        riskLevel: "LOW" as TBMLRiskLevel,
                      }))).map((row, i) => (
                        <tr key={i} className={`${ROW_BG[row.riskLevel]} transition-colors`}>
                          <td className="py-2 pr-4 text-ink-0 font-medium">
                            {row.record.partnerDesc || `Code ${row.record.partnerCode}`}
                          </td>
                          <td className="py-2 pr-4 text-right text-ink-1 font-mono tabular-nums">
                            {fmtUsd(row.record.primaryValue)}
                          </td>
                          <td className="py-2 pr-4 text-right text-ink-1 font-mono tabular-nums">
                            {fmtKg(row.record.netWgt)}
                          </td>
                          <td className="py-2 pr-4 text-right text-ink-1 font-mono tabular-nums">
                            {row.unitPriceUsdKg !== null
                              ? fmtUsd(row.unitPriceUsdKg)
                              : "—"}
                          </td>
                          <td className="py-2">
                            {row.flags.length === 0 ? (
                              <span className="text-11 text-green">Clean</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {row.flags.map((flag, j) => (
                                  <FlagPill key={j} flag={flag} />
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <p className="mt-2 text-10 text-ink-3">
                    {queryResult.count ?? queryResult.data.length} record
                    {(queryResult.count ?? queryResult.data.length) !== 1 ? "s" : ""} returned · Source: UN Comtrade public preview API
                    {analysis && ` · Analysis at ${new Date(analysis.checkedAt).toLocaleTimeString()}`}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
