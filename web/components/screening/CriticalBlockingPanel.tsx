"use client";

import { useState } from "react";

interface Hit {
  listId?: string;
  listRef?: string;
  candidateName?: string;
  score?: number;
}

interface Props {
  subjectName: string;
  subjectId: string;
  hits: Hit[];
  severity: string;
  onCaseOpened?: (caseId: string) => void;
}

const CRITICAL_LISTS = new Set(["ofac_sdn", "uae_ltl", "uae_eocn", "un_consolidated"]);

const LIST_LABELS: Record<string, string> = {
  ofac_sdn:        "OFAC SDN",
  uae_ltl:         "UAE Local Terrorist List",
  uae_eocn:        "UAE EOCN Sanctions",
  un_consolidated: "UN Security Council",
};

export function CriticalBlockingPanel({ subjectName, subjectId, hits, severity, onCaseOpened }: Props) {
  const [opening, setOpening] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const criticalHits = hits.filter((h) => h.listId && CRITICAL_LISTS.has(h.listId));
  if (criticalHits.length === 0) return null;

  const isCritical = severity === "critical" || criticalHits.length > 0;

  const openCase = async () => {
    setOpening(true);
    setError(null);
    try {
      const res = await fetch("/api/hs-cases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectName,
          subjectId,
          severity,
          hits: hits.map((h) => ({
            listId: h.listId ?? "",
            listRef: h.listRef ?? "",
            candidateName: h.candidateName ?? "",
            matchScore: h.score ?? 0,
          })),
        }),
      });
      const data = (await res.json()) as { ok: boolean; case?: { caseId: string }; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Failed to open case");
      } else {
        const caseId = data.case?.caseId ?? "opened";
        setOpened(caseId);
        onCaseOpened?.(caseId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className={`border-2 rounded-lg p-4 mt-4 ${isCritical ? "border-red bg-red-dim" : "border-amber/50 bg-amber-dim"}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2.5 h-2.5 rounded-full bg-red shrink-0 animate-pulse" />
        <span className="text-13 font-semibold text-red uppercase tracking-wide-3">
          CRITICAL SANCTIONS MATCH — IMMEDIATE ACTION REQUIRED
        </span>
      </div>

      {/* Regulatory notice */}
      <p className="text-11 text-ink-1 mb-3 leading-relaxed">
        Subject <strong className="text-ink-0">{subjectName}</strong> has hits on designated lists.
        Per Cabinet Resolution 74/2020 and FDL No.10/2025 Art.14, transactions must be suspended
        and the case must be reported to the MLRO immediately. All AI-generated outputs require
        human MLRO review before any compliance action (Art.18).
      </p>

      {/* Hit list */}
      <div className="space-y-1.5 mb-4">
        {criticalHits.map((h, i) => (
          <div key={i} className="flex items-center gap-2 text-11 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-red shrink-0" />
            <span className="text-red font-semibold">{LIST_LABELS[h.listId ?? ""] ?? h.listId}</span>
            <span className="text-ink-2">·</span>
            <span className="text-ink-1">{h.candidateName}</span>
            {h.score != null && (
              <span className={`ml-auto text-10 ${h.score >= 90 ? "text-red" : "text-amber"}`}>
                {h.score}% match
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Action row */}
      <div className="flex items-center gap-3">
        {opened ? (
          <div className="text-11 text-green font-semibold bg-green-dim border border-green/30 rounded px-3 py-1.5">
            ✓ Case {opened} opened — four-eyes sign-off required
          </div>
        ) : (
          <button
            onClick={() => { void openCase(); }}
            disabled={opening}
            className="text-11 font-semibold uppercase tracking-wide-3 bg-red text-white rounded px-4 py-2 hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {opening ? "Opening…" : "Open Compliance Case"}
          </button>
        )}
        {error && (
          <span className="text-11 text-red">{error}</span>
        )}
        <span className="text-10 text-ink-3 ml-auto font-mono">
          FDL No.10/2025 Art.14 · Cabinet Resolution 74/2020
        </span>
      </div>
    </div>
  );
}
