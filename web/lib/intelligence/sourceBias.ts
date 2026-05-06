// Hawkeye Sterling — source-bias detection.
//
// Adverse media is only as reliable as its sources. When 80% of the
// articles come from a single state-controlled outlet (RT/TASS/Xinhua/
// CGTN), or from one tabloid, the operator should know — World-Check
// doesn't flag this; we do, so analysts can apply appropriate weight.

export interface BiasArticle {
  source?: string;
  outlet?: string;
}

export interface SourceBiasResult {
  totalArticles: number;
  uniqueOutlets: number;
  topOutlet: string | null;
  topOutletShare: number;          // 0..1 — fraction of articles from top outlet
  stateMediaShare: number;         // 0..1 — fraction from state-controlled outlets
  tabloidShare: number;            // 0..1 — fraction from low-credibility outlets
  outletDistribution: Array<{ outlet: string; count: number; share: number }>;
  biasFlags: string[];
  signal: string;
}

const STATE_MEDIA = new Set([
  "rt", "rt.com", "russia today", "tass", "tass.com", "tass.ru", "ria",
  "ria.ru", "sputnik", "sputniknews.com", "xinhua", "xinhuanet.com",
  "cgtn", "cgtn.com", "people's daily", "global times", "globaltimes.cn",
  "press tv", "presstv.ir", "irna", "irna.ir", "fars", "farsnews.ir",
  "saba", "sabanews.net", "kcna", "kcna.kp", "anadolu",
  "anadolu agency",
]);

const TABLOID = new Set([
  "thesun.co.uk", "the sun", "dailymail.co.uk", "daily mail",
  "mirror.co.uk", "the mirror", "express.co.uk", "daily express",
  "nypost.com", "ny post", "nationalenquirer.com", "national enquirer",
  "infowars.com", "infowars", "breitbart.com", "breitbart", "the gateway pundit",
  "gatewaypundit.com",
]);

function normalizeOutlet(outlet?: string): string {
  return (outlet ?? "").toLowerCase().trim().replace(/^www\./, "");
}

export function detectSourceBias(articles: BiasArticle[]): SourceBiasResult {
  if (articles.length === 0) {
    return {
      totalArticles: 0, uniqueOutlets: 0, topOutlet: null,
      topOutletShare: 0, stateMediaShare: 0, tabloidShare: 0,
      outletDistribution: [], biasFlags: [],
      signal: "No articles to analyse for source bias.",
    };
  }
  const counts = new Map<string, number>();
  let stateCount = 0;
  let tabloidCount = 0;
  for (const a of articles) {
    const outlet = normalizeOutlet(a.outlet ?? a.source);
    if (!outlet) continue;
    counts.set(outlet, (counts.get(outlet) ?? 0) + 1);
    if (STATE_MEDIA.has(outlet)) stateCount += 1;
    if (TABLOID.has(outlet)) tabloidCount += 1;
  }

  const distribution = Array.from(counts.entries())
    .map(([outlet, count]) => ({ outlet, count, share: count / articles.length }))
    .sort((a, b) => b.count - a.count);

  const topOutlet = distribution[0]?.outlet ?? null;
  const topOutletShare = distribution[0]?.share ?? 0;
  const stateMediaShare = stateCount / articles.length;
  const tabloidShare = tabloidCount / articles.length;

  const biasFlags: string[] = [];
  if (topOutletShare > 0.6 && articles.length >= 3) {
    biasFlags.push(`Single-outlet dominance: ${Math.round(topOutletShare * 100)}% of articles from "${topOutlet}"`);
  }
  if (stateMediaShare > 0.4) {
    biasFlags.push(`State-media concentration: ${Math.round(stateMediaShare * 100)}% from state-controlled sources`);
  }
  if (tabloidShare > 0.5) {
    biasFlags.push(`Tabloid concentration: ${Math.round(tabloidShare * 100)}% from low-credibility outlets`);
  }

  let signal: string;
  if (biasFlags.length === 0) {
    signal = `Source distribution looks healthy: ${distribution.length} distinct outlets, no single source dominates, no state-media concentration.`;
  } else {
    signal = `Bias signals detected: ${biasFlags.join("; ")}. Weight findings accordingly and seek independent corroboration before disposition.`;
  }

  return {
    totalArticles: articles.length,
    uniqueOutlets: distribution.length,
    topOutlet,
    topOutletShare: Math.round(topOutletShare * 100) / 100,
    stateMediaShare: Math.round(stateMediaShare * 100) / 100,
    tabloidShare: Math.round(tabloidShare * 100) / 100,
    outletDistribution: distribution.slice(0, 10),
    biasFlags,
    signal,
  };
}
