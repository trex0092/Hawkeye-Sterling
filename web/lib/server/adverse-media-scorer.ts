// Adverse media relevance scoring and deduplication.
//
// Scores each raw article by relevance to the subject, filters below the
// configured threshold, deduplicates articles from different adapters that
// cover the same story, and classifies each surviving article by severity.
//
// This replaces the previous pattern of returning raw LLM article lists
// with no quality gate — those lists had no evidential value because
// unrelated articles were indistinguishable from true hits.

export type ArticleSeverity = "critical" | "high" | "medium" | "low";

export interface ScoredArticle {
  title: string;
  url?: string;
  source?: string;
  publishedAt?: string;
  snippet?: string;
  relevanceScore: number;          // 0.0–1.0
  severity: ArticleSeverity;
  deduplicatedFrom?: string[];     // sibling URLs collapsed into this entry
}

export interface RawArticle {
  title?: string;
  url?: string;
  source?: string;
  publishedAt?: string;
  snippet?: string;
  [key: string]: unknown;
}

// Words whose presence in article text signals a criminal/financial-crime story.
const CRIME_KEYWORDS = [
  "fraud","corruption","bribery","money laundering","terrorist","sanction",
  "indicted","convicted","arrested","charged","laundering","financial crime",
  "embezzlement","tax evasion","wire fraud","cartel","trafficking","smuggling",
  "forfeiture","debarred","watchlist","designated","blacklist",
];

// Softer risk signals — relevant but not definitively criminal.
const RISK_KEYWORDS = [
  "investigation","alleged","accused","suspect","probe","scandal",
  "controversy","regulatory action","enforcement","penalty","fine",
  "cease and desist","adverse","warning","alert",
];

function tokenise(s: string): string[] {
  return s.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function jaccardSim(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

function computeRelevance(subjectName: string, article: RawArticle): number {
  const title   = (article.title   ?? "").toLowerCase();
  const snippet = (article.snippet ?? "").toLowerCase();
  const fullText = `${title} ${snippet}`;

  const subjectTokens = tokenise(subjectName);
  const titleTokens   = tokenise(title);
  const snippetTokens = tokenise(snippet);

  // Direct string containment (highest signal)
  const normSubject = subjectName.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  const titleInclusion   = title.includes(normSubject)   ? 0.45 : 0;
  const snippetInclusion = snippet.includes(normSubject) ? 0.20 : 0;

  // Token overlap (secondary signal)
  const titleOverlap   = subjectTokens.length > 0 ? jaccardSim(subjectTokens, titleTokens)   * 0.25 : 0;
  const snippetOverlap = subjectTokens.length > 0 ? jaccardSim(subjectTokens, snippetTokens) * 0.10 : 0;

  const nameScore = Math.min(1, titleInclusion + snippetInclusion + titleOverlap + snippetOverlap);

  // Topic relevance signal
  const crimeHits = CRIME_KEYWORDS.filter((kw) => fullText.includes(kw)).length;
  const riskHits  = RISK_KEYWORDS.filter((kw)  => fullText.includes(kw)).length;
  const topicScore = Math.min(1, crimeHits * 0.12 + riskHits * 0.04);

  return Math.min(1, nameScore * 0.75 + topicScore * 0.25);
}

function classifySeverity(article: RawArticle, relevance: number): ArticleSeverity {
  const text = `${(article.title ?? "")} ${(article.snippet ?? "")}`.toLowerCase();
  const crimeHits = CRIME_KEYWORDS.filter((kw) => text.includes(kw)).length;

  if (crimeHits >= 3 && relevance >= 0.60) return "critical";
  if (crimeHits >= 2 || relevance >= 0.80) return "high";
  if (crimeHits >= 1 || relevance >= 0.45) return "medium";
  return "low";
}

function articleFingerprint(article: RawArticle): string {
  // URL (stripped of query/fragment) is the canonical dedup key.
  // Fall back to normalised title prefix when URL is absent.
  if (article.url) {
    return (article.url as string).replace(/[?#].*$/, "").toLowerCase().trim();
  }
  const title = (article.title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return title.slice(0, 80);
}

/**
 * Score, filter, and deduplicate a batch of raw articles against a subject.
 *
 * @param subjectName   Name of the subject being screened.
 * @param articles      Raw articles from all LLM/news adapters combined.
 * @param minRelevance  Drop articles below this relevance score. Default 0.35.
 * @returns Scored, deduplicated articles sorted by relevance descending.
 */
export function scoreAndFilterArticles(
  subjectName: string,
  articles: RawArticle[],
  minRelevance = 0.35,
): ScoredArticle[] {
  if (articles.length === 0) return [];

  const scored = articles.map((a) => ({
    article: a,
    relevance: computeRelevance(subjectName, a),
    fp: articleFingerprint(a),
  }));

  // Deduplicate: keep the highest-relevance entry per fingerprint,
  // record sibling URLs so the caller can see what was collapsed.
  const byFp = new Map<string, { best: (typeof scored)[0]; siblings: string[] }>();
  for (const s of scored) {
    const slot = byFp.get(s.fp);
    if (!slot) {
      byFp.set(s.fp, { best: s, siblings: [] });
    } else if (s.relevance > slot.best.relevance) {
      // Previous best becomes a sibling
      const prevUrl = slot.best.article.url as string | undefined;
      if (prevUrl) slot.siblings.push(prevUrl);
      slot.best = s;
    } else {
      const sibUrl = s.article.url as string | undefined;
      if (sibUrl) slot.siblings.push(sibUrl);
    }
  }

  return [...byFp.values()]
    .filter((slot) => slot.best.relevance >= minRelevance)
    .sort((a, b) => b.best.relevance - a.best.relevance)
    .map((slot) => {
      const a = slot.best.article;
      const result: ScoredArticle = {
        title:         (a.title         as string | undefined) ?? "",
        url:           a.url            as string | undefined,
        source:        a.source         as string | undefined,
        publishedAt:   a.publishedAt    as string | undefined,
        snippet:       a.snippet        as string | undefined,
        relevanceScore: Math.round(slot.best.relevance * 1000) / 1000,
        severity:       classifySeverity(a, slot.best.relevance),
      };
      if (slot.siblings.length > 0) result.deduplicatedFrom = slot.siblings;
      return result;
    });
}

/** Aggregate severity across a set of scored articles. */
export function aggregateMediaSeverity(articles: ScoredArticle[]): ArticleSeverity | "none" {
  if (articles.length === 0) return "none";
  if (articles.some((a) => a.severity === "critical")) return "critical";
  if (articles.some((a) => a.severity === "high"))     return "high";
  if (articles.some((a) => a.severity === "medium"))   return "medium";
  return "low";
}
