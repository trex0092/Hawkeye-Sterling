// Per-source list freshness checker for health-monitor.
//
// Reads hawkeye-list-reports blobs directly — one failing read cannot
// crash the whole health check. Exported separately so unit tests can
// mock @netlify/blobs and test the logic in isolation.

import { getStore } from "@netlify/blobs";

const STALE_THRESHOLD_HOURS = 30;

export const WATCHLIST_SOURCES: Array<{ id: string; label: string }> = [
  { id: "un_consolidated", label: "UN Consolidated" },
  { id: "ofac_sdn",        label: "OFAC SDN" },
  { id: "ofac_cons",       label: "OFAC Consolidated" },
  { id: "eu_fsf",          label: "EU FSF" },
  { id: "uk_ofsi",         label: "UK OFSI" },
  { id: "uae_eocn",        label: "UAE EOCN" },
  { id: "uae_ltl",         label: "UAE LTL" },
];

export interface ListSourceStatus {
  id: string;
  label: string;
  healthy: boolean;
  ageHours: number | null;
  recordCount: number | null;
  reason?: string;
}

interface ListReport {
  fetchedAt?: string;
  recordCount?: number;
}

export async function checkListSources(): Promise<ListSourceStatus[]> {
  let store: ReturnType<typeof getStore>;
  try {
    store = getStore("hawkeye-list-reports");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[health-monitor] hawkeye-list-reports store unavailable:", msg);
    return WATCHLIST_SOURCES.map((s) => ({
      id: s.id,
      label: s.label,
      healthy: false,
      ageHours: null,
      recordCount: null,
      reason: "store_unavailable",
    }));
  }

  const now = Date.now();
  return Promise.all(
    WATCHLIST_SOURCES.map(async (src): Promise<ListSourceStatus> => {
      try {
        const report = await store.get(`${src.id}/latest.json`, { type: "json" }) as ListReport | null;
        if (!report?.fetchedAt) {
          return { id: src.id, label: src.label, healthy: false, ageHours: null, recordCount: null, reason: "never_fetched" };
        }
        const ts = Date.parse(report.fetchedAt);
        const ageMs = Number.isFinite(ts) ? now - ts : null;
        const ageHours = ageMs !== null ? Math.round((ageMs / 3_600_000) * 10) / 10 : null;
        const stale = ageHours === null || ageHours > STALE_THRESHOLD_HOURS;
        const count = typeof report.recordCount === "number" ? report.recordCount : null;
        const healthy = !stale && count !== null && count > 0;
        console.info(
          `[health-monitor] source=${src.id} healthy=${healthy} ageHours=${ageHours ?? "null"} recordCount=${count ?? "null"}`,
        );
        return {
          id: src.id,
          label: src.label,
          healthy,
          ageHours,
          recordCount: count,
          ...(!healthy ? { reason: stale ? "stale" : "zero_records" } : {}),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[health-monitor] source check failed ${src.id}:`, msg);
        return { id: src.id, label: src.label, healthy: false, ageHours: null, recordCount: null, reason: "read_error" };
      }
    }),
  );
}
