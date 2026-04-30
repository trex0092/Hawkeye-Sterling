// Hawkeye Sterling — evidence model.
// Every claim the brain emits must trace to an Evidence item. Evidence carries
// provenance (where it came from), freshness (when it was observed), and
// credibility (a qualitative judgement about the source). The charter forbids
// training-data-as-current-source (P8); that is enforced here by requiring a
// provenance kind of 'training_data' to explicitly surface the stale-source
// warning in UI/output.

export type EvidenceKind =
  | 'sanctions_list'
  | 'regulator_press_release'
  | 'court_filing'
  | 'news_article'
  | 'rss_feed'
  | 'corporate_registry'
  | 'customer_document'
  | 'internal_system'
  | 'social_media'
  | 'training_data';

export type SourceCredibility = 'authoritative' | 'primary' | 'reputable' | 'mixed' | 'weak' | 'unknown';

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  title: string;
  uri?: string;
  publisher?: string;
  publishedAt?: string;      // ISO 8601 where known
  observedAt: string;        // ISO 8601 — when WE observed it
  languageIso: string;       // ISO 639-1 (e.g. 'en', 'ar')
  credibility: SourceCredibility;
  sha256?: string;           // content hash for tamper detection
  excerpt?: string;          // verbatim excerpt (≤ 500 chars) — never paraphrased
  staleWarning?: string;     // auto-populated for kind='training_data'
}

export function freshnessDays(observedAt: string, now: Date = new Date()): number {
  const t = Date.parse(observedAt);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  const ms = now.getTime() - t;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function isStale(ev: EvidenceItem, maxDays: number): boolean {
  if (ev.kind === 'training_data') return true;
  return freshnessDays(ev.observedAt) > maxDays;
}

// Per-EvidenceKind half-life in days. A piece of evidence's freshness factor
// halves every `halfLife` days. Numbers reflect operational reality:
// sanctions lists update constantly; court filings are durable; training data
// is treated as instantly stale per Charter P8.
export const FRESHNESS_HALF_LIFE_DAYS: Record<EvidenceKind, number> = {
  sanctions_list: 30,
  regulator_press_release: 90,
  court_filing: 1825,        // 5 years
  news_article: 180,
  rss_feed: 60,
  corporate_registry: 365,
  customer_document: 90,
  internal_system: 30,
  social_media: 30,
  training_data: 0,          // sentinel: handled as 0 freshness below
};

export interface FreshnessOptions {
  /** Override the per-kind half-life table. */
  halfLifeDays?: Partial<Record<EvidenceKind, number>>;
  /** Reference time for "now". Defaults to Date.now(). */
  now?: Date;
}

/** Continuous freshness factor in [0, 1] using exponential half-life decay
 *  per source kind: f(days) = 2^(-days / halfLife). Charter P8: training_data
 *  is always 0. Used by fusion.ts to weight likelihood ratios. */
export function freshnessFactor(ev: EvidenceItem, opts: FreshnessOptions = {}): number {
  if (ev.kind === 'training_data') return 0;
  const halfLife = opts.halfLifeDays?.[ev.kind] ?? FRESHNESS_HALF_LIFE_DAYS[ev.kind];
  if (halfLife <= 0) return 0;
  const days = freshnessDays(ev.observedAt, opts.now ?? new Date());
  if (!Number.isFinite(days)) return 0;
  // 2^(-days / halfLife). Clamp to [0,1] for safety.
  const f = Math.pow(2, -days / halfLife);
  if (!Number.isFinite(f)) return 0;
  return Math.max(0, Math.min(1, f));
}

export function annotateStaleWarnings<T extends EvidenceItem>(items: T[]): T[] {
  return items.map((e) => {
    if (e.kind !== 'training_data' || e.staleWarning) return e;
    return {
      ...e,
      staleWarning:
        'Source is training data; stale by definition. Reliance requires verification against a current primary source (P8 of the compliance charter).',
    };
  });
}

export function credibilityScore(c: SourceCredibility): number {
  switch (c) {
    case 'authoritative': return 1;
    case 'primary': return 0.9;
    case 'reputable': return 0.7;
    case 'mixed': return 0.5;
    case 'weak': return 0.3;
    case 'unknown': return 0.2;
  }
}
