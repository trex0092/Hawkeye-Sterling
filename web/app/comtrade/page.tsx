"use client";

import { useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { caughtErrorMessage } from "@/lib/client/error-utils";

// UN Comtrade reporter codes (major trading partners relevant to UAE AML/TBML)
const REPORTER_CODES: Array<{ code: number; label: string }> = [
  { code: 784, label: "UAE" },
  { code: 682, label: "Saudi Arabia" },
  { code: 356, label: "India" },
  { code: 156, label: "China" },
  { code: 840, label: "USA" },
  { code: 276, label: "Germany" },
  { code: 826, label: "UK" },
  { code: 756, label: "Switzerland" },
  { code: 400, label: "Jordan" },
  { code: 414, label: "Kuwait" },
  { code: 634, label: "Qatar" },
];

const FLOW_CODES = [
  { code: "M", label: "Imports" },
  { code: "X", label: "Exports" },
  { code: "MX", label: "Both" },
];

interface ComtradeRow {
  cmdCode?: string;
  cmdDesc?: string;
  reporterDesc?: string;
  partnerDesc?: string;
  flowDesc?: string;
  period?: string;
  primaryValue?: number;
  netWgt?: number;
  qty?: number;
  [key: string]: unknown;
}

interface ComtradeResult {
  ok: boolean;
  count: number;
  data: ComtradeRow[];
  error?: string;
}

type TbmlRisk = "low" | "medium" | "high" | "critical";

function tbmlAssess(hsCode: string, value: number, _reporterCode: number): { risk: TbmlRisk; flags: string[] } {
  const flags: string[] = [];
  // High-risk HS chapters for TBML (gold, diamonds, electronics, chemicals, weapons precursors)
  const highRiskChapters = ["71", "84", "85", "90", "28", "29", "93"];
  const chapter = hsCode.slice(0, 2);
  if (highRiskChapters.includes(chapter)) flags.push(`HS chapter ${chapter} is a known TBML vector`);
  if (value > 5_000_000) flags.push("Transaction value > USD 5M warrants EDD");
  if (value > 1_000_000 && flags.length > 0) flags.push("High-value controlled goods — verify end-user");
  const risk: TbmlRisk = flags.length >= 2 ? "high" : flags.length === 1 ? "medium" : "low";
  return { risk, flags };
}

const RISK_COLORS: Record<TbmlRisk, string> = {
  low: "text-green-400",
  medium: "text-amber-400",
  high: "text-red-400",
  critical: "text-red-500 font-bold",
};

export default function ComtradePage() {
  const [reporterCode, setReporterCode] = useState("784");
  const [cmdCode, setCmdCode] = useState("");
  const [flowCode, setFlowCode] = useState("M");
  const [period, setPeriod] = useState("202312");
  const [partnerCode, setPartnerCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ComtradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/comtrade-query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reporterCode: parseInt(reporterCode, 10),
          cmdCode: cmdCode.trim(),
          flowCode,
          period: period.trim(),
          ...(partnerCode.trim() ? { partnerCode: parseInt(partnerCode.trim(), 10) } : {}),
        }),
      });
      const json = (await res.json()) as ComtradeResult;
      if (!json.ok) {
        setError(json.error ?? "Query failed");
      } else {
        setResult(json);
      }
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error"));
    } finally {
      setLoading(false);
    }
  }

  const rows = result?.data ?? [];

  return (
    <ModuleLayout asanaModule="comtrade" asanaLabel="COMTRADE Trade Intelligence">
      <ModuleHero
        eyebrow=""
        title="Comtrade TBML Risk Query"
        intro="UN Comtrade trade statistics lookup — identify trade-based money laundering risk by HS code, origin country, and transaction value"
      />

      <form onSubmit={(e) => void handleSubmit(e)} className="bg-surface-1 border border-border-subtle rounded-lg p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs text-ink-3 mb-1">Reporter Country</label>
            <select
              value={reporterCode}
              onChange={(e) => setReporterCode(e.target.value)}
              className="w-full bg-surface-2 border border-border-subtle rounded px-3 py-2 text-sm text-ink-1"
            >
              {REPORTER_CODES.map((r) => (
                <option key={r.code} value={r.code}>{r.label} ({r.code})</option>
              ))}
              <option value="">Other (enter code manually)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-ink-3 mb-1">HS Code (cmdCode)</label>
            <input
              type="text"
              value={cmdCode}
              onChange={(e) => setCmdCode(e.target.value)}
              placeholder="e.g. 7108 (gold), 8542 (ICs)"
              required
              className="w-full bg-surface-2 border border-border-subtle rounded px-3 py-2 text-sm text-ink-1 placeholder:text-ink-4"
            />
          </div>

          <div>
            <label className="block text-xs text-ink-3 mb-1">Trade Flow</label>
            <select
              value={flowCode}
              onChange={(e) => setFlowCode(e.target.value)}
              className="w-full bg-surface-2 border border-border-subtle rounded px-3 py-2 text-sm text-ink-1"
            >
              {FLOW_CODES.map((f) => (
                <option key={f.code} value={f.code}>{f.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-ink-3 mb-1">Period (YYYYMM or YYYY)</label>
            <input
              type="text"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="202312"
              required
              className="w-full bg-surface-2 border border-border-subtle rounded px-3 py-2 text-sm text-ink-1 placeholder:text-ink-4"
            />
          </div>

          <div>
            <label className="block text-xs text-ink-3 mb-1">Partner Country Code (optional)</label>
            <input
              type="text"
              value={partnerCode}
              onChange={(e) => setPartnerCode(e.target.value)}
              placeholder="e.g. 276 (Germany)"
              className="w-full bg-surface-2 border border-border-subtle rounded px-3 py-2 text-sm text-ink-1 placeholder:text-ink-4"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-3 py-1.5 rounded bg-accent text-white text-12 font-medium disabled:opacity-50 hover:bg-accent-hover transition"
        >
          {loading ? "Querying Comtrade…" : "Run TBML Risk Query"}
        </button>
      </form>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {result && (
        <section className="bg-surface-1 border border-border-subtle rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
            <span className="text-sm font-semibold text-ink-1">Results — {result.count} record(s)</span>
            {rows.length === 0 && (
              <span className="text-xs text-ink-3">No trade data found for these parameters</span>
            )}
          </div>
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-ink-3 text-left border-b border-border-subtle bg-surface-2">
                    <th className="py-2 px-3">HS Code</th>
                    <th className="py-2 px-3">Description</th>
                    <th className="py-2 px-3">Flow</th>
                    <th className="py-2 px-3">Partner</th>
                    <th className="py-2 px-3">Period</th>
                    <th className="py-2 px-3 text-right">Value (USD)</th>
                    <th className="py-2 px-3">TBML Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((row, i) => {
                    const value = typeof row.primaryValue === "number" ? row.primaryValue : 0;
                    const { risk, flags } = tbmlAssess(row.cmdCode ?? "", value, parseInt(reporterCode, 10));
                    return (
                      <tr key={i} className={`border-b border-border-subtle/40 ${risk !== "low" ? "bg-amber-400/5" : ""}`}>
                        <td className="py-2 px-3 font-mono">{row.cmdCode ?? "—"}</td>
                        <td className="py-2 px-3 text-ink-2 max-w-xs truncate">{(row.cmdDesc ?? "—").slice(0, 60)}</td>
                        <td className="py-2 px-3">{row.flowDesc ?? "—"}</td>
                        <td className="py-2 px-3">{row.partnerDesc ?? "World"}</td>
                        <td className="py-2 px-3 font-mono">{row.period ?? "—"}</td>
                        <td className="py-2 px-3 font-mono text-right">
                          {value > 0 ? `$${value.toLocaleString("en-GB")}` : "—"}
                        </td>
                        <td className="py-2 px-3">
                          <span className={RISK_COLORS[risk]}>{risk.toUpperCase()}</span>
                          {flags.length > 0 && (
                            <div className="text-ink-3 text-10 mt-0.5">{flags[0]}</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length > 50 && (
                <div className="px-4 py-2 text-xs text-ink-3">
                  Showing 50 of {rows.length} rows.
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </ModuleLayout>
  );
}
