// Hawkeye Sterling — watchlist freshness gate (Layer #19).
//
// Refuse to clear a screening if any consulted watchlist hasn't been
// refreshed within the SLO window. Stale data is one of the most
// common audit findings against AML programmes.

export interface ListFreshness {
  listId: string;          // OFAC_SDN, UN_1267, EU_CFSP, …
  fetchedAt: string;       // ISO timestamp of last successful refresh
  recordCount: number;
}

export type FreshnessVerdict = "fresh" | "stale_warn" | "stale_block";

export interface FreshnessReport {
  verdict: FreshnessVerdict;
  worstAgeHours: number;
  staleListIds: string[];
  rationale: string;
}

const SLO_FRESH_HOURS = 24;       // refresh within 24h = fresh
const SLO_STALE_BLOCK_HOURS = 48; // beyond 48h = block

export function evaluateFreshness(lists: ListFreshness[], nowMs: number = Date.now()): FreshnessReport {
  if (lists.length === 0) {
    return {
      verdict: "stale_block",
      worstAgeHours: Infinity,
      staleListIds: [],
      rationale: "No watchlist freshness telemetry available — screening cannot be defensibly cleared.",
    };
  }
  const ages = lists.map((l) => ({
    listId: l.listId,
    ageH: Math.max(0, (nowMs - Date.parse(l.fetchedAt)) / 3_600_000),
  }));
  const worst = ages.reduce((a, b) => (b.ageH > a.ageH ? b : a));
  const staleIds = ages.filter((a) => a.ageH > SLO_FRESH_HOURS).map((a) => a.listId);
  let verdict: FreshnessVerdict = "fresh";
  if (worst.ageH > SLO_STALE_BLOCK_HOURS) verdict = "stale_block";
  else if (worst.ageH > SLO_FRESH_HOURS) verdict = "stale_warn";
  return {
    verdict,
    worstAgeHours: Math.round(worst.ageH),
    staleListIds: staleIds,
    rationale:
      verdict === "fresh"
        ? `All ${lists.length} consulted lists refreshed within the last ${SLO_FRESH_HOURS}h (worst ${Math.round(worst.ageH)}h).`
        : verdict === "stale_warn"
          ? `${staleIds.length} list(s) older than ${SLO_FRESH_HOURS}h (worst ${Math.round(worst.ageH)}h on ${worst.listId}). Disposition flagged for analyst attention.`
          : `Watchlists materially stale (worst ${Math.round(worst.ageH)}h on ${worst.listId}). Refuse to clear until refresh.`,
  };
}
