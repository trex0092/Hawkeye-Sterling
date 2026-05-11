"use client";

import { useEffect, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { loadCases } from "@/lib/data/case-store";
import type { CaseRecord } from "@/lib/types";

interface RemediationItem {
  subject: string;
  priority: "critical" | "high" | "medium" | "low";
  reason: string;
  requiredActions: string[];
  regulatoryRisk: string;
  deadline: string;
}

interface DataQualityPlan {
  ok: boolean;
  remediationPlan: RemediationItem[];
  criticalCount: number;
  portfolioRisk: string;
  topGaps: string[];
  regulatoryExposure: string;
}

const PRIORITY_TONE: Record<RemediationItem["priority"], string> = {
  critical: "bg-red-dim text-red",
  high: "bg-red-dim text-red",
  medium: "bg-amber-dim text-amber",
  low: "bg-green-dim text-green",
};

// Data Quality — per-subject completeness score. Which required CDD
// fields are missing, which ID documents expired, which subjects
// haven't been re-screened in >90 days. Drives the remediation
// backlog.

const REQUIRED_FIELDS = [
  { key: "subject", label: "Subject name" },
  { key: "meta", label: "Meta tags" },
  { key: "status", label: "Status set" },
  { key: "opened", label: "Opened-at date" },
  { key: "goAMLReference", label: "goAML reference (if reported)" },
];

export default function DataQualityPage() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [plan, setPlan] = useState<DataQualityPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    setCases(loadCases());
  }, []);

  const rows = cases.map((c) => {
    const missing: string[] = [];
    if (!c.subject) missing.push("subject");
    if (!c.meta || c.meta === "new subject") missing.push("meta");
    if (!c.status) missing.push("status");
    if (!c.opened) missing.push("opened");
    if (c.status === "reported" && !c.goAMLReference)
      missing.push("goAMLReference");
    const evidenceCount = (c.evidence?.length ?? 0);
    if (evidenceCount === 0) missing.push("evidence");
    const score = Math.round(
      ((REQUIRED_FIELDS.length + 1 - missing.length) /
        (REQUIRED_FIELDS.length + 1)) *
        100,
    );
    // Derive days-since-last-screening from the most recent timeline event.
    const lastTs = c.timeline?.length
      ? Math.max(...c.timeline.map((e) => new Date(e.timestamp).getTime()))
      : c.opened
        ? new Date(c.opened.split("/").reverse().join("-")).getTime()
        : 0;
    const daysSinceScreen = lastTs
      ? Math.floor((Date.now() - lastTs) / 86_400_000)
      : null;
    const screeningOverdue = daysSinceScreen !== null && daysSinceScreen > 90;
    return { c, missing, score, evidenceCount, daysSinceScreen, screeningOverdue };
  });

  const avgScore =
    rows.length === 0
      ? 0
      : Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length);

  const generatePlan = async () => {
    if (planLoading || rows.length === 0) return;
    setPlanLoading(true);
    try {
      const payload = rows.map((r) => ({
        subject: r.c.subject ?? "",
        score: r.score,
        missing: r.missing,
        screeningOverdue: r.screeningOverdue,
        daysSinceScreen: r.daysSinceScreen,
        status: r.c.status ?? "",
      }));
      const res = await fetch("/api/data-quality-fix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      if (res.ok) {
        const data = (await res.json()) as DataQualityPlan;
        if (!mountedRef.current) return;
        setPlan(data);
      } else {
        console.error(`[hawkeye] data-quality-fix HTTP ${res.status}`);
      }
    } catch (err) {
      console.error("[hawkeye] data-quality-fix threw:", err);
    } finally {
      if (mountedRef.current) setPlanLoading(false);
    }
  };

  return (
    <ModuleLayout asanaModule="data-quality" asanaLabel="Data Quality">
        <ModuleHero
          moduleNumber={16}
          eyebrow="Module 19 · Per-subject completeness"
          title="Data"
          titleEm="quality."
          intro={
            <>
              <strong>Which cases have gaps.</strong> Completeness score per
              case, ranked worst-first so the MLRO can triage remediation.
              Drives the weekly clean-up backlog.
            </>
          }
          kpis={[
            {
              value: `${avgScore}%`,
              label: "average completeness",
              tone: avgScore < 70 ? "red" : avgScore < 85 ? "amber" : undefined,
            },
            {
              value: String(rows.filter((r) => r.score < 100).length),
              label: "cases with gaps",
            },
            { value: String(rows.length), label: "cases in register" },
            {
              value: String(rows.filter((r) => r.screeningOverdue).length),
              label: "re-screen overdue (>90d)",
              tone: rows.some((r) => r.screeningOverdue) ? "red" : undefined,
            },
          ]}
        />

        {rows.length === 0 ? (
          <div className="mt-8 space-y-6">
            {/* CTA */}
            <div className="bg-brand-dim border border-brand-line rounded-lg px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-13 font-semibold text-ink-0 mb-0.5">No cases in the register yet</div>
                <div className="text-12 text-ink-2">Data-quality scores appear once subjects are escalated from the screening panel.</div>
              </div>
              <a
                href="/screening"
                className="shrink-0 px-4 py-2 rounded bg-brand text-white text-12 font-semibold no-underline hover:bg-brand-hover transition-colors"
              >
                Go to Screening →
              </a>
            </div>

            {/* Completeness dimensions */}
            <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
              <div className="text-10.5 font-semibold uppercase tracking-wide-4 text-ink-2 mb-4">
                Completeness dimensions scored per case
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { field: "Subject name", note: "Full legal name on file" },
                  { field: "Meta / tags", note: "Risk category or sector tag" },
                  { field: "Status set", note: "Active, closed, reported…" },
                  { field: "Opened-at date", note: "Case creation timestamp" },
                  { field: "Evidence attached", note: "At least one document" },
                  { field: "goAML reference", note: "Required if status = reported" },
                ].map(({ field, note }) => (
                  <div key={field} className="flex items-start gap-2">
                    <span className="mt-0.5 w-4 h-4 rounded-full bg-green-dim text-green flex items-center justify-center text-10 font-bold shrink-0">✓</span>
                    <div>
                      <div className="text-12 font-medium text-ink-0">{field}</div>
                      <div className="text-10.5 text-ink-3">{note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quality thresholds by risk tier */}
            <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
              <div className="text-10.5 font-semibold uppercase tracking-wide-4 text-ink-2 mb-4">
                Target completeness by risk tier
              </div>
              <div className="flex gap-6 flex-wrap">
                {[
                  { tier: "High risk", target: "≥ 95%", tone: "text-red", bar: "bg-red" },
                  { tier: "Standard risk", target: "≥ 85%", tone: "text-amber", bar: "bg-amber" },
                  { tier: "Low risk", target: "≥ 75%", tone: "text-green", bar: "bg-green" },
                ].map(({ tier, target, tone, bar }) => (
                  <div key={tier} className="flex items-center gap-3 min-w-[160px]">
                    <div className={`w-1.5 h-8 rounded-full ${bar} opacity-70`} />
                    <div>
                      <div className="text-11 text-ink-2 uppercase tracking-wide-3 font-mono">{tier}</div>
                      <div className={`text-20 font-semibold font-mono ${tone}`}>{target}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-10.5 text-ink-3 font-mono">
                Cases below threshold appear in red in the completeness table. MLRO receives weekly remediation digest.
              </div>
            </div>

            {/* Re-screen policy */}
            <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
              <div className="text-10.5 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
                Re-screening policy
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                {[
                  { label: "High risk", cadence: "Every 30 days", tone: "text-red" },
                  { label: "Standard risk", cadence: "Every 90 days", tone: "text-amber" },
                  { label: "Low risk", cadence: "Every 180 days", tone: "text-green" },
                ].map(({ label, cadence, tone }) => (
                  <div key={label} className="bg-bg-1 rounded p-3">
                    <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-mono mb-1">{label}</div>
                    <div className={`text-13 font-semibold ${tone}`}>{cadence}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-10.5 text-ink-3 font-mono">
                Cases overdue for re-screening (&gt;90d default) are flagged red in the Re-screen column. FDL 10/2025 Art. 19 — 10-year lookback obligation applies.
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            {/* AI Remediation Plan button */}
            <div className="flex items-center gap-3 mb-4">
              <button
                type="button"
                disabled={planLoading || rows.length === 0}
                onClick={() => void generatePlan()}
                className="text-12 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40"
              >
                {planLoading ? "Generating plan…" : "✦AI"}
              </button>
              {plan && (
                <span className="text-11 text-ink-3">{plan.remediationPlan.length} subjects prioritised</span>
              )}
            </div>

            {/* Plan panel */}
            {plan && (
              <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mb-4 space-y-3">
                {/* Portfolio risk */}
                <div>
                  <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-1">Portfolio risk</div>
                  <p className={`text-12 font-medium ${plan.criticalCount > 0 ? "text-red" : "text-ink-1"}`}>
                    {plan.portfolioRisk}
                  </p>
                </div>
                {/* Regulatory exposure */}
                {plan.regulatoryExposure && (
                  <div>
                    <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-1">Regulatory exposure</div>
                    <p className="text-11 font-mono text-ink-2">{plan.regulatoryExposure}</p>
                  </div>
                )}
                {/* Top gaps */}
                {plan.topGaps.length > 0 && (
                  <div>
                    <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-1">Common gaps</div>
                    <div className="flex flex-wrap gap-1">
                      {plan.topGaps.map((g, idx) => (
                        <span key={idx} className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-red-dim text-red">{g}</span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Remediation plan list */}
                {plan.remediationPlan.length > 0 && (
                  <div>
                    <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">Prioritised remediation</div>
                    <div className="space-y-2">
                      {plan.remediationPlan.map((item, idx) => (
                        <div key={idx} className="border border-hair rounded p-3">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="text-12 font-semibold text-ink-0">{item.subject}</span>
                            <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${PRIORITY_TONE[item.priority]}`}>
                              {item.priority}
                            </span>
                            <span className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-bg-2 text-ink-2">{item.deadline}</span>
                          </div>
                          <p className="text-11 text-ink-1 mb-1">{item.reason}</p>
                          {item.requiredActions.length > 0 && (
                            <ul className="list-disc list-inside space-y-0.5">
                              {item.requiredActions.map((action, aIdx) => (
                                <li key={aIdx} className="text-10 text-ink-2">{action}</li>
                              ))}
                            </ul>
                          )}
                          {item.regulatoryRisk && (
                            <p className="text-10 font-mono text-ink-3 mt-1">{item.regulatoryRisk}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
            <table className="w-full text-12">
              <thead className="bg-bg-1 border-b border-hair-2">
                <tr>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                    Case
                  </th>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                    Subject
                  </th>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                    Score
                  </th>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                    Missing
                  </th>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                    Evidence
                  </th>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                    Re-screen
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .sort((a, b) => a.score - b.score)
                  .map((r, i) => (
                    <tr
                      key={r.c.id}
                      className={i < rows.length - 1 ? "border-b border-hair" : ""}
                    >
                      <td className="px-3 py-2 font-mono text-11 text-ink-2">
                        {r.c.id}
                      </td>
                      <td className="px-3 py-2 text-ink-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {r.c.subject}
                          {plan && (() => {
                            const item = plan.remediationPlan.find((p) => p.subject === r.c.subject);
                            return item ? (
                              <span className={`inline-flex items-center px-1 py-px rounded-sm font-mono text-10 font-semibold uppercase ${PRIORITY_TONE[item.priority]}`}>
                                {item.priority}
                              </span>
                            ) : null;
                          })()}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-bg-2 rounded-sm overflow-hidden">
                            <div
                              className={`h-full ${
                                r.score < 70
                                  ? "bg-red"
                                  : r.score < 85
                                    ? "bg-amber"
                                    : "bg-green"
                              }`}
                              style={{ width: `${r.score}%` }}
                            />
                          </div>
                          <span className="font-mono text-11 text-ink-0">
                            {r.score}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {r.missing.length === 0 ? (
                          <span className="text-green text-11">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {r.missing.map((m) => (
                              <span
                                key={m}
                                className="inline-flex items-center px-1 py-px rounded-sm font-mono text-10 bg-red-dim text-red"
                              >
                                {m}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-11">
                        {r.evidenceCount}
                      </td>
                      <td className="px-3 py-2">
                        {r.daysSinceScreen === null ? (
                          <span className="text-ink-3 text-11">—</span>
                        ) : r.screeningOverdue ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-sm font-mono text-10 font-semibold bg-red-dim text-red">
                            {r.daysSinceScreen}d overdue
                          </span>
                        ) : (
                          <span className="font-mono text-10 text-ink-2">
                            {r.daysSinceScreen}d ago
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          </div>
        )}
    </ModuleLayout>
  );
}
