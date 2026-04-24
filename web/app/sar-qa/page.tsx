"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { loadCases } from "@/lib/data/case-store";
import { loadOperatorRole, ROLE_LABEL, type OperatorRole } from "@/lib/data/operator-role";
import type { CaseRecord } from "@/lib/types";

// SAR QA — four-eyes peer review. Any STR / SAR case that's
// been filed appears here awaiting an independent reviewer. The
// second MLRO sees the brain verdict + original disposition,
// adds a peer-review stamp, and the case moves to "peer-reviewed"
// state.

type QaState = "awaiting-review" | "approved" | "challenged";

const QA_STORAGE_KEY = "hawkeye.sar-qa-review.v1";

interface QaReview {
  caseId: string;
  state: QaState;
  reviewer?: string;
  at?: string;
  note?: string;
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

  useEffect(() => {
    setCases(loadCases().filter((c) => c.status === "reported"));
    setReviews(loadReviews());
    setRole(loadOperatorRole());
  }, []);

  const stamp = (caseId: string, state: QaState) => {
    const note = noteDraft[caseId] ?? "";
    const entry: QaReview = {
      caseId,
      state,
      reviewer: "current-mlro",
      at: new Date().toISOString(),
      ...(note ? { note } : {}),
    };
    const next = { ...reviews, [caseId]: entry };
    saveReviews(next);
    setReviews(next);
  };

  return (
    <ModuleLayout>
        <ModuleHero
          eyebrow="Module 14 · Four-eyes peer review"
          title="SAR"
          titleEm="QA."
          intro={
            <>
              <strong>Every filed STR / SAR gets a second pair of eyes.</strong>{" "}
              The MLRO who filed the report is not the one who signs off; an
              independent reviewer confirms the disposition rationale before
              the goAML package ships to the FIU.
            </>
          }
        />

        {role !== "mlro" && (
          <div className="mt-6 rounded-lg p-3 bg-amber-dim text-amber text-12">
            You are logged in as <strong>{ROLE_LABEL[role]}</strong>. Switch to
            the MLRO role from the sidebar to stamp reviews.
          </div>
        )}

        <div className="mt-6 space-y-3">
          {cases.length === 0 ? (
            <div className="text-12 text-ink-2 py-8 text-center">
              No filed STRs in the register yet. Cases reach this queue after
              being filed via the screening panel&apos;s “Raise STR” action.
            </div>
          ) : (
            cases.map((c) => {
              const review = reviews[c.id];
              return (
                <div
                  key={c.id}
                  className="bg-bg-panel border border-hair-2 rounded-lg p-4"
                >
                  <div className="flex items-baseline justify-between mb-1">
                    <h3 className="text-13 font-semibold text-ink-0 m-0">
                      {c.subject}
                    </h3>
                    <span className="font-mono text-10 text-ink-3">{c.id}</span>
                  </div>
                  <div className="text-11 text-ink-2 mb-3">{c.meta}</div>
                  {review ? (
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
                      <textarea
                        value={noteDraft[c.id] ?? ""}
                        onChange={(e) =>
                          setNoteDraft({ ...noteDraft, [c.id]: e.target.value })
                        }
                        placeholder="Peer-review note (optional)"
                        rows={2}
                        className="w-full text-11 px-3 py-2 rounded border border-hair-2 bg-bg-panel text-ink-0 mb-2"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={role !== "mlro"}
                          onClick={() => stamp(c.id, "approved")}
                          className="text-11 font-semibold px-3 py-1.5 rounded bg-green text-white hover:opacity-90 disabled:opacity-40"
                        >
                          ✓ Approve
                        </button>
                        <button
                          type="button"
                          disabled={role !== "mlro"}
                          onClick={() => stamp(c.id, "challenged")}
                          className="text-11 font-semibold px-3 py-1.5 rounded bg-red-dim text-red hover:bg-red hover:text-white disabled:opacity-40"
                        >
                          Challenge
                        </button>
                      </div>
                    </>
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
