"use client";

import { useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type {
  MlroDecision,
  FpAnalysisResult,
  FpPattern,
  ThresholdSuggestion,
} from "@/app/api/fp-optimizer/analyze/route";
import type { PredictResult, PredictRequest } from "@/app/api/fp-optimizer/predict/route";

// ─── Seed decisions for demo ──────────────────────────────────────────────────

const SEED_DECISIONS: MlroDecision[] = [
  { caseId: "SCR-1001", subject: "Ahmed Al-Rahman", matchScore: 68, listName: "OFAC SDN", mlroDecision: "false_positive", decisionReason: "Common UAE name, DOB mismatch -22 years", clientType: "Retail Individual", jurisdiction: "UAE", riskScore: 35 },
  { caseId: "SCR-1002", subject: "Mohammed Al-Hashimi", matchScore: 72, listName: "UN Consolidated", mlroDecision: "false_positive", decisionReason: "Different nationality, name collision", clientType: "Retail Individual", jurisdiction: "UAE", riskScore: 40 },
  { caseId: "SCR-1003", subject: "Ibrahim Sanction Corp LLC", matchScore: 91, listName: "EU Consolidated", mlroDecision: "true_positive", decisionReason: "Exact entity match, confirmed designation", clientType: "Corporate", jurisdiction: "Iran", riskScore: 95 },
  { caseId: "SCR-1004", subject: "Ali Hassan Al-Farsi", matchScore: 65, listName: "OFAC SDN", mlroDecision: "false_positive", decisionReason: "UAE national, listed party is Iraqi national", clientType: "Retail Individual", jurisdiction: "UAE", riskScore: 30 },
  { caseId: "SCR-1005", subject: "Fatima Al-Zahra Trading", matchScore: 74, listName: "HM Treasury", mlroDecision: "false_positive", decisionReason: "Different registration country, similar name", clientType: "Corporate", jurisdiction: "Saudi Arabia", riskScore: 45 },
  { caseId: "SCR-1006", subject: "Khalid Al-Mansoori", matchScore: 69, listName: "OFAC SDN", mlroDecision: "false_positive", decisionReason: "GCC national, listed entity is Venezuelan", clientType: "PEP", jurisdiction: "UAE", riskScore: 55 },
  { caseId: "SCR-1007", subject: "Yasir Rashid Khan", matchScore: 71, listName: "HM Treasury", mlroDecision: "false_positive", decisionReason: "South Asian name collision, DOB -15 years", clientType: "Retail Individual", jurisdiction: "Pakistan", riskScore: 38 },
  { caseId: "SCR-1008", subject: "Zoltan Veresegyhazy", matchScore: 88, listName: "EU Consolidated", mlroDecision: "true_positive", decisionReason: "Hungarian national under EU asset freeze", clientType: "HNW Individual", jurisdiction: "Hungary", riskScore: 89 },
  { caseId: "SCR-1009", subject: "Ahmed Al-Sayed", matchScore: 67, listName: "OFAC SDN", mlroDecision: "false_positive", decisionReason: "Extremely common name, no other matching attributes", clientType: "Retail Individual", jurisdiction: "Egypt", riskScore: 32 },
  { caseId: "SCR-1010", subject: "Global Trade International LLC", matchScore: 63, listName: "EU Consolidated", mlroDecision: "false_positive", decisionReason: "Generic corporate name, different jurisdiction", clientType: "Corporate", jurisdiction: "UAE", riskScore: 28 },
  { caseId: "SCR-1011", subject: "Mohammed Al-Rashid", matchScore: 73, listName: "OFAC SDN", mlroDecision: "false_positive", decisionReason: "Common GCC name, verified UAE source of funds", clientType: "Retail Individual", jurisdiction: "Qatar", riskScore: 42 },
  { caseId: "SCR-1012", subject: "Pyotr Ivanovich Volkov", matchScore: 85, listName: "EU Consolidated", mlroDecision: "true_positive", decisionReason: "Russian oligarch, confirmed EU designation", clientType: "HNW Individual", jurisdiction: "Russia", riskScore: 91 },
];

const SEED_CSV = SEED_DECISIONS
  .map((d) => `${d.caseId},${d.subject},${d.matchScore},${d.listName},${d.mlroDecision},${d.decisionReason.slice(0, 40)},${d.clientType},${d.jurisdiction},${d.riskScore}`)
  .join("\n");

// ─── Trend data (mock) ───────────────────────────────────────────────────────

const TREND_DATA = [
  { month: "Nov 24", fpRate: 81, decisions: 92 },
  { month: "Dec 24", fpRate: 78, decisions: 104 },
  { month: "Jan 25", fpRate: 76, decisions: 118 },
  { month: "Feb 25", fpRate: 73, decisions: 97 },
  { month: "Mar 25", fpRate: 71, decisions: 134 },
  { month: "Apr 25", fpRate: 73, decisions: 112 },
];

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "analysis" | "prediction" | "trends";

export default function FpOptimizerPage() {
  const [tab, setTab] = useState<Tab>("analysis");

  // Analysis tab
  const [csvInput, setCsvInput] = useState(SEED_CSV);
  const [analysisResult, setAnalysisResult] = useState<FpAnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [appliedThresholds, setAppliedThresholds] = useState<Set<number>>(new Set());

  // Prediction tab
  const [predictForm, setPredictForm] = useState<PredictRequest>({
    subject: "Ahmed Al-Rahman",
    listName: "OFAC SDN",
    matchScore: 68,
    clientType: "Retail Individual",
    jurisdiction: "UAE",
  });
  const [predictResult, setPredictResult] = useState<PredictResult | null>(null);
  const [predictLoading, setPredictLoading] = useState(false);

  function parseDecisions(csv: string): MlroDecision[] {
    return csv
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line, idx) => {
        const p = line.split(",");
        return {
          caseId: p[0]?.trim() ?? `CASE-${idx}`,
          subject: p[1]?.trim() ?? "",
          matchScore: parseFloat(p[2] ?? "70"),
          listName: p[3]?.trim() ?? "Unknown List",
          mlroDecision: (p[4]?.trim() === "true_positive" ? "true_positive" : "false_positive") as MlroDecision["mlroDecision"],
          decisionReason: p[5]?.trim() ?? "",
          clientType: p[6]?.trim() ?? "Individual",
          jurisdiction: p[7]?.trim() ?? "UAE",
          riskScore: parseFloat(p[8] ?? "50"),
        };
      })
      .filter((d) => d.subject);
  }

  async function analyzePatterns() {
    const decisions = parseDecisions(csvInput);
    setAnalysisLoading(true);
    try {
      const res = await fetch("/api/fp-optimizer/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions }),
      });
      const data = await res.json() as FpAnalysisResult;
      setAnalysisResult(data);
    } catch {
      // keep existing
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function predictFp() {
    setPredictLoading(true);
    try {
      const res = await fetch("/api/fp-optimizer/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(predictForm),
      });
      const data = await res.json() as PredictResult;
      setPredictResult(data);
    } catch {
      // keep existing
    } finally {
      setPredictLoading(false);
    }
  }

  const kpiFpRate = analysisResult ? `${analysisResult.fpRate.toFixed(1)}%` : "—";
  const kpiTimeSaved = analysisResult ? analysisResult.estimatedTimeSaving.split(" ")[0] + " hrs" : "—";
  const kpiPatterns = analysisResult ? String(analysisResult.patterns.length) : "—";
  const kpiThresholds = analysisResult ? String(analysisResult.thresholdSuggestions.length) : "—";

  return (
    <ModuleLayout engineLabel="ML FP Optimizer">
      <ModuleHero
        eyebrow="ML Screening · Pattern Analysis · Threshold Optimisation"
        title="False Positive"
        titleEm="optimizer."
        moduleNumber={45}
        kpis={[
          { value: kpiFpRate, label: "FP rate", tone: analysisResult && analysisResult.fpRate > 70 ? "red" : analysisResult ? "amber" : undefined },
          { value: kpiTimeSaved, label: "Time saved / month" },
          { value: kpiPatterns, label: "Patterns identified" },
          { value: kpiThresholds, label: "Threshold optimisations" },
        ]}
      />

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-hair">
        {(["analysis", "prediction", "trends"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-13 font-medium rounded-t transition-colors ${
              tab === t
                ? "bg-bg-2 text-ink-0 border-b-2 border-brand"
                : "text-ink-2 hover:text-ink-0 hover:bg-bg-1"
            }`}
          >
            {t === "analysis" && "🔍 Analysis"}
            {t === "prediction" && "🎯 Live Prediction"}
            {t === "trends" && "📈 Performance Trends"}
          </button>
        ))}
      </div>

      {/* ── TAB 1: Analysis ── */}
      {tab === "analysis" && (
        <div className="space-y-6">
          <div className="border border-hair-2 rounded-lg p-5 bg-bg-1">
            <div className="font-mono text-11 uppercase tracking-wide text-ink-3 mb-1">
              Historical MLRO Decisions — CSV format
            </div>
            <div className="text-11 text-ink-3 mb-3">
              caseId, subject, matchScore, listName, mlroDecision (true_positive|false_positive), reason, clientType, jurisdiction, riskScore
            </div>
            <textarea
              value={csvInput}
              onChange={(e) => setCsvInput(e.target.value)}
              rows={10}
              className="w-full bg-bg-0 border border-hair-2 rounded p-3 font-mono text-11 text-ink-0 outline-none focus:border-brand resize-y"
            />
            <button
              type="button"
              onClick={() => { void analyzePatterns(); }}
              disabled={analysisLoading}
              className="mt-3 px-5 py-2 bg-brand text-white rounded font-semibold text-13 hover:bg-brand/90 transition-colors disabled:opacity-50"
            >
              {analysisLoading ? "⟳ Analysing patterns…" : "🔍 Analyse Patterns"}
            </button>
          </div>

          {analysisResult && (
            <>
              {/* FP/TP Donut — CSS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-hair-2 rounded-lg p-5 bg-bg-1 flex items-center gap-4">
                  <div
                    className="w-16 h-16 rounded-full shrink-0"
                    style={{
                      background: `conic-gradient(
                        #ef4444 0% ${analysisResult.fpRate}%,
                        #22c55e ${analysisResult.fpRate}% 100%
                      )`,
                    }}
                  />
                  <div>
                    <div className="flex gap-3">
                      <div>
                        <div className="text-20 font-semibold text-red-400">{analysisResult.fpRate.toFixed(1)}%</div>
                        <div className="text-10 font-mono text-ink-3">False Positives</div>
                      </div>
                      <div>
                        <div className="text-20 font-semibold text-green-400">{analysisResult.tpRate.toFixed(1)}%</div>
                        <div className="text-10 font-mono text-ink-3">True Positives</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border border-hair-2 rounded-lg p-5 bg-bg-1 col-span-2">
                  <div className="font-mono text-10 uppercase tracking-wide text-ink-3 mb-2">Summary</div>
                  <p className="text-12 text-ink-1 leading-relaxed">{analysisResult.summary}</p>
                  <div className="mt-2 text-12 font-semibold text-green-400">
                    ⏱ Estimated saving: {analysisResult.estimatedTimeSaving}
                  </div>
                </div>
              </div>

              {/* Systemic Issues */}
              {analysisResult.systemicIssues.length > 0 && (
                <div className="space-y-2">
                  <div className="font-mono text-11 uppercase tracking-wide text-red-400">
                    ⚠️ Systemic Issues
                  </div>
                  {analysisResult.systemicIssues.map((issue, i) => (
                    <div key={i} className="border border-red-500/30 bg-red-500/5 rounded p-3 text-12 text-ink-1">
                      {issue}
                    </div>
                  ))}
                </div>
              )}

              {/* Pattern Cards */}
              <div>
                <div className="font-mono text-11 uppercase tracking-wide text-ink-3 mb-3">
                  FP Patterns Identified
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {analysisResult.patterns.map((pattern: FpPattern, i) => (
                    <div key={i} className="border border-hair-2 rounded-lg p-4 bg-bg-1">
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <div className="text-12 font-semibold text-ink-0 leading-snug">{pattern.pattern}</div>
                        <div className="shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded text-11 font-mono font-semibold ${
                              pattern.fpPct >= 80
                                ? "bg-red-500/15 text-red-400 border border-red-500/30"
                                : pattern.fpPct >= 65
                                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                : "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                            }`}
                          >
                            {pattern.fpPct}% FP
                          </span>
                        </div>
                      </div>
                      {/* mini bar */}
                      <div className="h-1.5 bg-bg-2 rounded overflow-hidden mb-2">
                        <div
                          className={`h-full rounded ${
                            pattern.fpPct >= 80 ? "bg-red-500" : pattern.fpPct >= 65 ? "bg-amber-500" : "bg-blue-500"
                          }`}
                          style={{ width: `${pattern.fpPct}%` }}
                        />
                      </div>
                      <p className="text-11 text-ink-2 leading-relaxed">{pattern.recommendation}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Threshold Suggestions */}
              <div>
                <div className="font-mono text-11 uppercase tracking-wide text-ink-3 mb-3">
                  Threshold Optimisation Suggestions
                </div>
                <div className="border border-hair-2 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-hair-2 bg-bg-1">
                        <th className="text-left px-4 py-2 text-10 font-mono uppercase tracking-wide text-ink-3">List</th>
                        <th className="text-left px-4 py-2 text-10 font-mono uppercase tracking-wide text-ink-3">Client Type</th>
                        <th className="text-right px-4 py-2 text-10 font-mono uppercase tracking-wide text-ink-3">Current</th>
                        <th className="text-right px-4 py-2 text-10 font-mono uppercase tracking-wide text-ink-3">Suggested</th>
                        <th className="text-right px-4 py-2 text-10 font-mono uppercase tracking-wide text-ink-3">FP Reduction</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hair">
                      {analysisResult.thresholdSuggestions.map((ts: ThresholdSuggestion, i) => (
                        <tr key={i} className="bg-bg-0 hover:bg-bg-1 transition-colors">
                          <td className="px-4 py-2.5 text-12 font-mono text-ink-0">{ts.list}</td>
                          <td className="px-4 py-2.5 text-12 text-ink-1">{ts.clientType}</td>
                          <td className="px-4 py-2.5 text-12 font-mono text-amber text-right">{ts.currentThreshold}</td>
                          <td className="px-4 py-2.5 text-12 font-mono text-green-400 font-semibold text-right">{ts.suggestedThreshold}</td>
                          <td className="px-4 py-2.5 text-12 font-mono text-brand text-right">-{ts.expectedFpReduction}%</td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setAppliedThresholds((prev) => {
                                  const next = new Set(prev);
                                  next.add(i);
                                  return next;
                                })
                              }
                              disabled={appliedThresholds.has(i)}
                              className={`px-2.5 py-1 rounded text-10 font-mono font-semibold transition-colors ${
                                appliedThresholds.has(i)
                                  ? "bg-green-500/15 text-green-400 border border-green-500/30 cursor-default"
                                  : "bg-brand/15 text-brand border border-brand/30 hover:bg-brand/25"
                              }`}
                            >
                              {appliedThresholds.has(i) ? "✓ Applied" : "Apply"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB 2: Live Prediction ── */}
      {tab === "prediction" && (
        <div className="space-y-6 max-w-2xl">
          <div className="border border-hair-2 rounded-lg p-5 bg-bg-1">
            <div className="font-mono text-11 uppercase tracking-wide text-ink-3 mb-4">
              New Screening Hit — FP Prediction
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-11 font-mono text-ink-3 mb-1">Subject Name</label>
                <input
                  value={predictForm.subject}
                  onChange={(e) => setPredictForm((f) => ({ ...f, subject: e.target.value }))}
                  className="w-full bg-bg-0 border border-hair-2 rounded px-3 py-2 text-13 text-ink-0 outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-11 font-mono text-ink-3 mb-1">Sanctions List</label>
                <select
                  value={predictForm.listName}
                  onChange={(e) => setPredictForm((f) => ({ ...f, listName: e.target.value }))}
                  className="w-full bg-bg-0 border border-hair-2 rounded px-3 py-2 text-13 text-ink-0 outline-none focus:border-brand"
                >
                  {["OFAC SDN", "EU Consolidated", "UN Consolidated", "HM Treasury", "CBUAE List", "FATF High Risk"].map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-11 font-mono text-ink-3 mb-1">Match Score (0-100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={predictForm.matchScore}
                  onChange={(e) => setPredictForm((f) => ({ ...f, matchScore: parseInt(e.target.value) || 0 }))}
                  className="w-full bg-bg-0 border border-hair-2 rounded px-3 py-2 text-13 text-ink-0 outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-11 font-mono text-ink-3 mb-1">Client Type</label>
                <select
                  value={predictForm.clientType}
                  onChange={(e) => setPredictForm((f) => ({ ...f, clientType: e.target.value }))}
                  className="w-full bg-bg-0 border border-hair-2 rounded px-3 py-2 text-13 text-ink-0 outline-none focus:border-brand"
                >
                  {["Retail Individual", "HNW Individual", "Corporate", "PEP", "Financial Institution", "NGO"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-11 font-mono text-ink-3 mb-1">Jurisdiction</label>
                <input
                  value={predictForm.jurisdiction}
                  onChange={(e) => setPredictForm((f) => ({ ...f, jurisdiction: e.target.value }))}
                  placeholder="UAE, Pakistan, Russia…"
                  className="w-full bg-bg-0 border border-hair-2 rounded px-3 py-2 text-13 text-ink-0 outline-none focus:border-brand"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => { void predictFp(); }}
              disabled={predictLoading}
              className="mt-4 px-5 py-2 bg-brand text-white rounded font-semibold text-13 hover:bg-brand/90 transition-colors disabled:opacity-50"
            >
              {predictLoading ? "⟳ Predicting…" : "🎯 Predict FP"}
            </button>
          </div>

          {predictResult && (
            <div className="space-y-4">
              {/* Probability */}
              <div className="border border-hair-2 rounded-lg p-5 bg-bg-1">
                <div className="flex items-center gap-6">
                  <div>
                    <div
                      className={`text-48 font-semibold leading-none ${
                        predictResult.fpProbability > 75
                          ? "text-green-400"
                          : predictResult.fpProbability > 45
                          ? "text-amber"
                          : "text-red-400"
                      }`}
                    >
                      {predictResult.fpProbability.toFixed(1)}%
                    </div>
                    <div className="text-12 font-mono text-ink-3 mt-1">
                      FP Probability
                    </div>
                    <div className="text-10 text-ink-3 font-mono">
                      CI: {predictResult.confidenceInterval[0].toFixed(1)}% – {predictResult.confidenceInterval[1].toFixed(1)}%
                    </div>
                  </div>
                  <div className="flex-1">
                    <div
                      className={`inline-flex items-center px-4 py-2 rounded-lg text-14 font-semibold ${
                        predictResult.recommendedAction === "dismiss"
                          ? "bg-green-500/15 text-green-400 border border-green-500/30"
                          : predictResult.recommendedAction === "review"
                          ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          : "bg-red-500/15 text-red-400 border border-red-500/30"
                      }`}
                    >
                      {predictResult.recommendedAction === "dismiss" && "✓ Dismiss (likely FP)"}
                      {predictResult.recommendedAction === "review" && "👁 MLRO Review"}
                      {predictResult.recommendedAction === "escalate" && "⚠️ Escalate (possible TP)"}
                    </div>
                    <p className="text-12 text-ink-1 mt-3 leading-relaxed">{predictResult.reasoning}</p>
                  </div>
                </div>
              </div>

              {/* Risk/Mitigating factors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-red-500/20 rounded-lg p-4 bg-bg-1">
                  <div className="font-mono text-10 uppercase tracking-wide text-red-400 mb-2">Risk Factors</div>
                  <ul className="space-y-1">
                    {predictResult.riskFactors.map((f, i) => (
                      <li key={i} className="text-11 text-ink-1 flex gap-1.5">
                        <span className="text-red-400 shrink-0">▲</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border border-green-500/20 rounded-lg p-4 bg-bg-1">
                  <div className="font-mono text-10 uppercase tracking-wide text-green-400 mb-2">Mitigating Factors</div>
                  <ul className="space-y-1">
                    {predictResult.mitigatingFactors.map((f, i) => (
                      <li key={i} className="text-11 text-ink-1 flex gap-1.5">
                        <span className="text-green-400 shrink-0">▼</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Similar Cases */}
              <div className="border border-hair-2 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 border-b border-hair-2 bg-bg-1">
                  <span className="text-12 font-semibold text-ink-0">Similar Historical Cases</span>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-hair bg-bg-1">
                      <th className="text-left px-4 py-2 text-10 font-mono uppercase text-ink-3">Case ID</th>
                      <th className="text-left px-4 py-2 text-10 font-mono uppercase text-ink-3">Subject</th>
                      <th className="text-right px-4 py-2 text-10 font-mono uppercase text-ink-3">Score</th>
                      <th className="px-4 py-2 text-10 font-mono uppercase text-ink-3">Decision</th>
                      <th className="text-left px-4 py-2 text-10 font-mono uppercase text-ink-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hair">
                    {predictResult.similarCases.map((c, i) => (
                      <tr key={i} className="bg-bg-0">
                        <td className="px-4 py-2.5 text-11 font-mono text-ink-2">{c.caseId}</td>
                        <td className="px-4 py-2.5 text-12 text-ink-0">{c.subject}</td>
                        <td className="px-4 py-2.5 text-11 font-mono text-ink-1 text-right">{c.matchScore}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-10 font-mono font-semibold ${
                              c.decision === "false_positive"
                                ? "bg-green-500/15 text-green-400"
                                : "bg-red-500/15 text-red-400"
                            }`}
                          >
                            {c.decision === "false_positive" ? "FP" : "TP"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-11 text-ink-2">{c.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: Performance Trends ── */}
      {tab === "trends" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-hair-2 rounded-lg p-4 bg-bg-1 text-center">
              <div className="text-32 font-semibold text-green-400">847</div>
              <div className="text-11 font-mono uppercase text-ink-3 tracking-wide">Decisions logged</div>
            </div>
            <div className="border border-hair-2 rounded-lg p-4 bg-bg-1 text-center">
              <div className="text-32 font-semibold text-brand">82.3%</div>
              <div className="text-11 font-mono uppercase text-ink-3 tracking-wide">Accuracy score</div>
            </div>
            <div className="border border-hair-2 rounded-lg p-4 bg-bg-1 text-center">
              <div className="text-32 font-semibold text-amber">-8pp</div>
              <div className="text-11 font-mono uppercase text-ink-3 tracking-wide">FP reduction (6m)</div>
            </div>
          </div>

          {/* FP Rate trend bars */}
          <div className="border border-hair-2 rounded-lg p-5 bg-bg-1">
            <div className="font-mono text-11 uppercase tracking-wide text-ink-3 mb-4">
              Monthly False Positive Rate — 6 Month Trend
            </div>
            <div className="flex items-end gap-3 h-40">
              {TREND_DATA.map((d) => {
                const height = `${(d.fpRate / 90) * 100}%`;
                const color =
                  d.fpRate > 79 ? "bg-red-500" : d.fpRate > 74 ? "bg-amber-500" : "bg-blue-500";
                return (
                  <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-10 font-mono text-ink-0">{d.fpRate}%</div>
                    <div className="w-full flex items-end" style={{ height: "120px" }}>
                      <div
                        className={`w-full rounded-t ${color} transition-all`}
                        style={{ height }}
                        title={`${d.fpRate}% FP rate — ${d.decisions} decisions`}
                      />
                    </div>
                    <div className="text-9 font-mono text-ink-3">{d.month}</div>
                    <div className="text-9 font-mono text-ink-3">{d.decisions} cases</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-red-500 inline-block" />
                <span className="text-10 text-ink-3">FP rate &gt; 79%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" />
                <span className="text-10 text-ink-3">FP rate 74–79%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />
                <span className="text-10 text-ink-3">FP rate &lt; 74%</span>
              </div>
            </div>
          </div>

          {/* Decisions logged trend */}
          <div className="border border-hair-2 rounded-lg p-5 bg-bg-1">
            <div className="font-mono text-11 uppercase tracking-wide text-ink-3 mb-4">
              Monthly Decision Volume
            </div>
            <div className="space-y-2">
              {TREND_DATA.map((d) => (
                <div key={d.month} className="flex items-center gap-3">
                  <div className="w-14 text-10 font-mono text-ink-3">{d.month}</div>
                  <div className="flex-1 h-5 bg-bg-2 rounded overflow-hidden">
                    <div
                      className="h-full bg-brand/70 rounded transition-all"
                      style={{ width: `${(d.decisions / 140) * 100}%` }}
                    />
                  </div>
                  <div className="w-16 text-10 font-mono text-ink-2 text-right">{d.decisions} cases</div>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-green-500/20 bg-green-500/5 rounded-lg p-4">
            <div className="font-mono text-10 uppercase tracking-wide text-green-400 mb-2">
              Optimisation Progress
            </div>
            <p className="text-12 text-ink-1 leading-relaxed">
              The ML optimiser has reduced false positive rates from 81% (Nov 2024) to 73% (Apr 2025), saving an estimated 14 hours of MLRO review time per month.
              Implementing all 5 pending threshold suggestions is projected to further reduce FP rate to below 60% within 60 days.
            </p>
          </div>
        </div>
      )}
    </ModuleLayout>
  );
}
