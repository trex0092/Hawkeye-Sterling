"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { deleteCase, loadCases } from "@/lib/data/case-store";
import { RowActions } from "@/components/shared/RowActions";
import { AsanaStatus } from "@/components/shared/AsanaStatus";
import { loadOperatorRole, ROLE_LABEL, type OperatorRole } from "@/lib/data/operator-role";
import type { CaseRecord } from "@/lib/types";

// SAR QA — four-eyes peer review. Any STR / SAR case that's
// been filed appears here awaiting an independent reviewer. The
// second MLRO sees the brain verdict + original disposition,
// adds a peer-review stamp, and the case moves to "peer-reviewed"
// state.

interface QaScore {
  id: string;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  missingElements: string[];
  suggestions: string[];
  fatalIssues: string[];
}

type QaState = "awaiting-review" | "approved" | "challenged";

type ChallengeReason =
  | "narrative_incomplete"
  | "hits_undocumented"
  | "tipping_off_concern"
  | "goaml_format_issue"
  | "incorrect_disposition"
  | "missing_evidence"
  | "other";

const CHALLENGE_REASONS: { id: ChallengeReason; label: string }[] = [
  { id: "narrative_incomplete", label: "Narrative incomplete / unclear" },
  { id: "hits_undocumented", label: "Sanctions / PEP / adverse-media hits not documented" },
  { id: "tipping_off_concern", label: "Tipping-off / disclosure concern in narrative" },
  { id: "goaml_format_issue", label: "goAML format / schema issue" },
  { id: "incorrect_disposition", label: "Disposition does not match evidence" },
  { id: "missing_evidence", label: "Required evidence missing from case" },
  { id: "other", label: "Other (see note)" },
];

/** SLA thresholds in hours for QA turnaround. ≤24h = green, ≤48h = amber, >48h = red. */
const SLA_HOURS_AMBER = 24;
const SLA_HOURS_BREACH = 48;

const QA_STORAGE_KEY = "hawkeye.sar-qa-review.v1";

interface QaReview {
  caseId: string;
  state: QaState;
  reviewer?: string;
  at?: string;
  note?: string;
  challengeReason?: ChallengeReason;
}

function ageHours(filedIso?: string): number | null {
  if (!filedIso) return null;
  const t = new Date(filedIso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, (Date.now() - t) / 3600000);
}

function slaTone(hours: number | null): { label: string; cls: string } {
  if (hours === null) return { label: "no filing timestamp", cls: "bg-bg-2 text-ink-3" };
  if (hours <= SLA_HOURS_AMBER) return { label: `${hours.toFixed(1)}h · within SLA`, cls: "bg-green-dim text-green" };
  if (hours <= SLA_HOURS_BREACH) return { label: `${hours.toFixed(1)}h · approaching SLA`, cls: "bg-amber-dim text-amber" };
  return { label: `${hours.toFixed(1)}h · SLA BREACHED`, cls: "bg-red-dim text-red font-semibold" };
}

function loadReviews(): Record<string, QaReview> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(QA_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveReviews(r: Record<string, QaReview>) {
  try {
    window.localStorage.setItem(QA_STORAGE_KEY, JSON.stringify(r));
  } catch {
    /* */
  }
}

export default function SarQaPage() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [reviews, setReviews] = useState<Record<string, QaReview>>({});
  const [role, setRole] = useState<OperatorRole>("analyst");
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState<Record<string, ChallengeReason>>({});
  const [aiScores, setAiScores] = useState<Record<string, QaScore>>({});
  const [aiScoreLoading, setAiScoreLoading] = useState(false);

  useEffect(() => {
    setCases(loadCases().filter((c) => c.status === "reported"));
    setReviews(loadReviews());
    setRole(loadOperatorRole());
  }, []);

  const runAiQa = async () => {
    setAiScoreLoading(true);
    try {
      const payload = cases.map((c) => ({
        id: c.id,
        subject: c.subject,
        meta: c.meta ?? "",
        narrative: noteDraft[c.id] ?? "",
      }));
      const res = await fetch("/api/sar-qa-score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cases: payload }),
      });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; scores: QaScore[] };
        const map: Record<string, QaScore> = {};
        for (const s of data.scores) {
          map[s.id] = s;
        }
        setAiScores(map);
      }
    } finally {
      setAiScoreLoading(false);
    }
  };

  const stamp = (caseId: string, state: QaState) => {
    const note = noteDraft[caseId] ?? "";
    const reason = reasonDraft[caseId];
    const entry: QaReview = {
      caseId,
      state,
      reviewer: "current-mlro",
      at: new Date().toISOString(),
      ...(note ? { note } : {}),
      ...(state === "challenged" && reason ? { challengeReason: reason } : {}),
    };
    const next = { ...reviews, [caseId]: entry };
    saveReviews(next);
    setReviews(next);
  };

  return (
    <ModuleLayout asanaModule="sar-qa" asanaLabel="SAR Quality Assurance">
        <ModuleHero
          moduleNumber={21}
          eyebrow="Module 14 · Four-eyes peer review"
          title="SAR"
          titleEm="QA."
          intro={
            <>
              <strong>Every filed STR / SAR gets a second pair of eyes.</strong>{" "}
              The MLRO who filed the report is not the one who signs off; an
              independent reviewer confirms the disposition rationale before
              the goAML package ships to the FIU. SLA: 48 hours per CBUAE Notice 2021/8.
            </>
          }
          kpis={[
            {
              value: String(cases.filter((c) => !reviews[c.id]).length),
              label: "awaiting review",
              tone: cases.some((c) => !reviews[c.id]) ? "amber" : undefined,
            },
            {
              value: String(Object.values(reviews).filter((r) => r.state === "challenged").length),
              label: "challenged",
              tone: Object.values(reviews).some((r) => r.state === "challenged") ? "red" : undefined,
            },
            {
              value: String(Object.values(reviews).filter((r) => r.state === "approved").length),
              label: "approved",
            },
            { value: String(cases.length), label: "total filed" },
          ]}
        />

        {role !== "mlro" && (
          <div className="mt-6 rounded-lg p-3 bg-amber-dim text-amber text-12">
            You are logged in as <strong>{ROLE_LABEL[role]}</strong>. Switch to
            the MLRO role from the sidebar to stamp reviews.
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={() => void runAiQa()} disabled={aiScoreLoading || cases.length === 0}
            className="text-11 font-semibold px-3 py-1.5 rounded bg-brand text-white hover:bg-brand/90 disabled:opacity-40">
            {aiScoreLoading ? "Scoring…" : "✦AI"}
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {cases.length === 0 ? (
            <div className="text-12 text-ink-2 py-8 text-center">
              No filed STRs in the register yet. Cases reach this queue after
              being filed via the screening panel&apos;s “Raise STR” action.
            </div>
          ) : (
            cases.map((c) => {
              const review = reviews[c.id];
              const filedAt = c.reported ?? c.timeline?.[0]?.timestamp;
              const sla = slaTone(review ? null : ageHours(filedAt));
              return (
                <div
                  key={c.id}
                  className="bg-bg-panel border border-hair-2 rounded-lg p-4"
                >
                  <div className="flex items-baseline justify-between mb-1">
                    <h3 className="text-13 font-semibold text-ink-0 m-0">
                      {c.subject}
                    </h3>
                    <div className="flex items-center gap-2">
                      {!review && (
                        <span
                          className={`text-10 font-mono px-2 py-0.5 rounded uppercase tracking-wide-3 ${sla.cls}`}
                          title="QA SLA: ≤24h green · ≤48h amber · >48h breach"
                        >
                          {sla.label}
                        </span>
                      )}
                      <span className="font-mono text-10 text-ink-3">{c.id}</span>
                      <RowActions
                        label={`SAR review ${c.id}`}
                        onEdit={() => {
                          setEditingCaseId(c.id);
                          setNoteDraft({ ...noteDraft, [c.id]: reviews[c.id]?.note ?? "" });
                        }}
                        onDelete={() => {
                          deleteCase(c.id);
                          setCases((prev) => prev.filter((x) => x.id !== c.id));
                        }}
                        deleteConfirmMessage={`Dismiss SAR review ${c.id}? The case stays in the case-store; only this QA queue card is removed.`}
                      />
                    </div>
                  </div>
                  <div className="text-11 text-ink-2 mb-3">{c.meta}</div>
                  {aiScores[c.id] && (() => {
                    const s = aiScores[c.id] as QaScore;
                    const gradeCls = s.grade === "A" ? "bg-green text-white" : s.grade === "B" ? "bg-green-dim text-green" : s.grade === "C" ? "bg-amber-dim text-amber" : "bg-red-dim text-red";
                    return (
                      <div className="mt-2 p-3 rounded-lg border border-hair-2 bg-bg-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-11 font-bold px-2 py-px rounded ${gradeCls}`}>{s.grade}</span>
                          <span className="text-11 font-mono text-ink-2">Quality score: {s.score}/100</span>
                        </div>
                        {s.fatalIssues.length > 0 && (
                          <div className="text-11 text-red font-semibold">Fatal: {s.fatalIssues.join(" · ")}</div>
                        )}
                        {s.missingElements.length > 0 && (
                          <div className="text-10 text-amber">Missing: {s.missingElements.join(" · ")}</div>
                        )}
                        {s.suggestions.length > 0 && (
                          <ul className="text-10 text-ink-2 space-y-0.5 list-disc list-inside">
                            {s.suggestions.map((sg, i) => <li key={i}>{sg}</li>)}
                          </ul>
                        )}
                      </div>
                    );
                  })()}
                  {c.asanaTaskUrl && (
                    <AsanaStatus
                      state={{ status: "sent", taskUrl: c.asanaTaskUrl }}
                    />
                  )}
                  {review && editingCaseId !== c.id ? (
                    <div
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-10 font-semibold uppercase ${
                        review.state === "approved"
                          ? "bg-green-dim text-green"
                          : review.state === "challenged"
                            ? "bg-red-dim text-red"
                            : "bg-amber-dim text-amber"
                      }`}
                    >
                      <span>{review.state === "approved" ? "✓" : "!"}</span>
                      {review.state.replace("-", " ")}
                      {review.at && (
                        <span className="font-normal opacity-70 ml-1">
                          · {new Date(review.at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  ) : (
                    <>
                      <label className="block text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1">
                        Challenge reason (only used if challenging)
                      </label>
                      <select
                        value={reasonDraft[c.id] ?? ""}
                        onChange={(e) =>
                          setReasonDraft({
                            ...reasonDraft,
                            [c.id]: e.target.value as ChallengeReason,
                          })
                        }
                        className="w-full text-11 px-3 py-2 rounded border border-hair-2 bg-bg-panel text-ink-0 mb-2"
                      >
                        <option value="">— select reason —</option>
                        {CHALLENGE_REASONS.map((r) => (
                          <option key={r.id} value={r.id}>{r.label}</option>
                        ))}
                      </select>
                      <textarea
                        value={noteDraft[c.id] ?? ""}
                        onChange={(e) =>
                          setNoteDraft({ ...noteDraft, [c.id]: e.target.value })
                        }
                        placeholder="Peer-review note (optional but recommended for challenges)"
                        rows={2}
                        className="w-full text-11 px-3 py-2 rounded border border-hair-2 bg-bg-panel text-ink-0 mb-2"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={role !== "mlro"}
                          onClick={() => { stamp(c.id, "approved"); setEditingCaseId(null); }}
                          className="text-11 font-semibold px-3 py-1.5 rounded bg-green text-white hover:opacity-90 disabled:opacity-40"
                        >
                          ✓ Approve
                        </button>
                        <button
                          type="button"
                          disabled={role !== "mlro" || !reasonDraft[c.id]}
                          onClick={() => { stamp(c.id, "challenged"); setEditingCaseId(null); }}
                          title={!reasonDraft[c.id] ? "Pick a challenge reason first" : "Challenge filing"}
                          className="text-11 font-semibold px-3 py-1.5 rounded bg-red-dim text-red hover:bg-red hover:text-white disabled:opacity-40"
                        >
                          Challenge
                        </button>
                        {editingCaseId === c.id && (
                          <button type="button" onClick={() => setEditingCaseId(null)}
                            className="text-11 font-medium px-3 py-1.5 rounded text-ink-2">Cancel</button>
                        )}
                      </div>
                    </>
                  )}
                  {review?.challengeReason && (
                    <div className="mt-2 text-11 text-red font-mono uppercase tracking-wide-3">
                      Reason: {CHALLENGE_REASONS.find((r) => r.id === review.challengeReason)?.label ?? review.challengeReason}
                    </div>
                  )}
                  {review?.note && (
                    <div className="mt-2 text-11 text-ink-2 italic">
                      “{review.note}”
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
    </ModuleLayout>
  );
}
