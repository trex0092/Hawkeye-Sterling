"use client";

import { useEffect, useState } from "react";

interface SanctionsList {
  id: string;
  ageH: number | null;
  recordCount: number | null;
}

interface StatusResponse {
  ok: boolean;
  sanctions?: {
    name: string;
    status: "operational" | "degraded" | "down";
    note?: string;
    lists?: SanctionsList[];
  };
  feedVersions?: { adverseMediaKeywords?: number; brain?: string };
}

const LIST_LABEL: Record<string, string> = {
  un_consolidated: "UN",
  ofac_sdn: "OFAC SDN",
  ofac_cons: "OFAC NON-SDN",
  eu_fsf: "EU CFSP",
  uk_ofsi: "UK OFSI",
  uae_eocn: "UAE EOCN",
  uae_ltl: "UAE LTL",
};

// Replaces the static 5-pillar marketing strip on the screening hero with
// a live health snapshot of the watchlist sources. Reads /api/status and
// colours each badge by the freshness SLO:
//   ≤ 24h → green   25-48h → amber   > 48h → red
//   never fetched → grey ("pending")
export function WatchlistHealthBadges() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/status", { headers: { accept: "application/json" } });
        if (!res.ok) {
          if (!cancelled) setError(`status ${res.status}`);
          return;
        }
        const json = (await res.json()) as StatusResponse;
        if (!cancelled) { setData(json); setError(null); }
      } catch {
        if (!cancelled) setError("status unreachable");
      }
    };
    void load();
    // Re-poll every 60s — the status route is cheap and the analyst's
    // notion of "is the OFAC feed fresh?" decays by the minute.
    const t = window.setInterval(() => { void load(); }, 60_000);
    return () => { cancelled = true; window.clearInterval(t); };
  }, []);

  const lists = data?.sanctions?.lists ?? [];
  const note = data?.sanctions?.note;
  // Deploy previews + freshly-deployed environments don't run the
  // refresh-lists cron, so every list reports ageH:null and the strip
  // ends up as 7 identical "pending" badges. Collapse those into a
  // single status line so the operator isn't tricked into thinking
  // every feed is stale. Once even one list has ticked, fall back to
  // the per-list grid.
  const allPending = lists.length > 0 && lists.every((l) => l.ageH == null);

  if (allPending) {
    return (
      <div className="mt-5 border border-hair-2 rounded-lg p-3 bg-bg-panel">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-ink-3 shrink-0" />
          <span className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">
            Watchlist freshness
          </span>
          <span className="text-11 text-ink-3">
            awaiting first refresh tick (cron-only, populates on production main)
          </span>
        </div>
        <div className="text-10.5 text-ink-3 mt-1 font-mono">
          Lists tracked: {lists.map((l) => LIST_LABEL[l.id] ?? l.id).join(" · ")}
          {note ? ` · ${note}` : ""}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mt-5">
      {lists.length === 0 && !error && (
        <div className="col-span-full text-11 text-ink-3">Loading watchlist health…</div>
      )}
      {error && (
        <div className="col-span-full text-11 text-red bg-red-dim border border-red/30 rounded p-2">
          Watchlist health check failed: {error}
        </div>
      )}
      {lists.map((l) => {
        const tone =
          l.ageH == null ? "grey" :
          l.ageH > 48 ? "red" :
          l.ageH > 24 ? "amber" : "green";
        const tones: Record<string, { border: string; label: string; dot: string; bg: string }> = {
          green: { border: "border-green/30", label: "text-green", dot: "bg-green", bg: "bg-green-dim" },
          amber: { border: "border-amber/30", label: "text-amber", dot: "bg-amber", bg: "bg-amber-dim" },
          red:   { border: "border-red/30",   label: "text-red",   dot: "bg-red",   bg: "bg-red-dim" },
          grey:  { border: "border-hair-2",   label: "text-ink-3", dot: "bg-ink-3", bg: "" },
        };
        const t = tones[tone]!;
        return (
          <div
            key={l.id}
            className={`border ${t.border} ${t.bg} rounded-lg p-2.5 bg-bg-panel`}
            title={note ?? undefined}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.dot}`} />
              <span className={`text-10 font-semibold uppercase tracking-wide-3 ${t.label}`}>
                {LIST_LABEL[l.id] ?? l.id}
              </span>
            </div>
            <div className="text-10.5 text-ink-2 leading-tight font-mono">
              {l.ageH == null ? "pending" : `${l.ageH}h ago`}
              {l.recordCount != null ? ` · ${l.recordCount.toLocaleString()} rows` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}
