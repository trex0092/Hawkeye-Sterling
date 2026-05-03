"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/api/fetchWithRetry";
import type { ScreeningHistoryEntry } from "@/lib/types";
import { formatDMYTime as fmt } from "@/lib/utils/dateFormat";

interface Props {
  subjectId: string;
}

interface ListResponse {
  ok: boolean;
  entries?: ScreeningHistoryEntry[];
  error?: string;
}

// Side-by-side diff for ongoing-screened subjects. Reads the
// /api/screening-history blob list and renders the newest two entries
// side by side, plus the score delta and which list hits appeared or
// dropped between the runs.
//
// When there's only one entry on file we render it as the baseline so
// the analyst at least sees that ongoing-screening has captured a
// snapshot — better than a blank panel.
export function ReScreenDiff({ subjectId }: Props) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; error: string }
    | { kind: "ready"; entries: ScreeningHistoryEntry[] }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchJson<ListResponse>(
        `/api/screening-history?subjectId=${encodeURIComponent(subjectId)}`,
        { label: "Re-screen history load failed", timeoutMs: 10_000 },
      );
      if (cancelled) return;
      if (!res.ok || !res.data?.ok) {
        setState({ kind: "error", error: res.error ?? "load failed" });
        return;
      }
      setState({ kind: "ready", entries: res.data.entries ?? [] });
    })();
    return () => { cancelled = true; };
  }, [subjectId]);

  if (state.kind === "loading") {
    return <div className="text-11 text-ink-2">Loading re-screen history…</div>;
  }
  if (state.kind === "error") {
    return <div className="text-11 text-ink-3">No re-screen history available.</div>;
  }

  const entries = state.entries;
  if (entries.length === 0) {
    return (
      <div className="text-11 text-ink-3 italic">
        No re-screen captured yet — first ongoing run will populate this.
      </div>
    );
  }

  const [latest, prev] = entries;
  if (!prev) {
    return (
      <div className="text-11 text-ink-2 space-y-1">
        <div>First snapshot recorded {fmt(latest!.at)}.</div>
        <div className="font-mono">score {latest!.topScore} · {latest!.severity} · {latest!.lists.length} list{latest!.lists.length === 1 ? "" : "s"}</div>
      </div>
    );
  }

  const newHits = latest!.hits.filter((h) => !prev.hits.includes(h));
  const droppedHits = prev.hits.filter((h) => !latest!.hits.includes(h));
  const addedLists = latest!.lists.filter((l) => !prev.lists.includes(l));
  const droppedLists = prev.lists.filter((l) => !latest!.lists.includes(l));
  const delta = latest!.topScore - prev.topScore;

  return (
    <div className="text-11 space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="bg-bg-1 border border-hair-2 rounded p-2">
          <div className="text-10 uppercase tracking-wide-3 text-ink-3">Previous</div>
          <div className="font-mono text-12 text-ink-0">{prev.topScore} · {prev.severity}</div>
          <div className="text-10 text-ink-3 mt-0.5">{fmt(prev.at)}</div>
        </div>
        <div className="bg-bg-1 border border-hair-2 rounded p-2">
          <div className="text-10 uppercase tracking-wide-3 text-ink-3">Latest</div>
          <div className="font-mono text-12 text-ink-0">
            {latest!.topScore} · {latest!.severity}
            <span className={`ml-2 text-10 ${delta > 0 ? "text-red" : delta < 0 ? "text-green" : "text-ink-3"}`}>
              {delta > 0 ? `+${delta}` : delta}
            </span>
          </div>
          <div className="text-10 text-ink-3 mt-0.5">{fmt(latest!.at)}</div>
        </div>
      </div>

      {(newHits.length > 0 || droppedHits.length > 0) && (
        <div className="space-y-1">
          {newHits.length > 0 && (
            <div>
              <span className="text-10 text-red uppercase tracking-wide-3 mr-1">+ new hits</span>
              {newHits.map((h) => <span key={h} className="inline-block px-1.5 py-px mr-1 rounded font-mono text-10 bg-red-dim text-red">{h}</span>)}
            </div>
          )}
          {droppedHits.length > 0 && (
            <div>
              <span className="text-10 text-green uppercase tracking-wide-3 mr-1">- dropped</span>
              {droppedHits.map((h) => <span key={h} className="inline-block px-1.5 py-px mr-1 rounded font-mono text-10 bg-green-dim text-green">{h}</span>)}
            </div>
          )}
        </div>
      )}

      {(addedLists.length > 0 || droppedLists.length > 0) && (
        <div className="text-10 text-ink-2">
          {addedLists.length > 0 && <span className="text-red">+lists: {addedLists.join(", ")}</span>}
          {addedLists.length > 0 && droppedLists.length > 0 && <span className="text-ink-3"> · </span>}
          {droppedLists.length > 0 && <span className="text-green">-lists: {droppedLists.join(", ")}</span>}
        </div>
      )}

      {newHits.length === 0 && droppedHits.length === 0 && addedLists.length === 0 && droppedLists.length === 0 && delta === 0 && (
        <div className="text-10 text-ink-3 italic">No change between runs.</div>
      )}

      <div className="text-10 text-ink-3 pt-1 border-t border-hair">
        {entries.length} snapshot{entries.length === 1 ? "" : "s"} on file.
      </div>
    </div>
  );
}

