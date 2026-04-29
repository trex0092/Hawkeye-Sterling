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
