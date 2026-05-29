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
  nationalIdNumber?: string; // legacy alias kept for existing callers
  nationalId?: string;       // Emirates ID, CPR, NRIC, etc.
  registrationNumber?: string; // company reg / trade licence (organisations)
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
  nationalId?: string;
  passportNumber?: string;
  registrationNumber?: string;
}

export type DobMatch = 'exact' | 'year' | 'conflict' | 'none';

export type ConfidenceTier = 'confirmed' | 'probable' | 'possible' | 'unlikely';

export interface DisambiguationFactors {
  nationalityPoints: number;
  dobPoints: number;
  aliasPoints: number;
  genderPoints: number;
  entityTypePoints: number;
  contradictionPoints: number;
}

export interface ClusterSummary {
  label: string;
  size: number;
  primaryName: string;
  names: string[];
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
  nationalIdMatch?: boolean;
  scores?: Partial<Record<MatchingMethod, number>>;
  disambiguationConfidence?: number;
  recommendation?: 'match' | 'review' | 'dismiss';
  // Multi-factor disambiguation (sanctions-disambiguation.ts)
  disambiguationScore?: number;
  confidenceTier?: ConfidenceTier;
  disambiguationFactors?: DisambiguationFactors;
  falsePositiveFlag?: 'likely_false_positive';
  falsePositiveExplanation?: string;
  sdnPrograms?: string[];
  // Look-alike clustering annotations
  clusterLabel?: string;
  clusterSize?: number;
  candidateEntityType?: EntityType;
  entityTypeMismatch?: boolean;
  autoResolution?: 'auto-dismissed' | 'flagged';
  // Source attribution — surfaced in audit trail, UI, and export.
  // Every hit MUST show where the match came from and why.
  sourceList?: string;          // exact list ID e.g. "ofac_sdn"
  sourceLabel?: string;         // human-readable e.g. "OFAC Specially Designated Nationals"
  listingDate?: string;         // ISO date of designation when available
  matchReason?: string;         // algorithms fired + discriminators (structured companion to reason)
  riskCategory?: 'sanctions' | 'pep' | 'adverse_media';
}

export interface QuickScreenOptions {
  scoreThreshold?: number;
  listThresholds?: Record<string, number>;
  maxHits?: number;
  includeScoreBreakdown?: boolean;
  autoResolveRules?: 'conservative' | 'standard' | 'strict';
  /** Bypass the in-memory result cache and force a fresh screening run. */
  forceRefresh?: boolean;
  /** Run enhanced (deep) screening — always bypasses the cache. */
  enhanced?: boolean;
}

export interface QuickScreenResult {
  subject: QuickScreenSubject;
  hits: QuickScreenHit[];
  topScore: number;
  severity: QuickScreenSeverity;
  listsChecked: number;
  /** Every listId seen in the candidate pool (sorted). Structured companion to listsChecked. */
  listIds?: string[];
  candidatesChecked: number;
  durationMs: number;
  generatedAt: string;
  // Weighted composite score across all hit lists (0..100).
  totalWeightedScore?: number;
  // Aggregate discriminator confidence across all hits (0..100).
  confidenceScore?: number;
  // Per-list breakdown — only present when there are hits.
  listBreakdown?: Record<string, { hits: number; topScore: number; weight: number }>;
  // Look-alike name clustering: groups of hits >= 95% similar by trigram Jaccard.
  lookalikeClusters?: ClusterSummary[];
  // Count of hits auto-classified as "likely_false_positive" by the
  // multi-factor disambiguation engine.
  likelyFalsePositiveCount?: number;
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

/**
 * Data source health embedded in every screening response.
 * Compliance analysts and audit trails MUST see this when source health
 * is degraded (source === "static" or healthy === false).
 */
export interface ScreeningDataSourceHealth {
  /** "live" = loaded from Netlify Blobs; "static" = fell back to seed corpus. */
  source: "live" | "static";
  /** ISO-8601 timestamp of when the candidates were last loaded. */
  loadedAt: string;
  /** Total candidate count available for matching at screen time. */
  candidateCount: number;
  /**
   * True only when source === "live" AND all primary adapters responded.
   * A "clear" result when healthy === false MUST be treated as INCONCLUSIVE
   * by downstream compliance processes.
   */
  healthy: boolean;
  /** Primary adapters that failed to load. */
  failedAdapters: string[];
  /**
   * Human-readable degradation note. Surfaced in the UI and audit trail
   * whenever healthy === false or source === "static".
   */
  degradationNote?: string;
}

export type QuickScreenResponse =
  | ({ ok: true } & QuickScreenResult)
  | { ok: false; error: string; detail?: string };

/**
 * Extended response type that includes data-source health provenance.
 * All screening endpoints return this shape; clients can safely access
 * dataSourceHealth regardless of ok/error status.
 */
export type QuickScreenResponseWithHealth =
  | ({ ok: true; dataSourceHealth: ScreeningDataSourceHealth } & QuickScreenResult)
  | { ok: false; error: string; detail?: string; dataSourceHealth?: ScreeningDataSourceHealth };
