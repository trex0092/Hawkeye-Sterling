"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { fetchJson } from "@/lib/api/fetchWithRetry";
import type { ScreeningHistoryEntry } from "@/lib/types";

interface HistoryListResponse {
  ok: boolean;
  entries?: ScreeningHistoryEntry[];
  error?: string;
}

interface QuickScreenApi {
  ok: boolean;
  topScore?: number;
  severity?: string;
  hits?: Array<{ listId: string; listRef: string; candidateName: string; score: number; method: string }>;
  error?: string;
}

// Replay mode. Loads a subject's screening history, lets the analyst pick
// a snapshot, then re-runs /api/quick-screen with today's brain so they
// can compare what the engine said then vs what it says now.
//
// This sells itself in regulator visits — "show me what your screening
// said the day Maria was onboarded vs what it would say today" with no
// hand-waving.
export default function ReplayPage() {
  const params = useParams<{ id: string }>();
  const subjectId = params?.id ?? "";

  const [history, setHistory] = useState<ScreeningHistoryEntry[]>([]);
  const [pickedAt, setPickedAt] = useState<string | null>(null);
  const [today, setToday] = useState<QuickScreenApi | null>(null);
  const [loadingToday, setLoadingToday] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    if (!subjectId) return;
    void (async () => {
      const res = await fetchJson<HistoryListResponse>(
        `/api/screening-history?subjectId=${encodeURIComponent(subjectId)}`,
        { label: "Replay history load failed" },
      );
      if (!res.ok || !res.data?.ok) {
        console.error("[hawkeye] screening/replay history load failed:", res.error, res.data);
        setError(res.error ?? "history unavailable");
        return;
      }
      const entries = res.data.entries ?? [];
      setHistory(entries);
      if (entries[0]) setPickedAt(entries[0].at);
    })();
  }, [subjectId]);

  const rerun = async () => {
    if (!subjectId) return;
    setLoadingToday(true);
    setError(null);
    // We don't have the original full subject record server-side without
    // a separate lookup; for the replay POC we re-screen using just the
    // subject id (the persisted subject is in localStorage / Blob and
    // the queue page round-trips it). The quick-screen API needs at
    // least a name, so we pass the subjectId as a placeholder until the
    // page's parent provides the real subject record via context.
    const res = await fetchJson<QuickScreenApi>("/api/quick-screen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: { name: subjectId } }),
      label: "Replay re-run failed",
      timeoutMs: 20_000,
    });
    if (!mountedRef.current) return;
    setLoadingToday(false);
    if (!res.ok || !res.data?.ok) {
      console.error("[hawkeye] screening/replay quick-screen re-run failed:", res.error, res.data);
      setError(res.error ?? "re-run failed");
      return;
    }
    setToday(res.data);
  };

  const picked = history.find((h) => h.at === pickedAt) ?? null;

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-10 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-1.5 font-mono text-11 tracking-wide-8 uppercase text-brand mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 shadow-[0_0_6px_var(--brand)] opacity-80" />
            BUREAU II · SCREENING REPLAY
          </div>
          <h1 className="font-display font-normal text-32 text-ink-0 leading-tight">
            What did the brain <em className="italic text-brand">say then?</em>
          </h1>
          <p className="text-13 text-ink-2 mt-1">
            Subject <span className="font-mono">{subjectId}</span> — pick a historical snapshot
            and re-run the brain at today's threshold.
          </p>
        </div>

        {error && (
          <div className="bg-red-dim border border-red/30 rounded-lg p-3 text-12 text-red mb-4">
            {error}
          </div>
        )}

        {history.length === 0 ? (
          <div className="border border-hair-2 rounded-xl p-8 text-center text-12 text-ink-3">
            No screening history captured for this subject yet.
            <br />
            Ongoing-screening writes a snapshot per run; manual screens can opt in via
            <span className="font-mono text-ink-1"> POST /api/screening-history</span>.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="bg-bg-panel border border-hair-2 rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Snapshot</div>
                <select
                  value={pickedAt ?? ""}
                  onChange={(e) => setPickedAt(e.target.value)}
                  className="text-11 font-mono px-2 py-1 border border-hair-2 rounded bg-bg-1 text-ink-0"
                >
                  {history.map((h) => (
                    <option key={h.at} value={h.at}>{h.at.replace("T", " ").slice(0, 16)} - {h.severity}</option>
                  ))}
                </select>
              </div>
              {picked ? (
                <div className="text-12 space-y-2">
                  <div className="font-mono text-18 text-ink-0">{picked.topScore}/100</div>
                  <div className="text-11 text-ink-2 uppercase tracking-wide-2">{picked.severity}</div>
                  <div className="text-11 text-ink-3">
                    {picked.lists.length} list{picked.lists.length === 1 ? "" : "s"} · {picked.hits.length} hit{picked.hits.length === 1 ? "" : "s"}
                  </div>
                  {picked.lists.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {picked.lists.map((l) => (
                        <span key={l} className="font-mono text-10 px-1.5 py-px rounded bg-violet-dim text-violet">{l}</span>
                      ))}
                    </div>
                  )}
                  {picked.hits.length > 0 && (
                    <details className="text-10 font-mono text-ink-2">
                      <summary className="cursor-pointer text-ink-1">Hits ({picked.hits.length})</summary>
                      <ul className="mt-1 space-y-0.5">
                        {picked.hits.map((h) => <li key={h}>{h}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
              ) : (
                <div className="text-11 text-ink-3 italic">Pick a snapshot above.</div>
              )}
            </section>

            <section className="bg-bg-panel border border-brand/30 rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-brand">Today's brain</div>
                <button
                  type="button"
                  onClick={() => { void rerun(); }}
                  disabled={loadingToday}
                  className="px-3 py-1 text-11 font-semibold rounded bg-brand text-white disabled:opacity-40 hover:bg-brand-hover"
                >
                  {loadingToday ? "Re-running…" : "Re-run now"}
                </button>
              </div>
              {today ? (
                <div className="text-12 space-y-2">
                  <div className="font-mono text-18 text-ink-0">{today.topScore ?? "—"}/100</div>
                  <div className="text-11 text-ink-2 uppercase tracking-wide-2">{today.severity ?? "—"}</div>
                  {today.hits && today.hits.length > 0 ? (
                    <ul className="text-10 font-mono text-ink-2 space-y-0.5">
                      {today.hits.map((h, i) => (
                        <li key={i}>
                          <span className="text-violet">{h.listId}</span> · {h.candidateName} · {Math.round(h.score * 100)}% · {h.method}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-11 text-ink-3">No hits at today's threshold.</div>
                  )}
                </div>
              ) : (
                <div className="text-11 text-ink-3 italic">Click "Re-run now" to compare.</div>
              )}
            </section>
          </div>
        )}

        {picked && today && (
          <DiffPanel snapshot={picked} fresh={today} />
        )}
      </main>
    </>
  );
}

function DiffPanel({
  snapshot,
  fresh,
}: {
  snapshot: ScreeningHistoryEntry;
  fresh: QuickScreenApi;
}) {
  const delta = (fresh.topScore ?? 0) - snapshot.topScore;
  const todayHits = new Set((fresh.hits ?? []).map((h) => `${h.listId}:${h.listRef}`));
  const snapshotHits = new Set(snapshot.hits);
  const newHits = [...todayHits].filter((h) => !snapshotHits.has(h));
  const droppedHits = [...snapshotHits].filter((h) => !todayHits.has(h));
  const tone = delta > 0 ? "text-red" : delta < 0 ? "text-green" : "text-ink-3";
  return (
    <section className="bg-bg-panel border border-hair-2 rounded-xl p-5 mt-4">
      <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">
        Replay diff
      </div>
      <div className="text-12 space-y-2">
        <div>
          Score delta: <span className={`font-mono font-semibold ${tone}`}>
            {delta > 0 ? `+${delta}` : delta}
          </span>
        </div>
        {newHits.length > 0 && (
          <div>
            <span className="text-10 text-red uppercase tracking-wide-3 mr-1">+ today only</span>
            {newHits.map((h) => <span key={h} className="font-mono text-10 px-1.5 py-px mr-1 rounded bg-red-dim text-red">{h}</span>)}
          </div>
        )}
        {droppedHits.length > 0 && (
          <div>
            <span className="text-10 text-green uppercase tracking-wide-3 mr-1">- snapshot only</span>
            {droppedHits.map((h) => <span key={h} className="font-mono text-10 px-1.5 py-px mr-1 rounded bg-green-dim text-green">{h}</span>)}
          </div>
        )}
        {newHits.length === 0 && droppedHits.length === 0 && delta === 0 && (
          <div className="text-11 text-ink-3 italic">Brain says exactly the same thing today as it did then.</div>
        )}
      </div>
    </section>
  );
}
