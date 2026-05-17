export type EntityType =
  | "individual"
  | "organisation"
  | "vessel"
  | "aircraft"
  | "other";

export type QuickScreenSeverity = "clear" | "low" | "medium" | "high" | "critical";

export type MatchingMethod =
  | "exact"
  | "levenshtein"
  | "jaro"
  | "jaro_winkler"
  | "soundex"
  | "double_metaphone"
  | "token_set"
  | "trigram"
  | "partial_token_set"
  | "fuzzball_token_sort"
  | "fuzzball_partial";

export interface QuickScreenSubject {
  name: string;
  aliases?: string[];
  entityType?: EntityType;
  jurisdiction?: string;
  // Disambiguation discriminators — when present, allow the consensus
  // engine to penalise common-name-only matches less aggressively.
  dateOfBirth?: string;
  nationality?: string;
  passportNumber?: string;
  nationalIdNumber?: string;
}

export interface QuickScreenCandidate {
  listId: string;
  listRef: string;
  name: string;
  aliases?: string[];
  entityType?: EntityType;
  jurisdiction?: string;
  programs?: string[];
  dateOfBirth?: string;
  nationality?: string;
}

export type DobMatch = 'exact' | 'year' | 'conflict' | 'none';

export interface QuickScreenHit {
  listId: string;
  listRef: string;
  candidateName: string;
  matchedAlias?: string;
  score: number;
  baseScore: number;
  method: MatchingMethod;
  phoneticAgreement: boolean;
  programs?: string[];
  reason: string;
  dobMatch?: DobMatch;
  nationalityMatch?: boolean;
  scores?: Partial<Record<MatchingMethod, number>>;
  disambiguationConfidence?: number;
  recommendation?: 'match' | 'review' | 'dismiss';
}

export interface QuickScreenOptions {
  scoreThreshold?: number;
  maxHits?: number;
  includeScoreBreakdown?: boolean;
}

export interface QuickScreenResult {
  subject: QuickScreenSubject;
  hits: QuickScreenHit[];
  topScore: number;
  severity: QuickScreenSeverity;
  listsChecked: number;
  candidatesChecked: number;
  durationMs: number;
  generatedAt: string;
  // Weighted composite score across all hit lists (0..100).
  totalWeightedScore?: number;
  // Aggregate discriminator confidence across all hits (0..100).
  confidenceScore?: number;
  // Per-list breakdown — only present when there are hits.
  listBreakdown?: Record<string, { hits: number; topScore: number; weight: number }>;
  // Populated when the subject matched a tenant-scoped whitelist entry —
  // hits[] is then empty and severity is "clear". Callers can branch on
  // whitelisted !== undefined to render a different UI / verdict.
  whitelisted?: {
    entryId: string;
    approvedBy: string;
    approverRole: "co" | "mlro" | "admin";
    approvedAt: string;
    reason: string;
  };
  // Set when the response was returned before LLM/registry enrichment
  // completed. Poll GET /api/quick-screen/enrich/{enrichJobId} to retrieve
  // the full enriched result.
  enrichmentPending?: boolean;
  enrichJobId?: string;
}

export type QuickScreenResponse =
  | ({ ok: true } & QuickScreenResult)
  | { ok: false; error: string; detail?: string };
