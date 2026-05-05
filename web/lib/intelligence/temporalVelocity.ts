// Hawkeye Sterling — temporal velocity analysis.
//
// Detects escalation patterns in adverse-media coverage by bucketing
// article publication dates into weekly slots and comparing recent
// volume against historical baseline. Pure-function, no IO.
//
// Use case: World Check shows you static hits — we surface "5 articles
// last week, 0 in the prior 5 years" as an EMERGING-RISK signal that
// would otherwise be invisible.

export interface DatedArticle {
  publishedAt: string;       // ISO
  source?: string;
  outlet?: string;
  title?: string;
}

export interface TemporalVelocity {
  totalArticles: number;
  windowDays: number;             // analysis window (default 365)
  bucketSizeDays: number;         // bucket granularity (default 7)
  buckets: Array<{ startDate: string; count: number }>;
  recentVolume: number;            // last 7d count
  baselineVolume: number;          // mean per-bucket over the rest
  escalationRatio: number;         // recentVolume / max(baselineVolume, 0.1)
  escalationLevel: "none" | "emerging" | "elevated" | "spiking";
  sustainedDays: number;           // consecutive recent days with non-zero coverage
  oldestArticleAgeDays: number | null;
  newestArticleAgeDays: number | null;
  signal: string;                  // human-readable summary
}

export function analyseTemporalVelocity(
  articles: DatedArticle[],
  opts: { windowDays?: number; bucketSizeDays?: number; now?: Date } = {},
): TemporalVelocity {
  const windowDays = opts.windowDays ?? 365;
  const bucketSizeDays = opts.bucketSizeDays ?? 7;
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  const windowStartMs = nowMs - windowDays * 86_400_000;
  const recentCutoffMs = nowMs - 7 * 86_400_000;

  // Filter + sort
  const dated = articles
    .map((a) => ({ ...a, ms: new Date(a.publishedAt).getTime() }))
    .filter((a) => Number.isFinite(a.ms) && a.ms <= nowMs)
    .sort((a, b) => a.ms - b.ms);

  if (dated.length === 0) {
    return {
      totalArticles: 0, windowDays, bucketSizeDays, buckets: [],
      recentVolume: 0, baselineVolume: 0, escalationRatio: 0,
      escalationLevel: "none", sustainedDays: 0,
      oldestArticleAgeDays: null, newestArticleAgeDays: null,
      signal: "No dated articles to analyse.",
    };
  }

  // Build buckets
  const bucketCount = Math.ceil(windowDays / bucketSizeDays);
  const buckets: Array<{ startDate: string; count: number; startMs: number }> = [];
  for (let i = 0; i < bucketCount; i++) {
    const startMs = windowStartMs + i * bucketSizeDays * 86_400_000;
    buckets.push({ startDate: new Date(startMs).toISOString(), count: 0, startMs });
  }
  for (const a of dated) {
    if (a.ms < windowStartMs) continue;
    const idx = Math.floor((a.ms - windowStartMs) / (bucketSizeDays * 86_400_000));
    if (idx >= 0 && idx < buckets.length) buckets[idx]!.count += 1;
  }

  const recentVolume = dated.filter((a) => a.ms >= recentCutoffMs).length;
  const olderBuckets = buckets.slice(0, -1);
  const baselineVolume = olderBuckets.length > 0
    ? olderBuckets.reduce((s, b) => s + b.count, 0) / olderBuckets.length
    : 0;

  const escalationRatio = recentVolume / Math.max(baselineVolume, 0.1);
  let escalationLevel: TemporalVelocity["escalationLevel"];
  if (recentVolume === 0) escalationLevel = "none";
  else if (escalationRatio >= 5) escalationLevel = "spiking";
  else if (escalationRatio >= 2) escalationLevel = "elevated";
  else if (recentVolume >= 1 && baselineVolume < 0.1) escalationLevel = "emerging";
  else escalationLevel = "none";

  // Sustained-coverage days: walk back from now while at least one
  // article exists in the trailing 24h
  let sustainedDays = 0;
  for (let d = 0; d < windowDays; d++) {
    const dayStart = nowMs - (d + 1) * 86_400_000;
    const dayEnd = nowMs - d * 86_400_000;
    const inDay = dated.some((a) => a.ms >= dayStart && a.ms < dayEnd);
    if (!inDay) break;
    sustainedDays++;
  }

  const oldestArticleAgeDays = Math.floor((nowMs - dated[0]!.ms) / 86_400_000);
  const newestArticleAgeDays = Math.floor((nowMs - dated[dated.length - 1]!.ms) / 86_400_000);

  let signal: string;
  switch (escalationLevel) {
    case "spiking":
      signal = `SPIKE: ${recentVolume} articles in last 7 days vs baseline of ${baselineVolume.toFixed(1)}/week (${escalationRatio.toFixed(1)}× normal). Investigate immediately.`;
      break;
    case "elevated":
      signal = `Elevated volume: ${recentVolume} articles last 7 days vs baseline ${baselineVolume.toFixed(1)}/week (${escalationRatio.toFixed(1)}×). Monitor closely.`;
      break;
    case "emerging":
      signal = `Emerging signal: first adverse-media coverage in 12 months (${recentVolume} article(s) last 7 days; oldest historical: ${oldestArticleAgeDays} days ago).`;
      break;
    default:
      signal = recentVolume === 0
        ? `No adverse-media activity in last 7 days. ${dated.length} article(s) over ${windowDays}-day window.`
        : `Steady-state: ${recentVolume} recent articles, baseline ${baselineVolume.toFixed(1)}/week.`;
  }

  return {
    totalArticles: dated.length,
    windowDays, bucketSizeDays,
    buckets: buckets.map((b) => ({ startDate: b.startDate, count: b.count })),
    recentVolume,
    baselineVolume: Math.round(baselineVolume * 10) / 10,
    escalationRatio: Math.round(escalationRatio * 10) / 10,
    escalationLevel,
    sustainedDays,
    oldestArticleAgeDays,
    newestArticleAgeDays,
    signal,
  };
}
