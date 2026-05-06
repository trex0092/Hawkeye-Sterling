// Hawkeye Sterling — live-data trackers (Layers 136-140).

// 136. PEP daily-delta tracker
export interface PepEntry { id: string; name: string; tier: string; updatedAt: string; }
export function pepDailyDelta(prev: PepEntry[], cur: PepEntry[]): {
  added: PepEntry[];
  removed: PepEntry[];
  tierChanged: Array<{ id: string; from: string; to: string }>;
} {
  const prevMap = new Map(prev.map((p) => [p.id, p]));
  const curMap = new Map(cur.map((p) => [p.id, p]));
  const added = cur.filter((c) => !prevMap.has(c.id));
  const removed = prev.filter((p) => !curMap.has(p.id));
  const tierChanged: Array<{ id: string; from: string; to: string }> = [];
  for (const c of cur) {
    const p = prevMap.get(c.id);
    if (p && p.tier !== c.tier) tierChanged.push({ id: c.id, from: p.tier, to: c.tier });
  }
  return { added, removed, tierChanged };
}

// 137. Sanctions-list refresh stamp
export interface RefreshStamp { listId: string; fetchedAt: string; recordCount: number; checksum?: string; }
export function evaluateRefresh(stamps: RefreshStamp[], targetSloHours = 24, nowMs = Date.now()): {
  freshCount: number;
  staleCount: number;
  worstAgeH: number;
  rationale: string;
} {
  if (stamps.length === 0) return { freshCount: 0, staleCount: 0, worstAgeH: Infinity, rationale: "No refresh stamps." };
  let fresh = 0; let stale = 0; let worst = 0;
  for (const s of stamps) {
    const ageH = Math.max(0, (nowMs - Date.parse(s.fetchedAt)) / 3600000);
    if (ageH > worst) worst = ageH;
    if (ageH <= targetSloHours) fresh += 1;
    else stale += 1;
  }
  return {
    freshCount: fresh,
    staleCount: stale,
    worstAgeH: Math.round(worst),
    rationale: stale > 0 ? `${stale}/${stamps.length} list(s) stale (worst ${Math.round(worst)}h).` : `All ${stamps.length} lists fresh within ${targetSloHours}h SLO.`,
  };
}

// 138. News-feed health monitor
export interface NewsFeedSample { feedId: string; respondedAt: string; ok: boolean; latencyMs: number; }
export function evaluateNewsFeedHealth(samples: NewsFeedSample[], windowMin = 60): {
  healthy: boolean;
  errorRate: number;
  p95LatencyMs: number;
  rationale: string;
} {
  if (samples.length === 0) return { healthy: false, errorRate: 1, p95LatencyMs: 0, rationale: "No samples." };
  const cutoff = Date.now() - windowMin * 60_000;
  const recent = samples.filter((s) => Date.parse(s.respondedAt) >= cutoff);
  if (recent.length === 0) return { healthy: false, errorRate: 1, p95LatencyMs: 0, rationale: "No recent samples." };
  const errs = recent.filter((s) => !s.ok).length;
  const errorRate = errs / recent.length;
  const sorted = recent.map((s) => s.latencyMs).sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const healthy = errorRate < 0.1 && p95 < 5000;
  return { healthy, errorRate: Number(errorRate.toFixed(2)), p95LatencyMs: p95, rationale: healthy ? "Feed healthy." : `Error rate ${(errorRate * 100).toFixed(0)}%; p95 ${p95}ms.` };
}

// 139. Adverse-media multi-language sweep (signal aggregation across languages)
export interface LangSearchResult { lang: string; hits: number; topSeverity?: string; }
export function aggregateMultiLang(results: LangSearchResult[]): {
  totalHits: number;
  languages: string[];
  worstSeverity: string;
  rationale: string;
} {
  const total = results.reduce((s, r) => s + r.hits, 0);
  const langs = results.map((r) => r.lang);
  const sevOrder = ["clear", "low", "medium", "high", "critical"];
  const worst = results.reduce((w, r) => sevOrder.indexOf(r.topSeverity ?? "clear") > sevOrder.indexOf(w) ? (r.topSeverity ?? "clear") : w, "clear");
  return { totalHits: total, languages: langs, worstSeverity: worst, rationale: `${total} hits across ${langs.length} languages (${langs.join(", ")}); worst severity ${worst.toUpperCase()}.` };
}

// 140. Court-records fetcher (interface stub)
export interface CourtRecord {
  jurisdiction: string;
  court: string;
  caseNumber: string;
  filedAt: string;
  matter: string;
  outcome?: "pending" | "convicted" | "acquitted" | "settled" | "dismissed";
}
export interface CourtRecordsAdapter {
  isAvailable(): boolean;
  search(name: string, jurisdictionIso2?: string): Promise<CourtRecord[]>;
}
export const NULL_COURT_ADAPTER: CourtRecordsAdapter = {
  isAvailable: () => false,
  search: async () => [],
};
