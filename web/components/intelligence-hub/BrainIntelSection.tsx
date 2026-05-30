"use client";

import { useEffect, useState, useCallback } from "react";
import { BrainXAIPanel } from "@/components/brain/BrainXAIPanel";
import { ThreatForecastWidget } from "@/components/brain/ThreatForecastWidget";
import { CognitiveLoadBadge } from "@/components/brain/CognitiveLoadBadge";
import { TypologyHeatMatrix, type TypologyHeatEntry } from "@/components/brain/TypologyHeatMatrix";
import { CounterfactualCard } from "@/components/brain/CounterfactualCard";
import { ModuleHero } from "@/components/layout/ModuleLayout";

type ActivePanel = "xai" | "forecast" | "heatmap" | "counterfactual" | "responsible-ai";

interface PortfolioHeatmap {
  heatmap: TypologyHeatEntry[];
  riskDistribution: { tier: string; count: number; percentage: number }[];
  topRiskFactors: { factor: string; frequency: number; trend: "up" | "stable" | "down" }[];
  generatedAt: string;
}

interface ResponsibleAIDashboard {
  drift: { status: string; lastChecked: string; flaggedDecisions: number } | null;
  bias: { overallBiasRatio: number; status: "compliant" | "warning" | "breach"; lastAuditAt: string } | null;
  fpOptimizer: { pendingProposals: number; lastOptimizationAt: string | null } | null;
  cognitiveLoad: { analystsAtRisk: number; totalAnalysts: number } | null;
  summary: { overallHealth: "green" | "yellow" | "red"; issues: string[] };
}

const DEMO_SCORE_BREAKDOWN: Record<string, number> = {
  sanctions_proximity: 35,
  pep_salience: 25,
  adverse_media_severity: 15,
  transaction_anomaly: 15,
  network_complexity: 10,
};

const SEVERITY_COLORS: Record<string, string> = {
  green: "bg-green-dim text-green border-green/30",
  yellow: "bg-amber-dim text-amber border-amber/30",
  red: "bg-red-dim text-red border-red/30",
};

const TREND_ICONS: Record<string, string> = { up: "↑", stable: "→", down: "↓" };
const TREND_COLORS: Record<string, string> = {
  up: "text-red", stable: "text-ink-3", down: "text-green",
};

export function BrainIntelSection() {
  const [activePanel, setActivePanel] = useState<ActivePanel>("xai");
  const [heatmap, setHeatmap] = useState<PortfolioHeatmap | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [responsibleAI, setResponsibleAI] = useState<ResponsibleAIDashboard | null>(null);
  const [raiLoading, setRaiLoading] = useState(false);
  const [demoActor] = useState("mlro-demo");

  const loadHeatmap = useCallback(async () => {
    setHeatmapLoading(true);
    try {
      const res = await fetch("/api/portfolio-risk-heatmap");
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean } & PortfolioHeatmap;
        if (data.ok) setHeatmap(data);
      }
    } catch {
      // graceful — demo data shown if API unavailable
    } finally {
      setHeatmapLoading(false);
    }
  }, []);

  const loadResponsibleAI = useCallback(async () => {
    setRaiLoading(true);
    try {
      const res = await fetch("/api/responsible-ai-dashboard");
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean } & ResponsibleAIDashboard;
        if (data.ok) setResponsibleAI(data);
      }
    } catch {
      // graceful
    } finally {
      setRaiLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activePanel === "heatmap" && !heatmap) void loadHeatmap();
    if (activePanel === "responsible-ai" && !responsibleAI) void loadResponsibleAI();
  }, [activePanel, heatmap, responsibleAI, loadHeatmap, loadResponsibleAI]);

  return (
    <div>
      <ModuleHero
        eyebrow="Module · Brain Intelligence Hub"
        title="Brain"
        titleEm="intelligence."
        intro={
          <>
            10 intelligence modules: XAI score decomposition, counterfactual explainability,
            temporal threat forecasting, emerging typology mining, and responsible-AI monitoring.
            UAE FDL 10/2025 Art.18 compliant.{" "}
            <span className="inline-flex items-center px-1.5 py-px rounded text-10 font-semibold bg-violet-dim text-violet border border-violet/30 font-mono ml-1">Wave 14</span>
          </>
        }
        kpis={[]}
      />

      {/* Analyst fatigue indicator */}
      <div className="mb-6 flex items-center gap-4">
        <span className="text-12 text-ink-2">Analyst cognitive load:</span>
        <CognitiveLoadBadge actorId={demoActor} compact />
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 border-b border-hair-2">
        {(
          [
            { id: "xai", label: "XAI Score Decomposer" },
            { id: "forecast", label: "Threat Forecast" },
            { id: "heatmap", label: "Typology Heatmap" },
            { id: "counterfactual", label: "Counterfactual Explainer" },
            { id: "responsible-ai", label: "Responsible AI" },
          ] as { id: ActivePanel; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActivePanel(tab.id)}
            className={`px-4 py-2 text-13 font-medium rounded-t-md transition-colors ${
              activePanel === tab.id
                ? "bg-bg-1 text-ink-0 border-b-2 border-brand"
                : "text-ink-2 hover:text-ink-1"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="space-y-6">
        {activePanel === "xai" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h2 className="text-15 font-semibold text-ink-0 mb-3">
                SHAP Score Decomposition
              </h2>
              <p className="text-13 text-ink-2 mb-4">
                Linear additive attribution — how much each risk factor contributed to the
                composite score. Enables regulator-grade explainability per FDL 10/2025 Art.18.
              </p>
              <BrainXAIPanel
                score={82}
                breakdown={DEMO_SCORE_BREAKDOWN}
                runId="demo-run-001"
                className="bg-bg-panel rounded-xl p-4 border border-hair-2"
              />
            </div>
            <div className="space-y-4">
              <div className="bg-bg-panel rounded-xl p-4 border border-hair-2">
                <h3 className="text-13 font-semibold text-ink-1 mb-2">
                  How SHAP Attribution Works
                </h3>
                <ul className="space-y-2 text-13 text-ink-2">
                  <li>
                    <span className="text-ink-0 font-medium">Baseline score</span> — expected
                    score with no evidence (typically 10–15)
                  </li>
                  <li>
                    <span className="text-ink-0 font-medium">Feature contribution φᵢ</span> —
                    marginal impact: (penaltyᵢ / Σpenalties) × (score − baseline)
                  </li>
                  <li>
                    <span className="text-ink-0 font-medium">Confidence interval</span> — ±15%
                    on each attribution (epistemic uncertainty)
                  </li>
                  <li>
                    <span className="text-ink-0 font-medium">Direction</span> — green=risk
                    increasing, red=risk decreasing from baseline
                  </li>
                </ul>
              </div>
              <div className="bg-bg-panel rounded-xl p-4 border border-hair-2">
                <h3 className="text-13 font-semibold text-ink-1 mb-2">Compliance Anchor</h3>
                <p className="text-13 text-ink-2">
                  UAE FDL 10/2025 Art.18 requires that AI-assisted decisions be explainable to
                  regulators. SHAP decomposition provides mathematical proof that each score
                  component is traceable to specific evidence.
                </p>
              </div>
            </div>
          </div>
        )}

        {activePanel === "forecast" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h2 className="text-15 font-semibold text-ink-0 mb-3">
                Temporal Threat Forecast
              </h2>
              <p className="text-13 text-ink-2 mb-4">
                Projects when a dormant risk factor (sanctions delta, CAHRA route, PEP role
                change) will materialise into an active threat. Uses exponential decay model
                correlated with geopolitical trigger calendar.
              </p>
              <ThreatForecastWidget
                caseId="demo-case-001"
                subject="Demo Entity Ltd"
                className="bg-bg-panel rounded-xl border border-hair-2"
              />
            </div>
            <div className="bg-bg-panel rounded-xl p-4 border border-hair-2 self-start">
              <h3 className="text-13 font-semibold text-ink-1 mb-2">Forecast Model</h3>
              <div className="space-y-3 text-13 text-ink-2">
                <p>
                  Each risk factor decays at a type-specific λ rate:{" "}
                  <span className="text-ink-0">sanctions=0.005/day</span>,{" "}
                  <span className="text-ink-0">PEP=0.010/day</span>,{" "}
                  <span className="text-ink-0">CAHRA=0.003/day</span>
                </p>
                <p>
                  Geopolitical triggers reset decay counters when correlated events fire
                  (OFAC SDN delta, FATF grey-list update, CBUAE circular).
                </p>
                <p>
                  100-path Monte Carlo simulation produces 80% confidence interval.
                  Horizon spans 30–180 days depending on threat velocity.
                </p>
              </div>
            </div>
          </div>
        )}

        {activePanel === "heatmap" && (
          <div>
            <h2 className="text-15 font-semibold text-ink-0 mb-3">
              Portfolio Typology Heat Matrix
            </h2>
            <p className="text-13 text-ink-2 mb-4">
              Real-time view of which ML/TF typologies are active across your case portfolio.
              Severity is calibrated to FATF typology risk taxonomy.
            </p>
            {heatmapLoading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-12 bg-bg-1 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <TypologyHeatMatrix
                    data={heatmap?.heatmap ?? []}
                    className="bg-bg-panel rounded-xl border border-hair-2"
                  />
                </div>
                <div className="space-y-4">
                  {heatmap?.riskDistribution && heatmap.riskDistribution.length > 0 && (
                    <div className="bg-bg-panel rounded-xl p-4 border border-hair-2">
                      <h3 className="text-13 font-semibold text-ink-1 mb-2">
                        Case Risk Distribution
                      </h3>
                      {heatmap.riskDistribution.map((d: { tier: string; count: number; percentage: number }) => (
                        <div key={d.tier} className="flex justify-between text-13 py-1">
                          <span className="text-ink-2 capitalize">{d.tier}</span>
                          <span className="text-ink-0 font-medium">
                            {d.count} ({d.percentage.toFixed(0)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {heatmap?.topRiskFactors && heatmap.topRiskFactors.length > 0 && (
                    <div className="bg-bg-panel rounded-xl p-4 border border-hair-2">
                      <h3 className="text-13 font-semibold text-ink-1 mb-2">
                        Top Risk Factors
                      </h3>
                      {heatmap.topRiskFactors.slice(0, 5).map((f: { factor: string; frequency: number; trend: "up" | "stable" | "down" }) => (
                        <div key={f.factor} className="flex items-center justify-between text-13 py-1">
                          <span className="text-ink-2">{f.factor}</span>
                          <span className={`font-medium ${TREND_COLORS[f.trend]}`}>
                            {TREND_ICONS[f.trend]} {f.frequency}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {!heatmap && (
                    <div className="bg-bg-panel rounded-xl p-4 border border-hair-2 text-13 text-ink-3">
                      No portfolio data available yet. Cases will populate the heatmap
                      as they are processed.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activePanel === "counterfactual" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h2 className="text-15 font-semibold text-ink-0 mb-3">
                Counterfactual Explainer
              </h2>
              <p className="text-13 text-ink-2 mb-4">
                For every escalation or STR disposition, generates a regulator-facing explanation:
                &ldquo;What would this entity need to change to fall below the escalation threshold?&rdquo;
                Makes every AI decision defensible in a supervisory examination.
              </p>
              <CounterfactualCard
                caseId="demo-case-001"
                verdict="escalate"
                score={82}
                breakdown={DEMO_SCORE_BREAKDOWN}
                className="bg-bg-panel rounded-xl border border-hair-2"
              />
            </div>
            <div className="space-y-4">
              <div className="bg-bg-panel rounded-xl p-4 border border-hair-2">
                <h3 className="text-13 font-semibold text-ink-1 mb-2">
                  Minimal Flip Set Algorithm
                </h3>
                <p className="text-13 text-ink-2">
                  Iterates score dimensions in ascending order of immovability. Identifies the
                  minimum set of changes needed to cross the decision threshold in either
                  direction. Redlines (confirmed sanctions) are marked immovable and excluded
                  from flip candidates.
                </p>
              </div>
              <div className="bg-bg-panel rounded-xl p-4 border border-hair-2">
                <h3 className="text-13 font-semibold text-ink-1 mb-2">Feasibility Scale</h3>
                <div className="space-y-1.5 text-13">
                  <div className="flex items-center gap-2">
                    <span className="w-20 text-green font-medium">Easy</span>
                    <span className="text-ink-2">Factor can be resolved in &lt;48 hours</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-20 text-amber font-medium">Moderate</span>
                    <span className="text-ink-2">Requires EDD document collection</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-20 text-orange font-medium">Hard</span>
                    <span className="text-ink-2">Structural business change needed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-20 text-red font-medium">Immovable</span>
                    <span className="text-ink-2">Confirmed sanction or regulatory redline</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activePanel === "responsible-ai" && (
          <div>
            <h2 className="text-15 font-semibold text-ink-0 mb-3">
              Responsible AI Dashboard
            </h2>
            <p className="text-13 text-ink-2 mb-6">
              Live model drift, bias monitoring, false positive optimizer, and analyst cognitive
              load — all in one regulatory view. Aligned to UNESCO AI Ethics Principle 3 (Fairness)
              and UAE FDL 10/2025 Art.18 (human oversight of AI).
            </p>
            {raiLoading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-32 bg-bg-1 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {responsibleAI && (
                  <div
                    className={`rounded-xl p-4 border ${SEVERITY_COLORS[responsibleAI.summary.overallHealth]}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {responsibleAI.summary.overallHealth === "green"
                          ? "✅"
                          : responsibleAI.summary.overallHealth === "yellow"
                          ? "⚠️"
                          : "🚨"}
                      </span>
                      <div>
                        <p className="font-semibold capitalize text-14">
                          System Health: {responsibleAI.summary.overallHealth.toUpperCase()}
                        </p>
                        {responsibleAI.summary.issues.length > 0 ? (
                          <ul className="text-13 mt-1 space-y-0.5">
                            {responsibleAI.summary.issues.map((issue: string, i: number) => (
                              <li key={i}>{issue}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-13 mt-1">All responsible-AI monitors nominal.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-bg-panel rounded-xl p-4 border border-hair-2">
                    <h3 className="text-13 font-semibold text-ink-1 mb-2">Model Drift</h3>
                    {responsibleAI?.drift ? (
                      <div className="space-y-1 text-13">
                        <div className="flex justify-between">
                          <span className="text-ink-2">Status</span>
                          <span className={responsibleAI.drift.status === "nominal" ? "text-green" : "text-amber"}>
                            {responsibleAI.drift.status}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-ink-2">Flagged</span>
                          <span className="text-ink-0">{responsibleAI.drift.flaggedDecisions}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-12 text-ink-3">No drift data yet</p>
                    )}
                  </div>

                  <div className="bg-bg-panel rounded-xl p-4 border border-hair-2">
                    <h3 className="text-13 font-semibold text-ink-1 mb-2">Bias Monitor</h3>
                    {responsibleAI?.bias ? (
                      <div className="space-y-1 text-13">
                        <div className="flex justify-between">
                          <span className="text-ink-2">Bias Ratio</span>
                          <span className={responsibleAI.bias.overallBiasRatio > 1.5 ? "text-red" : "text-green"}>
                            {responsibleAI.bias.overallBiasRatio.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-ink-2">Status</span>
                          <span className={responsibleAI.bias.status === "compliant" ? "text-green" : "text-red"}>
                            {responsibleAI.bias.status}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-12 text-ink-3">No bias data yet</p>
                    )}
                  </div>

                  <div className="bg-bg-panel rounded-xl p-4 border border-hair-2">
                    <h3 className="text-13 font-semibold text-ink-1 mb-2">FP Optimizer</h3>
                    {responsibleAI?.fpOptimizer ? (
                      <div className="space-y-1 text-13">
                        <div className="flex justify-between">
                          <span className="text-ink-2">Pending proposals</span>
                          <span className={responsibleAI.fpOptimizer.pendingProposals > 0 ? "text-amber" : "text-green"}>
                            {responsibleAI.fpOptimizer.pendingProposals}
                          </span>
                        </div>
                        {responsibleAI.fpOptimizer.lastOptimizationAt && (
                          <div className="flex justify-between">
                            <span className="text-ink-2">Last run</span>
                            <span className="text-ink-0 text-12">
                              {new Date(responsibleAI.fpOptimizer.lastOptimizationAt).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-12 text-ink-3">No optimizer data yet</p>
                    )}
                  </div>

                  <div className="bg-bg-panel rounded-xl p-4 border border-hair-2">
                    <h3 className="text-13 font-semibold text-ink-1 mb-2">Cognitive Load</h3>
                    {responsibleAI?.cognitiveLoad ? (
                      <div className="space-y-1 text-13">
                        <div className="flex justify-between">
                          <span className="text-ink-2">At risk</span>
                          <span className={responsibleAI.cognitiveLoad.analystsAtRisk > 0 ? "text-amber" : "text-green"}>
                            {responsibleAI.cognitiveLoad.analystsAtRisk} / {responsibleAI.cognitiveLoad.totalAnalysts}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <CognitiveLoadBadge actorId={demoActor} compact className="mt-1" />
                    )}
                  </div>
                </div>

                <div className="bg-bg-panel rounded-xl p-4 border border-hair-2">
                  <h3 className="text-13 font-semibold text-ink-1 mb-2">
                    Compliance Anchors
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-13 text-ink-2">
                    <div>
                      <span className="text-ink-0 font-medium">FATF R.10</span> — Non-discrimination.
                      Bias ratio must remain ≤1.5 across all name-script groups.
                    </div>
                    <div>
                      <span className="text-ink-0 font-medium">UAE FDL 10/2025 Art.18</span> — AI
                      audit trail depth. All drift, bias, and XAI data persisted to audit chain.
                    </div>
                    <div>
                      <span className="text-ink-0 font-medium">SOC2 CC7.4</span> — Incident
                      detection. Cognitive load fatigue events logged with category &#x27;analyst.fatigue&#x27;.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
