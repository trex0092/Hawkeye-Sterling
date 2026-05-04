"use client";

import { useEffect, useRef, useState } from "react";
import type { Subject } from "@/lib/types";
import { fetchJson } from "@/lib/api/fetchWithRetry";
import { toQuickScreenSubject } from "@/lib/data/subjects";
import type { QuickScreenResult } from "@/lib/api/quickScreen.types";

interface Props {
  subject: Subject;
  onClose: () => void;
  /** Anchor element for positioning. */
  anchor: { x: number; y: number };
}

interface ApiOk { ok: true; topScore: number; severity: string; hits?: QuickScreenResult["hits"]; reasoningModes?: string[] }

// Lightweight popover that explains the row's risk score without forcing
// the analyst into the detail panel. Calls /api/quick-screen + a tiny
// derivation pass over the response so we surface:
//   1. Top three matched lists (and the candidate alias)
//   2. The single highest-scoring match method (exact / phonetic / fuzzy)
//   3. Whether redlines fired (using subject hint flags)
//
// Closes on Escape, click outside, or the X button.
export function ScoreExplainPopover({ subject, onClose, anchor }: Props) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; error: string }
    | { kind: "ready"; result: QuickScreenResult }
  >({ kind: "loading" });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctl = new AbortController();
    void (async () => {
      const res = await fetchJson<ApiOk>("/api/quick-screen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: toQuickScreenSubject(subject) }),
        label: "Score lookup failed",
        signal: ctl.signal,
        timeoutMs: 12_000,
      });
      if (!res.ok || !res.data) {
        setState({ kind: "error", error: res.error ?? "lookup failed" });
        return;
      }
      // The /api/quick-screen response embeds a full QuickScreenResult.
      setState({ kind: "ready", result: res.data as unknown as QuickScreenResult });
    })();
    return () => ctl.abort();
  }, [subject]);

  // Close on outside click + Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    // Defer the click listener so the click that opened the popover doesn't close it.
    const t = window.setTimeout(() => window.addEventListener("mousedown", onClick), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
      window.clearTimeout(t);
    };
  }, [onClose]);

  // Position the popover, clamping to the viewport so it can't escape the
  // screen when the row is near the bottom edge.
  const top = Math.min(anchor.y + 12, window.innerHeight - 320);
  const left = Math.min(anchor.x, window.innerWidth - 360);

  return (
    <div
      ref={ref}
      style={{ top, left, width: 340 }}
      className="fixed z-30 bg-bg-panel border border-hair-2 rounded-lg shadow-lg p-3"
      role="dialog"
      aria-label="Score explanation"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">
          Why score {subject.riskScore}?
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-ink-3 hover:text-ink-0 text-14 leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {state.kind === "loading" && (
        <div className="text-11 text-ink-2">Re-running brain quick-screen…</div>
      )}

      {state.kind === "error" && (
        <div className="text-11 text-red">{state.error}</div>
      )}

      {state.kind === "ready" && (() => {
        const r = state.result;
        const topHits = [...(r.hits ?? [])].sort((a, b) => b.score - a.score).slice(0, 3);
        const methods = Array.from(new Set((r.hits ?? []).map((h) => h.method)));
        const lists = Array.from(new Set((r.hits ?? []).map((h) => h.listId)));
        const redlineRisk =
          subject.listCoverage.some((l) => l === "OFAC" || l === "UN" || l === "EOCN") ||
          (subject.pep?.tier?.includes("tier_1") ?? false);
        return (
          <div className="space-y-2 text-11 leading-relaxed">
            <div className="flex items-center gap-2">
              <span className="text-ink-3 uppercase tracking-wide-2">Severity</span>
              <span className="font-mono font-semibold text-ink-0">{r.severity}</span>
              <span className="ml-auto font-mono text-ink-3">top {r.topScore}/100</span>
            </div>
            {topHits.length > 0 ? (
              <div>
                <div className="text-ink-3 uppercase tracking-wide-2 mb-1">Top matches</div>
                <ul className="space-y-1">
                  {topHits.map((h, i) => (
                    <li key={`${h.listId}-${i}`} className="flex items-start gap-1.5">
                      <span className="font-mono text-10 bg-violet-dim text-violet px-1.5 py-px rounded-sm shrink-0">{h.listId}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-ink-0 truncate">{h.candidateName}</div>
                        <div className="text-ink-3 font-mono text-10 truncate">
                          {h.method.replace(/_/g, " ")} · {Math.round(h.score * 100)}%
                          {h.matchedAlias ? ` · "${h.matchedAlias}"` : ""}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-ink-2">No watchlist hits above threshold.</div>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-10 font-mono text-ink-3 pt-2 border-t border-hair">
              <span>methods: <span className="text-ink-1">{methods.join(", ") || "—"}</span></span>
              <span>lists: <span className="text-ink-1">{lists.join(", ") || "—"}</span></span>
              <span>redline: <span className={redlineRisk ? "text-red" : "text-green"}>{redlineRisk ? "risk" : "clear"}</span></span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
