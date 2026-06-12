// Hawkeye Sterling — `quickScreen`.
// A compact, stateless screening surface that composes the existing matching
// primitives (matchEnsemble) into a single verdict against a supplied candidate
// list. Designed for low-latency UI callers: no I/O, no network, no stubs —
// callers own candidate acquisition (DB, file, API) and pass the rows in.

import { matchEnsemble, effectiveTokenCount, buildNameKeys, couldPlausiblyMatch, type MatchingMethod } from './matching.js';
import { fpTriageConfig } from './fp-triage-config.js';
import {
  enrichHitWithDisambiguation,
  clusterLookalikes,
  type ConfidenceTier,
  type DisambiguationFactors,
  type ClusterSummary,
} from './sanctions-disambiguation.js';

export type EntityType = 'individual' | 'organisation' | 'vessel' | 'aircraft' | 'other';

export interface QuickScreenSubject {
  name: string;
  aliases?: string[];
  entityType?: EntityType;
  jurisdiction?: string;
  // Disambiguation discriminators — when present these adjust the matching
  // score up (confirmation) or down (conflict). Required for reliable
  // common-name discrimination in high-volume AML/CFT workflows.
  dateOfBirth?: string;   // ISO 8601, partial ("YYYY"), or DD/MM/YYYY
  nationality?: string;   // ISO 3166-1 alpha-2 or country name
  // Strong identity discriminators — definitive confirmation or conflict.
  // National ID (Emirates ID, CPR, NRIC, etc.) and passport number.
  // When present and matching, boost score +0.15; when conflicting, penalise -0.15.
  nationalId?: string;
  passportNumber?: string;
  // Registration number for organisations (trade licence, company reg, etc.)
  registrationNumber?: string;
  // Set by callers that have assessed name frequency (assessCommonName).
  // Common-name hits with zero positive discriminators are capped at MEDIUM
  // severity (never dismissed) — FATF R.10-safe FP attenuation.
  commonName?: boolean;
}

export interface QuickScreenCandidate {
  listId: string;
  listRef: string;
  name: string;
  aliases?: string[];
  entityType?: EntityType;
  jurisdiction?: string;
  programs?: string[];
  // Discriminator fields from source list — used to confirm or suppress matches.
  dateOfBirth?: string;
  nationality?: string;
  nationalId?: string;
  passportNumber?: string;
  registrationNumber?: string;
}

export type QuickScreenSeverity = 'clear' | 'low' | 'medium' | 'high' | 'critical';

// D3: low-confidence flag threshold — results below this base-score are
// never eligible for HIGH/CRITICAL classification.
export const MIN_BASE_SCORE_FOR_HIGH = 0.60;
// D4: alias fragments shorter than this character count trigger a cap at
// MEDIUM regardless of composite score.
export const MIN_ALIAS_LENGTH_FOR_HIGH = 4;

// How well the subject's DOB aligns with the candidate's DOB.
// 'exact'    — full year+month+day agreement → strong confirmation
// 'year'     — year matches (partial info) → mild confirmation
// 'conflict' — year is defined on both sides and disagrees → strong negative signal
// 'none'     — DOB unavailable on one or both sides → no adjustment
export type DobMatch = 'exact' | 'year' | 'conflict' | 'none';

export interface QuickScreenHit {
  listId: string;
  listRef: string;
  candidateName: string;
  matchedAlias?: string;
  score: number;              // 0..1 after discriminator adjustments
  baseScore: number;          // 0..1 raw name-matching score before adjustments
  method: MatchingMethod;
  phoneticAgreement: boolean;
  programs?: string[];
  reason: string;
  // Discriminator results (present only when applicable)
  dobMatch?: DobMatch;
  nationalityMatch?: boolean;
  nationalIdMatch?: boolean;  // true = confirmed via ID/passport; false = ID conflict
  // Per-algorithm score breakdown (present when opts.includeScoreBreakdown = true)
  scores?: Partial<Record<MatchingMethod, number>>;
  // Disambiguation confidence 0..100 and resulting recommendation.
  // Derived from discriminator signals (DOB, nationality, ID, phonetics).
  disambiguationConfidence?: number;
  recommendation?: 'match' | 'review' | 'dismiss';
  // ── Multi-factor disambiguation (sanctions-disambiguation.ts) ──────────────
  // Multi-factor score (0-100): explicit additive point values for each
  // confirming / contradicting demographic signal. Distinct from the
  // legacy `disambiguationConfidence` (phonetic + ID-only) — this score
  // also incorporates alias overlap, entity type, and gender.
  disambiguationScore?: number;
  // Actionable confidence tier derived from disambiguationScore:
  //   "confirmed"  (85-100) — definitive match, recommend freeze
  //   "probable"   (65-84)  — MLRO manual review, 48h hold
  //   "possible"   (45-64)  — enhanced due diligence required
  //   "unlikely"   (0-44)   — log and clear, no adverse action
  confidenceTier?: ConfidenceTier;
  // Structured factor breakdown for audit transparency.
  disambiguationFactors?: DisambiguationFactors;
  // Set to "likely_false_positive" when name similarity > 0.85 AND
  // contradiction score > 50 (different DOB + different nationality).
  falsePositiveFlag?: 'likely_false_positive';
  // Human-readable explanation of the FP determination.
  falsePositiveExplanation?: string;
  // SDN programme codes from OFAC hits (e.g. "UKRAINE-EO13685", "IRAN", "DPRK").
  // Helps analysts assess whether the hit is relevant to their customer.
  sdnPrograms?: string[];
  // Look-alike clustering (populated by clusterLookalikes post-processing).
  // Hits with the same clusterLabel are near-duplicate listings.
  clusterLabel?: string;
  clusterSize?: number;
  // Entity-type transparency — always present so callers can distinguish
  // a direct personal designation from an entity-association hit.
  candidateEntityType?: EntityType;
  // True when the subject entity type and candidate entity type differ
  // (e.g. screening an individual whose name appears within a sanctioned
  // organisation's record). Score is penalised; hit is labelled indirect.
  entityTypeMismatch?: boolean;
  // Set by auto-resolve rules. 'auto-dismissed' hits pass threshold but are
  // tagged so the UI can collapse them; 'flagged' hits appear normally but carry
  // the flag label. Absent = standard hit.
  autoResolution?: 'auto-dismissed' | 'flagged';
  // Structured FP reason code (FP_01..FP_09) for the rule that resolved this
  // hit — required for FDL 10/2025 Art.24 queryable audit trail.
  autoResolutionReasonCode?: string;
  // Human-readable label for the resolving rule.
  autoResolutionReason?: string;
  // Absolute DOB year difference when both sides carry a parseable DOB.
  // Drives the minDobYearDelta auto-resolve guard (Hijri/Gregorian conversion
  // noise stays below the dismissal floor).
  dobYearDelta?: number;
}

// Auto-resolve rules reduce manual review load for low-confidence hits.
// Rules are evaluated in order; first matching rule wins.
// 'auto-dismissed' — hit is tagged and sorted to the bottom (MLRO can still see it).
// 'flagged'        — hit is surfaced normally but carries a flag label.
export interface AutoResolveRule {
  listIdPattern?: string | RegExp; // match listId against this pattern (string = exact prefix)
  entityTypes?: EntityType[];      // apply only when subject.entityType is in this set
  maxBaseScore?: number;           // only apply when baseScore is at or below this value
  maxAdjScore?: number;            // only apply when adjusted score is at or below this value
  requireDobConflict?: boolean;    // only apply when dobMatch === 'conflict'
  minDobYearDelta?: number;        // only apply when the DOB year gap is at least this many years
  requireNationalityConflict?: boolean; // only apply when nationalityMatch === false
  requireNationalIdConflict?: boolean;  // only apply when nationalIdMatch === false
  requireEntityMismatch?: boolean; // only apply when entityTypeMismatch === true
  requireFalsePositiveFlag?: boolean;   // only apply when falsePositiveFlag === 'likely_false_positive'
  action: 'auto-dismissed' | 'flagged';
  reasonCode?: string;             // structured FP reason code (FP_01..FP_09)
  reasonLabel?: string;            // human-readable rule description
}

export interface QuickScreenOptions {
  scoreThreshold?: number;          // default 0.82 (global)
  listThresholds?: Record<string, number>; // per-listId threshold overrides
  maxHits?: number;                 // default 25
  includeScoreBreakdown?: boolean;  // attach per-algorithm scores to each hit
  // Auto-resolve rules evaluated against each hit after scoring.
  // Pre-built profiles: 'conservative' | 'standard' | 'strict'.
  // 'conservative' = dismiss DOB conflicts on informational lists only.
  // 'standard'     = deterministic FP triage mirroring the smart-disambiguate
  //                  LLM rules: ID conflict, DOB+nationality double conflict,
  //                  DOB conflict ≥ HAWKEYE_FP_DOB_DISMISS_MIN_YEARS, and
  //                  entity-type mismatch below 0.90 dismiss on non-critical
  //                  lists; the same conflicts on critical lists only flag.
  // 'strict'       = dismiss any conflict (DOB OR nationality) on non-critical lists.
  // When UNDEFINED, the HAWKEYE_FP_AUTO_RESOLVE_PROFILE env profile applies
  // (default 'standard'). Pass [] or set the profile to 'off' for legacy
  // no-triage behaviour.
  autoResolveRules?: AutoResolveRule[] | 'conservative' | 'standard' | 'strict';
  // Disable the candidate blocking pre-gate and run the full matching
  // ensemble against every corpus entry. The gate is recall-preserving by
  // construction (see couldPlausiblyMatch in matching.ts) and is auto-disabled
  // whenever the effective hit threshold drops below MIN_BLOCKING_THRESHOLD;
  // this flag exists for audit comparisons and worst-case investigations.
  exhaustive?: boolean;
  clock?: () => number;
  now?: () => string;
}

export interface QuickScreenResult {
  subject: QuickScreenSubject;
  hits: QuickScreenHit[];
  topScore: number;                 // 0..100 (scaled from hits[0].score)
  severity: QuickScreenSeverity;
  listsChecked: number;             // count of unique lists in the candidate pool
  candidatesChecked: number;
  durationMs: number;
  generatedAt: string;
  // D3: true when the best hit's base name-match score is below MIN_BASE_SCORE_FOR_HIGH
  // (0.60) or the match was driven by a short alias fragment (< 4 chars). Signals
  // "PROBABLE FALSE POSITIVE — analyst review required" without blocking the hit.
  lowConfidenceFlag?: boolean;
  lowConfidenceReason?: string;
  // Structured list coverage — provides the detail behind `listsChecked`.
  // listIds:  every listId seen in the candidate pool (sorted).
  // listBreakdown is present only when there are hits (lists with matches).
  listIds?: string[];
  // Weighted risk scoring across hits — accounts for regulatory importance of
  // each sanctions list (OFAC SDN, EOCN > bilateral > informational).
  totalWeightedScore?: number;       // 0..100 weighted composite across all hit lists
  confidenceScore?: number;          // 0..100 top-hit discriminator confidence (max across hits)
  confidenceVariance?: number;       // variance of per-hit confidence values (spread indicator)
  listBreakdown?: Record<string, {   // per-list summary (only lists with hits)
    hits: number;
    topScore: number;                // 0..100
    weight: number;                  // list regulatory weight
  }>;
  // FP triage transparency — counts over the returned hits. Audit-chain
  // consumers persist these so dismissal volume is queryable per screening.
  autoDismissedCount?: number;
  fpReasonBreakdown?: Record<string, number>; // reasonCode → dismissed/flagged hit count
}

const DEFAULT_THRESHOLD = 0.82;
const DEFAULT_MAX_HITS = 25;

// Critical lists — never auto-dismiss hits regardless of profile
const CRITICAL_LIST_IDS = new Set([
  'un_consolidated', 'un_1267', 'ofac_sdn', 'uae_eocn', 'uae_ltl',
]);


function builtinProfiles(): Record<string, AutoResolveRule[]> {
  const cfg = fpTriageConfig();
  return {
    conservative: [
      // Only dismiss DOB conflicts on informational lists with low base score
      {
        listIdPattern: /(jp_mof|ca_osfi|au_dfat|ch_seco)/,
        maxBaseScore: 0.88,
        requireDobConflict: true,
        minDobYearDelta: cfg.dobDismissMinYears,
        action: 'auto-dismissed',
        reasonCode: 'FP_01',
        reasonLabel: 'Different DOB confirmed (informational list)',
      },
    ],
    // Deterministic mirror of the smart-disambiguate LLM rules (rules 2-4, 9).
    // Order matters: first matching rule wins. The CRITICAL_LIST_IDS guard in
    // applyAutoResolveRule makes every 'auto-dismissed' rule fall through to a
    // 'flagged' rule on critical lists — UN/OFAC/UAE hits are never dismissed.
    standard: [
      // LLM rule: ID conflict is definitive identity disproof.
      {
        requireNationalIdConflict: true,
        action: 'auto-dismissed',
        reasonCode: 'FP_08',
        reasonLabel: 'ID number conflict confirmed',
      },
      // LLM rule 4: DOB conflict + nationality conflict together — the
      // disambiguation engine sets falsePositiveFlag when baseScore > 0.85
      // and contradictionScore > 50 (double demographic contradiction).
      {
        requireFalsePositiveFlag: true,
        action: 'auto-dismissed',
        reasonCode: 'FP_09',
        reasonLabel: 'Multiple strong identifier conflicts (DOB + nationality)',
      },
      // LLM rule 3: DOB year conflict beyond the dismissal floor. The
      // minDobYearDelta guard keeps Hijri/Gregorian conversion noise (±1-2y)
      // and approximate list DOBs out of the dismissal path; those smaller
      // conflicts fall through to the 'flagged' rule below.
      {
        requireDobConflict: true,
        minDobYearDelta: cfg.dobDismissMinYears,
        action: 'auto-dismissed',
        reasonCode: 'FP_01',
        reasonLabel: `Different DOB confirmed (≥${cfg.dobDismissMinYears}y gap)`,
      },
      // Entity-type mismatch (individual ↔ organisation) below the dismissal
      // score ceiling. Vessel↔org pairs never set entityTypeMismatch (their
      // multiplier is 1.0) so they are exempt by construction.
      {
        requireEntityMismatch: true,
        maxAdjScore: cfg.entityMismatchDismissMaxScore,
        action: 'auto-dismissed',
        reasonCode: 'FP_07',
        reasonLabel: 'Entity type mismatch confirmed',
      },
      // Critical-list fallthrough: the same conflicts surface as flagged hits
      // (reviewable, never dismissed).
      {
        requireNationalIdConflict: true,
        action: 'flagged',
        reasonCode: 'FP_08',
        reasonLabel: 'ID conflict on critical list — review required',
      },
      {
        requireDobConflict: true,
        action: 'flagged',
        reasonCode: 'FP_01',
        reasonLabel: 'DOB conflict — review required',
      },
      {
        requireEntityMismatch: true,
        action: 'flagged',
        reasonCode: 'FP_07',
        reasonLabel: 'Entity type mismatch — review required',
      },
      // Nationality conflict alone NEVER dismisses (FATF R.10 bias safety:
      // nationality-keyed dismissal could skew biasRatio by script origin).
      {
        requireNationalityConflict: true,
        action: 'flagged',
        reasonCode: 'FP_02',
        reasonLabel: 'Nationality conflict — review required',
      },
    ],
    strict: [
      {
        requireNationalIdConflict: true,
        action: 'auto-dismissed',
        reasonCode: 'FP_08',
        reasonLabel: 'ID number conflict confirmed',
      },
      {
        requireFalsePositiveFlag: true,
        action: 'auto-dismissed',
        reasonCode: 'FP_09',
        reasonLabel: 'Multiple strong identifier conflicts (DOB + nationality)',
      },
      {
        requireDobConflict: true,
        action: 'auto-dismissed',
        reasonCode: 'FP_01',
        reasonLabel: 'Different DOB confirmed',
      },
      {
        requireNationalityConflict: true,
        maxBaseScore: 0.92,
        action: 'auto-dismissed',
        reasonCode: 'FP_02',
        reasonLabel: 'Different nationality confirmed',
      },
      {
        requireEntityMismatch: true,
        maxAdjScore: cfg.entityMismatchDismissMaxScore,
        action: 'auto-dismissed',
        reasonCode: 'FP_07',
        reasonLabel: 'Entity type mismatch confirmed',
      },
      // Flag entity-type mismatches that survive (critical lists / high score)
      { requireEntityMismatch: true, action: 'flagged', reasonCode: 'FP_07', reasonLabel: 'Entity type mismatch — review required' },
      // Flag remaining conflicts on critical lists
      { requireDobConflict: true, action: 'flagged', reasonCode: 'FP_01', reasonLabel: 'DOB conflict — review required' },
      { requireNationalityConflict: true, action: 'flagged', reasonCode: 'FP_02', reasonLabel: 'Nationality conflict — review required' },
    ],
  };
}

function resolveAutoRules(
  opt: AutoResolveRule[] | 'conservative' | 'standard' | 'strict' | undefined,
): AutoResolveRule[] {
  // Undefined → apply the env-configured default profile (FP-60 triage).
  // Callers that explicitly pass [] (or set HAWKEYE_FP_AUTO_RESOLVE_PROFILE=off
  // / HAWKEYE_FP_TRIAGE_ENABLED=false) get legacy no-triage behaviour.
  if (opt === undefined) {
    const cfg = fpTriageConfig();
    if (!cfg.enabled || cfg.profile === 'off') return [];
    return builtinProfiles()[cfg.profile] ?? [];
  }
  if (typeof opt === 'string') return builtinProfiles()[opt] ?? [];
  return opt;
}

function applyAutoResolveRule(
  rule: AutoResolveRule,
  hit: QuickScreenHit,
  subject: QuickScreenSubject,
): boolean {
  // Never auto-dismiss critical list hits
  if (rule.action === 'auto-dismissed' && CRITICAL_LIST_IDS.has(hit.listId)) return false;
  if (rule.listIdPattern) {
    const pat = rule.listIdPattern;
    if (pat instanceof RegExp) { if (!pat.test(hit.listId)) return false; }
    else { if (!hit.listId.startsWith(pat)) return false; }
  }
  if (rule.entityTypes && subject.entityType && !rule.entityTypes.includes(subject.entityType)) return false;
  if (rule.maxBaseScore !== undefined && hit.baseScore > rule.maxBaseScore) return false;
  if (rule.maxAdjScore !== undefined && hit.score > rule.maxAdjScore) return false;
  if (rule.requireDobConflict && hit.dobMatch !== 'conflict') return false;
  if (rule.minDobYearDelta !== undefined && (hit.dobYearDelta === undefined || hit.dobYearDelta < rule.minDobYearDelta)) return false;
  if (rule.requireNationalityConflict && hit.nationalityMatch !== false) return false;
  if (rule.requireNationalIdConflict && hit.nationalIdMatch !== false) return false;
  if (rule.requireEntityMismatch && !hit.entityTypeMismatch) return false;
  if (rule.requireFalsePositiveFlag && hit.falsePositiveFlag !== 'likely_false_positive') return false;
  return true;
}

// Regulatory weight per sanctions list.
// Weights are configurable via SCREENING_LIST_WEIGHT_OVERRIDES env var
// (JSON object mapping listId → weight 1–100).
// Runtime resolution is lazy so the brain module stays isomorphic (no
// direct Node.js env reads at import time in test environments).
const _BASE_LIST_WEIGHTS: Record<string, number> = {
  un_consolidated: 40, un_1267: 40,
  ofac_sdn: 38, ofac_cons: 30,
  uae_eocn: 40, uae_ltl: 35,
  eu_fsf: 25, uk_ofsi: 22,
  ca_osfi: 20, ch_seco: 20, au_dfat: 20,
  jp_mof: 15,
};
const DEFAULT_LIST_WEIGHT = 10;

let _resolvedWeights: Record<string, number> | null = null;

function resolveListWeights(): Record<string, number> {
  if (_resolvedWeights) return _resolvedWeights;
  const base: Record<string, number> = { ..._BASE_LIST_WEIGHTS };
  try {
    const raw =
      (typeof process !== "undefined" && process.env?.["SCREENING_LIST_WEIGHT_OVERRIDES"]) ?? "";
    if (raw) {
      const overrides = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(overrides)) {
        if (typeof v === "number" && isFinite(v) && v >= 1 && v <= 100) base[k] = v;
      }
    }
  } catch { /* malformed JSON — silently use defaults */ }
  _resolvedWeights = base;
  return base;
}

function listWeight(listId: string): number {
  return resolveListWeights()[listId] ?? DEFAULT_LIST_WEIGHT;
}

// ── Entity-type mismatch penalty table ───────────────────────────────────────
// Defines the score multiplier applied when subject and candidate entity types
// differ. Each entry covers an ordered pair [subjectType, candidateType].
// Pairs not listed here receive a multiplier of 1.0 (no penalty).
//
// RATIONALE:
//   person↔org: clear semantic mismatch — penalise.
//   vessel/aircraft↔org: expected in practice (OFAC SDN vessel entries are
//     typically held under an owning organisation name) — no penalty.
//   vessel↔aircraft, vessel↔individual, aircraft↔individual: rare but
//     treated as mismatches — moderate penalty.
//
// All multipliers are configurable via
//   SCREENING_ENTITY_MISMATCH_OVERRIDES='[["individual","organisation",0.55]]'
// (array of [subjectType, candidateType, multiplier] tuples).

type EntityTypePair = `${EntityType}:${EntityType}`;

const _BASE_ENTITY_MISMATCH: Partial<Record<EntityTypePair, number>> = {
  "individual:organisation": 0.60,
  "organisation:individual": 0.60,
  "individual:vessel":       0.75,
  "vessel:individual":       0.75,
  "individual:aircraft":     0.75,
  "aircraft:individual":     0.75,
  // vessel/aircraft ↔ organisation: expected (no penalty — see comment above)
  "vessel:organisation":     1.00,
  "organisation:vessel":     1.00,
  "aircraft:organisation":   1.00,
  "organisation:aircraft":   1.00,
};

let _resolvedEntityMismatch: Partial<Record<EntityTypePair, number>> | null = null;

function resolveEntityMismatchTable(): Partial<Record<EntityTypePair, number>> {
  if (_resolvedEntityMismatch) return _resolvedEntityMismatch;
  const table: Partial<Record<EntityTypePair, number>> = { ..._BASE_ENTITY_MISMATCH };
  try {
    const raw =
      (typeof process !== "undefined" && process.env?.["SCREENING_ENTITY_MISMATCH_OVERRIDES"]) ?? "";
    if (raw) {
      const overrides = JSON.parse(raw) as unknown[];
      for (const entry of overrides) {
        if (Array.isArray(entry) && entry.length === 3) {
          const [s, c, m] = entry as [unknown, unknown, unknown];
          if (
            typeof s === "string" && typeof c === "string" &&
            typeof m === "number" && isFinite(m) && m >= 0 && m <= 1
          ) {
            table[`${s}:${c}` as EntityTypePair] = m;
          }
        }
      }
    }
  } catch { /* malformed JSON — silently use defaults */ }
  _resolvedEntityMismatch = table;
  return table;
}

function entityMismatchMultiplier(subjectType: EntityType, candidateType: EntityType): number {
  if (subjectType === candidateType) return 1.0;
  const key = `${subjectType}:${candidateType}` as EntityTypePair;
  return resolveEntityMismatchTable()[key] ?? 1.0;
}

function disambiguationConfidenceFor(
  dobMatch: DobMatch,
  nationalityMatch: boolean | undefined,
  phonetic: boolean,
  nationalIdMatch?: boolean,
): number {
  let conf = 50; // neutral baseline
  // National ID / passport — strongest single discriminator (definitive identity proof)
  if (nationalIdMatch === true)  conf += 45;
  else if (nationalIdMatch === false) conf -= 45;
  // DOB — most important among demographic discriminators
  if (dobMatch === 'exact')         conf += 35;
  else if (dobMatch === 'year')     conf += 15;
  else if (dobMatch === 'conflict') conf -= 35;
  // Nationality
  if (nationalityMatch === true)    conf += 15;
  else if (nationalityMatch === false) conf -= 10;
  // Phonetic agreement (corroborative, not definitive)
  if (phonetic) conf += 8;
  return Math.min(100, Math.max(0, conf));
}

function recommendationFor(disambConf: number): 'match' | 'review' | 'dismiss' {
  if (disambConf >= 75) return 'match';
  if (disambConf >= 40) return 'review';
  return 'dismiss';
}

// ── DOB matching ──────────────────────────────────────────────────────────────

interface DobParts { y: number; m?: number; d?: number }

function parseDobParts(raw: string): DobParts | null {
  const s = raw.trim();
  const isValidMonth = (m: number) => m >= 1 && m <= 12;
  const isValidDay = (d: number) => d >= 1 && d <= 31;
  const isValidYear = (y: number) => y >= 1900 && y <= 2100;
  // ISO: YYYY-MM-DD or YYYY/MM/DD
  const isoM = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoM) {
    const y = +(isoM[1] ?? '0'); const m = +(isoM[2] ?? '0'); const d = +(isoM[3] ?? '0');
    if (!isValidYear(y) || !isValidMonth(m) || !isValidDay(d)) return null;
    return { y, m, d };
  }
  // European: DD/MM/YYYY or DD.MM.YYYY
  const dmyM = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmyM) {
    const y = +(dmyM[3] ?? '0'); const m = +(dmyM[2] ?? '0'); const d = +(dmyM[1] ?? '0');
    if (!isValidYear(y) || !isValidMonth(m) || !isValidDay(d)) return null;
    return { y, m, d };
  }
  // Year only
  const yM = s.match(/^(\d{4})$/);
  if (yM) { const y = +(yM[1] ?? '0'); return isValidYear(y) ? { y } : null; }
  return null;
}

function matchDOB(subjectDob: string, candidateDob: string): { match: DobMatch; boost: number; yearDelta?: number } {
  const sp = parseDobParts(subjectDob);
  const cp = parseDobParts(candidateDob);
  if (!sp || !cp) return { match: 'none', boost: 0 };
  if (sp.y !== cp.y) {
    const yearDelta = Math.abs(sp.y - cp.y);
    // Hijri/Gregorian conversions and approximate list DOBs commonly disagree
    // by a year — within the tolerance band the delta is neither confirmation
    // nor conflict (no boost, no penalty, never dismissable). Gated by the
    // master switch so HAWKEYE_FP_TRIAGE_ENABLED=false restores legacy scoring.
    const cfg = fpTriageConfig();
    if (cfg.enabled && yearDelta <= cfg.dobConflictToleranceYears) {
      return { match: 'none', boost: 0, yearDelta };
    }
    return { match: 'conflict', boost: -0.20, yearDelta };
  }
  // Years agree — check month+day for stronger confirmation
  if (sp.m !== undefined && cp.m !== undefined && sp.m === cp.m &&
      sp.d !== undefined && cp.d !== undefined && sp.d === cp.d) {
    return { match: 'exact', boost: 0.12 };
  }
  // Year (and optionally month) agree but full date not confirmed
  return { match: 'year', boost: 0.06 };
}

// ── Severity ──────────────────────────────────────────────────────────────────

export interface SeverityOpts {
  // D1/D2: raw name-matching score (0..1) before discriminator adjustments.
  // Results below MIN_BASE_SCORE_FOR_HIGH (0.60) are capped at MEDIUM.
  bestBaseScore?: number;
  // D4: length of the alias fragment that triggered the match. When < 4 chars
  // the hit is capped at MEDIUM regardless of composite score.
  aliasMatchLength?: number;
}

export function severityFromScore(
  topScore: number,
  hitCount: number,
  opts?: SeverityOpts,
): QuickScreenSeverity {
  if (hitCount === 0) return 'clear';

  // D1/D4 gate: HIGH and CRITICAL require either
  //   (a) bestBaseScore >= 0.60  AND
  //   (b) alias match on a fragment of >= 4 characters (or a primary-name match).
  const baseScore = opts?.bestBaseScore ?? 1; // default 1 = no gate (backward compat)
  const aliasLen = opts?.aliasMatchLength ?? 99; // default 99 = no gate
  const canBeHighOrCritical = baseScore >= MIN_BASE_SCORE_FOR_HIGH && aliasLen >= MIN_ALIAS_LENGTH_FOR_HIGH;

  if (topScore >= 95 && canBeHighOrCritical) return 'critical';
  if (topScore >= 85 && canBeHighOrCritical) return 'high';
  if (topScore >= 70) return 'medium';
  return 'low';
}

// ── Main screening function ───────────────────────────────────────────────────

export function quickScreen(
  subject: QuickScreenSubject,
  candidates: QuickScreenCandidate[],
  opts: QuickScreenOptions = {},
): QuickScreenResult {
  const rawThreshold = opts.scoreThreshold ?? DEFAULT_THRESHOLD;
  const threshold = Math.max(0, Math.min(1, rawThreshold));
  const maxHits = opts.maxHits ?? DEFAULT_MAX_HITS;
  const clock = opts.clock ?? (() => Date.now());
  const now = opts.now ?? (() => new Date().toISOString());
  const breakdown = opts.includeScoreBreakdown ?? false;
  const autoRules = resolveAutoRules(opts.autoResolveRules);
  // Pre-normalise per-list thresholds so every lookup is O(1).
  // When the caller supplies none, the HAWKEYE_LIST_THRESHOLDS env defaults
  // apply (operator-tuned per-list noise floors, e.g. informational lists
  // at 0.85). Ships empty by default.
  const listThresholds = opts.listThresholds ?? fpTriageConfig().listThresholds;

  const start = clock();
  const subjectNames = [subject.name, ...(subject.aliases ?? [])].filter((n) => n && n.trim());

  const hits: QuickScreenHit[] = [];
  const listsSeen = new Set<string>();

  // ── Candidate blocking pre-gate ──────────────────────────────────────────
  // The full ensemble over the whole corpus costs ~52s on a production Lambda
  // (live profile 2026-06-12); the gate skips candidates that share no
  // plausible matching signal with the subject. Recall contract documented at
  // couldPlausiblyMatch(). Discriminator boosts can add at most +0.32
  // (nationalId +0.15, DOB +0.10, nationality +0.04, jurisdiction +0.03), so
  // with an effective threshold ≥0.70 only pairs with base score ≥0.38 can
  // ever hit — comfortably inside the band the gate's signal analysis covers.
  // Below that band (operator lowered thresholds), blocking auto-disables and
  // the exhaustive scan runs.
  const MIN_BLOCKING_THRESHOLD = 0.70;
  const minEffectiveThreshold = Object.values(listThresholds).reduce(
    (m, v) => Math.min(m, v),
    threshold,
  );
  const blockingEnabled =
    opts.exhaustive !== true && minEffectiveThreshold >= MIN_BLOCKING_THRESHOLD;
  const subjectKeys = blockingEnabled ? subjectNames.map((n) => buildNameKeys(n)) : [];

  for (const cand of candidates) {
    listsSeen.add(cand.listId);
    const candNames = [cand.name, ...(cand.aliases ?? [])].filter((n) => n && n.trim());

    if (blockingEnabled) {
      let plausible = false;
      outer: for (const cn of candNames) {
        const ck = buildNameKeys(cn);
        for (const sk of subjectKeys) {
          if (couldPlausiblyMatch(sk, ck)) { plausible = true; break outer; }
        }
      }
      // No shared signal on any name pair — no ensemble algorithm can produce
      // a hit for this candidate (see recall contract); skip the full scan.
      if (!plausible) continue;
    }

    let bestScore = 0;
    let bestMethod: MatchingMethod = 'exact';
    let bestAlias: string | undefined;
    let bestSubjectName = subject.name;
    let phonetic = false;
    let bestEns: ReturnType<typeof matchEnsemble> | undefined;

    for (const sn of subjectNames) {
      for (const cn of candNames) {
        const ens = matchEnsemble(sn, cn);
        if (ens.best.score > bestScore) {
          bestScore = ens.best.score;
          bestMethod = ens.best.method;
          bestAlias = cn === cand.name ? undefined : cn;
          bestSubjectName = sn;
          // Accumulate phonetic agreement across comparisons: once a phonetically
          // related pair is found, retain that signal even if the final best-scoring
          // pair (e.g. an initials expansion) doesn't itself pass Soundex/Metaphone.
          phonetic = phonetic || ens.phoneticAgreement;
          bestEns = ens;
        } else if (ens.best.score === bestScore) {
          if (ens.phoneticAgreement) phonetic = true;
          // On a score tie, prefer alias names over the primary candidate name so
          // that matchedAlias is set when the subject input directly matches a listed
          // alias (e.g. 'D. Volkov' → alias 'D. Volkov' rather than staying undefined
          // because initials expansion also scored 1.0 against the primary name).
          // Among aliases, the 'exact' method is authoritative and wins any tie.
          if (cn !== cand.name && (bestAlias === undefined || ens.best.method === 'exact')) {
            bestAlias = cn;
          }
        }
      }
    }

    // ── Discriminator adjustments ─────────────────────────────────────────────
    // Applied to the base name-matching score. Each signal is independent.
    // The adjusted score is used for threshold filtering and hit ranking.
    // Operators see both baseScore and score so the adjustment is transparent.

    let adjScore = bestScore;
    let dobMatchResult: DobMatch = 'none';
    let nationalityMatch: boolean | undefined;
    let nationalIdMatch: boolean | undefined;

    // National ID / Passport — strongest discriminator (definitive identity proof)
    // Boosts by +0.15 on match; penalises -0.15 on confirmed conflict.
    const sNid = (subject.nationalId ?? '').replace(/[-\s]/g, '').toUpperCase();
    const cNid = (cand.nationalId ?? '').replace(/[-\s]/g, '').toUpperCase();
    const sPp = (subject.passportNumber ?? '').replace(/[-\s]/g, '').toUpperCase();
    const cPp = (cand.passportNumber ?? '').replace(/[-\s]/g, '').toUpperCase();
    const sReg = (subject.registrationNumber ?? '').replace(/[-\s]/g, '').toUpperCase();
    const cReg = (cand.registrationNumber ?? '').replace(/[-\s]/g, '').toUpperCase();
    if (sNid.length >= 5 && cNid.length >= 5) {
      nationalIdMatch = sNid === cNid;
      adjScore = Math.min(1, Math.max(0, adjScore + (nationalIdMatch ? 0.15 : -0.15)));
    } else if (sPp.length >= 5 && cPp.length >= 5) {
      nationalIdMatch = sPp === cPp;
      adjScore = Math.min(1, Math.max(0, adjScore + (nationalIdMatch ? 0.15 : -0.15)));
    } else if (sReg.length >= 4 && cReg.length >= 4) {
      nationalIdMatch = sReg === cReg;
      adjScore = Math.min(1, Math.max(0, adjScore + (nationalIdMatch ? 0.12 : -0.12)));
    }

    // DOB discriminator — most important demographic discriminator
    let dobYearDelta: number | undefined;
    if (subject.dateOfBirth && cand.dateOfBirth) {
      const { match, boost, yearDelta } = matchDOB(subject.dateOfBirth, cand.dateOfBirth);
      dobMatchResult = match;
      dobYearDelta = yearDelta;
      adjScore = Math.min(1, Math.max(0, adjScore + boost));
    }

    // Nationality discriminator
    if (subject.nationality && cand.nationality) {
      const sNat = subject.nationality.trim().toLowerCase();
      const cNat = cand.nationality.trim().toLowerCase();
      if (sNat === cNat && sNat.length > 0) {
        nationalityMatch = true;
        adjScore = Math.min(1, adjScore + 0.04);
      } else {
        nationalityMatch = false;
        adjScore = Math.max(0, adjScore - 0.02); // mild penalty for nationality conflict
      }
    }

    // Jurisdiction boost (corroborative signal, not a conflict indicator)
    if (subject.jurisdiction && cand.jurisdiction) {
      const sj = subject.jurisdiction.trim().toUpperCase();
      const cj = cand.jurisdiction.trim().toUpperCase();
      if (sj === cj && sj.length > 0) adjScore = Math.min(1, adjScore + 0.03);
    }

    // Per-list threshold override — allows tighter thresholds for high-signal
    // lists (e.g. OFAC SDN at 0.85) and looser for informational lists (0.78).
    const _overrideThreshold = listThresholds[cand.listId];
    const effectiveThreshold = _overrideThreshold !== undefined
      ? Math.max(0, Math.min(1, _overrideThreshold))
      : threshold;

    if (adjScore >= effectiveThreshold) {
      const disambConf = disambiguationConfidenceFor(dobMatchResult, nationalityMatch, phonetic, nationalIdMatch);
      const hit: QuickScreenHit = {
        listId: cand.listId,
        listRef: cand.listRef,
        candidateName: cand.name,
        score: adjScore,
        baseScore: bestScore,
        method: bestMethod,
        phoneticAgreement: phonetic,
        reason: reasonFor(bestMethod, phonetic, subject, cand, dobMatchResult, nationalIdMatch),
        disambiguationConfidence: disambConf,
        recommendation: recommendationFor(disambConf),
      };
      if (bestAlias !== undefined) hit.matchedAlias = bestAlias;
      if (cand.programs !== undefined) hit.programs = cand.programs;
      if (dobMatchResult !== 'none') hit.dobMatch = dobMatchResult;
      if (nationalityMatch !== undefined) hit.nationalityMatch = nationalityMatch;
      if (nationalIdMatch !== undefined) hit.nationalIdMatch = nationalIdMatch;
      // Entity-type transparency — always record candidate entity type so
      // callers can distinguish direct designations from entity-association hits.
      if (cand.entityType !== undefined) hit.candidateEntityType = cand.entityType;
      // Entity-type mismatch penalty — driven by the configurable mismatch table.
      // Pairs with multiplier < 1.0 are labelled entity-association hits.
      // Pairs with multiplier = 1.0 (e.g. vessel↔org) are not penalised.
      if (subject.entityType && cand.entityType && subject.entityType !== cand.entityType) {
        const multiplier = entityMismatchMultiplier(subject.entityType, cand.entityType);
        if (multiplier < 1.0) {
          hit.score = Math.round(hit.score * multiplier * 1e6) / 1e6;
          hit.entityTypeMismatch = true;
          hit.reason = `entity-association(×${multiplier.toFixed(2)}) · ${hit.reason}`;
        }
      }
      if (dobYearDelta !== undefined) hit.dobYearDelta = dobYearDelta;

      // ── FP-60 score caps ────────────────────────────────────────────────
      // Applied AFTER threshold filtering so the hit survives for review at
      // MEDIUM severity instead of disappearing — attenuation, not suppression.
      const triage = fpTriageConfig();
      const hasPositiveDiscriminator =
        dobMatchResult === 'exact' || dobMatchResult === 'year' ||
        nationalityMatch === true || nationalIdMatch === true;
      if (triage.enabled && !hasPositiveDiscriminator) {
        // Weak-fuzzy single-token guard: subset/token matches driven by one
        // effective token ("Ahmad" ⊂ "Ahmad Al-Rashidi" scores 1.0 on
        // partial_token_set) cannot rank above MEDIUM without corroboration.
        const isTokenSubsetMethod =
          bestMethod === 'partial_token_set' || bestMethod === 'fuzzball_partial' || bestMethod === 'token_set';
        if (isTokenSubsetMethod && hit.score > triage.singleTokenScoreCap) {
          const matchedCandName = hit.matchedAlias ?? cand.name;
          const shorterTokens = Math.min(
            effectiveTokenCount(bestSubjectName),
            effectiveTokenCount(matchedCandName),
          );
          if (shorterTokens === 1) {
            hit.score = triage.singleTokenScoreCap;
            hit.reason = `single-token-overlap(capped at ${triage.singleTokenScoreCap}) · ${hit.reason}`;
          }
        }
        // Common-name corroboration cap: high-frequency names with zero
        // positive discriminators max out at MEDIUM (0.84 → severity band
        // 70-84). Never dismissed — the hit still surfaces and alerts.
        if (triage.commonNameCapEnabled && subject.commonName === true && hit.score > 0.84) {
          hit.score = 0.84;
          hit.reason = `common-name-uncorroborated(capped at 0.84) · ${hit.reason}`;
        }
      }

      // D2: Secondary identifier disambiguation gate before HIGH severity.
      // If secondary identifiers are available but CONFLICT, downgrade the
      // hit's effective score so it cannot reach HIGH without manual review.
      // Conflicts already handled by DOB/nationality/nationalId discriminators
      // above; this block adds an explicit note so the MLRO sees the conflict.
      if (hit.dobMatch === 'conflict' || hit.nationalIdMatch === false) {
        const conflictNote = hit.dobMatch === 'conflict' ? 'DOB conflict' : 'ID conflict';
        hit.reason = `${conflictNote} (secondary identifier mismatch — review required) · ${hit.reason}`;
      }
      if (breakdown && bestEns) {
        const seen = new Set<string>();
        const scoreMap: Partial<Record<MatchingMethod, number>> = {};
        for (const s of bestEns.scores) {
          // Keep the highest score per method (raw + normalised passes can both appear)
          if (!seen.has(s.method) || (scoreMap[s.method] ?? 0) < s.score) {
            scoreMap[s.method] = s.score;
            seen.add(s.method);
          }
        }
        hit.scores = scoreMap;
      }
      // ── Multi-factor disambiguation enrichment ────────────────────────────
      // Compute the explicit additive disambiguation score (0-100), confidence
      // tier, factor breakdown, false-positive flag, and SDN program context.
      // Runs after all score adjustments are finalised so baseScore is stable.
      const enriched = enrichHitWithDisambiguation(hit, subject, cand);
      Object.assign(hit, {
        disambiguationScore: enriched.disambiguationScore,
        confidenceTier: enriched.confidenceTier,
        disambiguationFactors: enriched.disambiguationFactors,
        ...(enriched.falsePositiveFlag ? { falsePositiveFlag: enriched.falsePositiveFlag } : {}),
        ...(enriched.falsePositiveExplanation ? { falsePositiveExplanation: enriched.falsePositiveExplanation } : {}),
        ...(enriched.sdnPrograms ? { sdnPrograms: enriched.sdnPrograms } : {}),
      });
      hits.push(hit);
    }
  }

  hits.sort((a, b) => b.score - a.score);

  // ── Auto-resolve rules ────────────────────────────────────────────────────
  // Apply after sorting so baseScore/dobMatch/etc. are all set.
  // Auto-dismissed hits are retained in the array (MLRO transparency) but
  // sorted to the end and tagged so the UI can collapse them by default.
  if (autoRules.length > 0) {
    for (const hit of hits) {
      if (hit.autoResolution) continue; // already resolved
      for (const rule of autoRules) {
        if (applyAutoResolveRule(rule, hit, subject)) {
          hit.autoResolution = rule.action;
          if (rule.reasonCode !== undefined) hit.autoResolutionReasonCode = rule.reasonCode;
          if (rule.reasonLabel !== undefined) hit.autoResolutionReason = rule.reasonLabel;
          break;
        }
      }
    }
    // Re-sort: non-resolved hits first, then flagged, then auto-dismissed
    hits.sort((a, b) => {
      const rank = (h: QuickScreenHit) =>
        h.autoResolution === 'auto-dismissed' ? 2 : h.autoResolution === 'flagged' ? 1 : 0;
      const dr = rank(a) - rank(b);
      return dr !== 0 ? dr : b.score - a.score;
    });
  }

  const clipped = hits.slice(0, maxHits);

  // For severity/topScore, ignore auto-dismissed hits (they should not inflate risk)
  const activeHits = clipped.filter((h) => h.autoResolution !== 'auto-dismissed');
  const topRaw = activeHits[0]?.score ?? 0;
  const topScore = Math.round(topRaw * 100);
  const topHit = activeHits[0];
  const topBaseScore = topHit?.baseScore ?? 1;
  const topAliasLen = topHit?.matchedAlias !== undefined && topHit.matchedAlias !== '' ? topHit.matchedAlias.length : 99;
  const severity = severityFromScore(topScore, activeHits.length, {
    bestBaseScore: topBaseScore,
    aliasMatchLength: topAliasLen,
  });

  // D3: compute lowConfidenceFlag — signals PROBABLE FALSE POSITIVE
  let lowConfidenceFlag = false;
  let lowConfidenceReason: string | undefined;
  if (activeHits.length > 0) {
    if (topBaseScore < MIN_BASE_SCORE_FOR_HIGH) {
      lowConfidenceFlag = true;
      lowConfidenceReason = `base name-match score ${Math.round(topBaseScore * 100)}% below ${Math.round(MIN_BASE_SCORE_FOR_HIGH * 100)}% minimum for HIGH classification`;
    } else if (topAliasLen < MIN_ALIAS_LENGTH_FOR_HIGH) {
      lowConfidenceFlag = true;
      lowConfidenceReason = `match driven by short alias fragment (${topAliasLen} chars) — secondary identifier confirmation required`;
    }
  }

  // ── Weighted scoring across all hits ──────────────────────────────────────
  // Build per-list summary; use the highest-scoring hit per list.
  const listBreakdown: Record<string, { hits: number; topScore: number; weight: number }> = {};
  for (const h of clipped) {
    const rec = listBreakdown[h.listId];
    const hs100 = Math.round(h.score * 100);
    if (!rec) {
      listBreakdown[h.listId] = { hits: 1, topScore: hs100, weight: listWeight(h.listId) };
    } else {
      rec.hits++;
      if (hs100 > rec.topScore) rec.topScore = hs100;
    }
  }

  let totalWeightedScore: number | undefined;
  if (clipped.length > 0) {
    let wSum = 0; let wTotal = 0;
    for (const rec of Object.values(listBreakdown)) {
      wSum += rec.topScore * rec.weight;
      wTotal += rec.weight;
    }
    totalWeightedScore = wTotal > 0 ? Math.round(wSum / wTotal) : topScore;
  }

  // Aggregate confidence: max of per-hit disambiguation confidences.
  // Using max rather than mean prevents a portfolio of low-quality hits from
  // masking one high-confidence match (e.g. 1×95 + 4×20 should report 95,
  // not 31). confidenceVariance exposes the spread so reviewers can see
  // whether scores are consistent or dominated by a single outlier.
  let confidenceScore: number | undefined;
  let confidenceVariance: number | undefined;
  if (clipped.length > 0) {
    const withConf = clipped.filter((h) => h.disambiguationConfidence !== undefined);
    if (withConf.length > 0) {
      const values = withConf.map((h) => h.disambiguationConfidence as number);
      confidenceScore = Math.max(...values);
      if (values.length >= 2) {
        const mean = values.reduce((s, v) => s + v, 0) / values.length;
        const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
        confidenceVariance = Math.round(variance * 10) / 10;
      }
    }
  }

  // ── Look-alike name clustering ─────────────────────────────────────────────
  // Group hits whose candidateNames are >= 95% similar (trigram Jaccard) so
  // the analyst sees "N variants of the same listing" rather than confusing
  // near-duplicates. Only runs when there are >= 2 hits.
  let finalHits: QuickScreenHit[] = clipped;
  let lookalikeClusters: ClusterSummary[] | undefined;
  if (clipped.length >= 2) {
    const clustered = clusterLookalikes(clipped);
    finalHits = clustered.hits as QuickScreenHit[];
    if (clustered.clusters.length > 0) {
      lookalikeClusters = clustered.clusters;
    }
  }

  // Count hits auto-flagged as likely false positives.
  const likelyFalsePositiveCount = finalHits.filter(
    (h) => (h as QuickScreenHit & { falsePositiveFlag?: string }).falsePositiveFlag === 'likely_false_positive',
  ).length;

  // FP-60 triage counters — persisted to the audit chain by callers so
  // dismissal volume and reason mix are queryable per screening.
  let autoDismissedCount = 0;
  const fpReasonBreakdown: Record<string, number> = {};
  for (const h of finalHits) {
    if (h.autoResolution === 'auto-dismissed') autoDismissedCount++;
    if (h.autoResolution && h.autoResolutionReasonCode) {
      fpReasonBreakdown[h.autoResolutionReasonCode] = (fpReasonBreakdown[h.autoResolutionReasonCode] ?? 0) + 1;
    }
  }

  return {
    subject,
    hits: finalHits,
    topScore,
    severity,
    listsChecked: listsSeen.size,
    listIds: [...listsSeen].sort(),
    candidatesChecked: candidates.length,
    durationMs: Math.max(0, clock() - start),
    generatedAt: now(),
    ...(lowConfidenceFlag ? { lowConfidenceFlag, ...(lowConfidenceReason !== undefined ? { lowConfidenceReason } : {}) } : {}),
    ...(totalWeightedScore !== undefined ? { totalWeightedScore } : {}),
    ...(confidenceScore !== undefined ? { confidenceScore } : {}),
    ...(confidenceVariance !== undefined ? { confidenceVariance } : {}),
    ...(clipped.length > 0 ? { listBreakdown } : {}),
    ...(lookalikeClusters ? { lookalikeClusters } : {}),
    ...(likelyFalsePositiveCount > 0 ? { likelyFalsePositiveCount } : {}),
    ...(autoDismissedCount > 0 ? { autoDismissedCount } : {}),
    ...(Object.keys(fpReasonBreakdown).length > 0 ? { fpReasonBreakdown } : {}),
  };
}

function reasonFor(
  method: MatchingMethod,
  phonetic: boolean,
  subject: QuickScreenSubject,
  cand: QuickScreenCandidate,
  dobMatch: DobMatch = 'none',
  nationalIdMatch?: boolean,
): string {
  const parts: string[] = [`${method} match`];
  if (phonetic) parts.push('phonetic agreement');
  if (nationalIdMatch === true) parts.push('ID confirmed');
  else if (nationalIdMatch === false) parts.push('ID conflict');
  if (dobMatch === 'exact') parts.push('DOB confirmed');
  else if (dobMatch === 'year') parts.push('birth year match');
  else if (dobMatch === 'conflict') parts.push('DOB conflict');
  if (subject.jurisdiction && cand.jurisdiction && subject.jurisdiction === cand.jurisdiction) {
    parts.push(`jurisdiction ${subject.jurisdiction}`);
  }
  if (subject.entityType && cand.entityType && subject.entityType === cand.entityType) {
    parts.push(`entity type ${subject.entityType}`);
  }
  return parts.join(' · ');
}
