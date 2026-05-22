// Hawkeye Sterling — `quickScreen`.
// A compact, stateless screening surface that composes the existing matching
// primitives (matchEnsemble) into a single verdict against a supplied candidate
// list. Designed for low-latency UI callers: no I/O, no network, no stubs —
// callers own candidate acquisition (DB, file, API) and pass the rows in.

import { matchEnsemble, type MatchingMethod } from './matching.js';

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
}

// Auto-resolve rules reduce manual review load for low-confidence hits.
// Rules are evaluated in order; first matching rule wins.
// 'auto-dismissed' — hit is tagged and sorted to the bottom (MLRO can still see it).
// 'flagged'        — hit is surfaced normally but carries a flag label.
export interface AutoResolveRule {
  listIdPattern?: string | RegExp; // match listId against this pattern (string = exact prefix)
  entityTypes?: EntityType[];      // apply only when subject.entityType is in this set
  maxBaseScore?: number;           // only apply when baseScore is at or below this value
  requireDobConflict?: boolean;    // only apply when dobMatch === 'conflict'
  requireNationalityConflict?: boolean; // only apply when nationalityMatch === false
  requireNationalIdConflict?: boolean;  // only apply when nationalIdMatch === false
  requireEntityMismatch?: boolean; // only apply when entityTypeMismatch === true
  action: 'auto-dismissed' | 'flagged';
}

export interface QuickScreenOptions {
  scoreThreshold?: number;          // default 0.82 (global)
  listThresholds?: Record<string, number>; // per-listId threshold overrides
  maxHits?: number;                 // default 25
  includeScoreBreakdown?: boolean;  // attach per-algorithm scores to each hit
  // Auto-resolve rules evaluated against each hit after scoring.
  // Pre-built profiles: 'conservative' | 'standard' | 'strict'.
  // 'conservative' = dismiss DOB conflicts on informational lists only.
  // 'standard'     = dismiss DOB/nationality conflicts on all lists below 0.90 base.
  // 'strict'       = dismiss any conflict (DOB OR nationality) on non-critical lists.
  autoResolveRules?: AutoResolveRule[] | 'conservative' | 'standard' | 'strict';
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
  confidenceScore?: number;          // 0..100 aggregate discriminator confidence
  listBreakdown?: Record<string, {   // per-list summary (only lists with hits)
    hits: number;
    topScore: number;                // 0..100
    weight: number;                  // list regulatory weight
  }>;
}

const DEFAULT_THRESHOLD = 0.82;
const DEFAULT_MAX_HITS = 25;

// Critical lists — never auto-dismiss hits regardless of profile
const CRITICAL_LIST_IDS = new Set([
  'un_consolidated', 'un_1267', 'ofac_sdn', 'uae_eocn', 'uae_ltl',
]);


const BUILTIN_PROFILES: Record<string, AutoResolveRule[]> = {
  conservative: [
    // Only dismiss DOB conflicts on informational lists with low base score
    {
      listIdPattern: /(jp_mof|ca_osfi|au_dfat|ch_seco)/,
      maxBaseScore: 0.88,
      requireDobConflict: true,
      action: 'auto-dismissed',
    },
  ],
  standard: [
    // Dismiss ID conflicts everywhere except critical lists (guard in applyAutoResolveRule)
    { requireNationalIdConflict: true, action: 'auto-dismissed' },
    // Dismiss DOB conflicts on non-critical lists — no maxBaseScore constraint because
    // a DOB conflict on an exact name match is the most dangerous false positive pattern
    // (same name, different person). The critical list guard prevents OFAC/UN/UAE dismissal.
    { requireDobConflict: true, action: 'auto-dismissed' },
    // Flag DOB conflicts that survive the dismiss rule (i.e., critical list hits)
    { requireDobConflict: true, action: 'flagged' },
    // Flag nationality conflicts on lower-confidence hits
    { requireNationalityConflict: true, maxBaseScore: 0.88, action: 'flagged' },
  ],
  strict: [
    // Dismiss ID conflicts on any non-critical list
    { requireNationalIdConflict: true, action: 'auto-dismissed' },
    // Dismiss DOB or nationality conflicts on non-critical lists
    { requireDobConflict: true, action: 'auto-dismissed' },
    { requireNationalityConflict: true, maxBaseScore: 0.92, action: 'auto-dismissed' },
    // Flag entity-type mismatches (always surface for MLRO)
    { requireEntityMismatch: true, action: 'flagged' },
    // Flag remaining nationality conflicts on critical lists
    { requireNationalityConflict: true, action: 'flagged' },
  ],
};

function resolveAutoRules(
  opt: AutoResolveRule[] | 'conservative' | 'standard' | 'strict' | undefined,
): AutoResolveRule[] {
  if (!opt) return [];
  if (typeof opt === 'string') return BUILTIN_PROFILES[opt] ?? [];
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
  if (rule.requireDobConflict && hit.dobMatch !== 'conflict') return false;
  if (rule.requireNationalityConflict && hit.nationalityMatch !== false) return false;
  if (rule.requireNationalIdConflict && hit.nationalIdMatch !== false) return false;
  if (rule.requireEntityMismatch && !hit.entityTypeMismatch) return false;
  return true;
}

// Regulatory weight per sanctions list.  Higher = more consequential for
// the UAE AML/CFT framework.  Unknown lists default to 10.
const LIST_WEIGHTS: Record<string, number> = {
  un_consolidated: 40, un_1267: 40,
  ofac_sdn: 38, ofac_cons: 30,
  uae_eocn: 40, uae_ltl: 35,
  eu_fsf: 25, uk_ofsi: 22,
  ca_osfi: 20, ch_seco: 20, au_dfat: 20,
  jp_mof: 15,
};
const DEFAULT_LIST_WEIGHT = 10;

function listWeight(listId: string): number {
  return LIST_WEIGHTS[listId] ?? DEFAULT_LIST_WEIGHT;
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

function matchDOB(subjectDob: string, candidateDob: string): { match: DobMatch; boost: number } {
  const sp = parseDobParts(subjectDob);
  const cp = parseDobParts(candidateDob);
  if (!sp || !cp) return { match: 'none', boost: 0 };
  if (sp.y !== cp.y) return { match: 'conflict', boost: -0.20 };
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
  // Pre-normalise per-list thresholds so every lookup is O(1)
  const listThresholds = opts.listThresholds ?? {};

  const start = clock();
  const subjectNames = [subject.name, ...(subject.aliases ?? [])].filter((n) => n && n.trim());

  const hits: QuickScreenHit[] = [];
  const listsSeen = new Set<string>();

  for (const cand of candidates) {
    listsSeen.add(cand.listId);
    const candNames = [cand.name, ...(cand.aliases ?? [])].filter((n) => n && n.trim());

    let bestScore = 0;
    let bestMethod: MatchingMethod = 'exact';
    let bestAlias: string | undefined;
    let phonetic = false;
    let bestEns: ReturnType<typeof matchEnsemble> | undefined;

    for (const sn of subjectNames) {
      for (const cn of candNames) {
        const ens = matchEnsemble(sn, cn);
        if (ens.best.score > bestScore) {
          bestScore = ens.best.score;
          bestMethod = ens.best.method;
          bestAlias = cn === cand.name ? undefined : cn;
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
    if (subject.dateOfBirth && cand.dateOfBirth) {
      const { match, boost } = matchDOB(subject.dateOfBirth, cand.dateOfBirth);
      dobMatchResult = match;
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
      // Entity-type mismatch penalty — applied AFTER threshold so the hit still
      // surfaces (for MLRO review) but score is penalised to reflect the
      // indirect nature of the match (e.g. individual named within an org record).
      if (subject.entityType && cand.entityType && subject.entityType !== cand.entityType) {
        const personVsOrg =
          (subject.entityType === 'individual' && cand.entityType === 'organisation') ||
          (subject.entityType === 'organisation' && cand.entityType === 'individual');
        if (personVsOrg) {
          hit.score = Math.round(hit.score * 0.6 * 1e6) / 1e6; // ×0.6, avoid float noise
          hit.entityTypeMismatch = true;
          hit.reason = `entity-association · ${hit.reason}`;
        }
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
  const topAliasLen = topHit?.matchedAlias !== undefined ? (topHit.matchedAlias.length) : 99;
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

  // Aggregate confidence: mean of per-hit disambiguation confidences.
  // Only include hits that actually have a computed discriminator confidence;
  // defaulting absent values to 50 would produce a spuriously confident
  // aggregate when no discriminators are available.
  let confidenceScore: number | undefined;
  if (clipped.length > 0) {
    const withConfidence = clipped.filter((h) => h.disambiguationConfidence !== undefined);
    if (withConfidence.length > 0) {
      const sum = withConfidence.reduce((acc, h) => acc + (h.disambiguationConfidence as number), 0);
      confidenceScore = Math.round(sum / withConfidence.length);
    }
  }

  return {
    subject,
    hits: clipped,
    topScore,
    severity,
    listsChecked: listsSeen.size,
    listIds: [...listsSeen].sort(),
    candidatesChecked: candidates.length,
    durationMs: Math.max(0, clock() - start),
    generatedAt: now(),
    ...(lowConfidenceFlag ? { lowConfidenceFlag, lowConfidenceReason } : {}),
    ...(totalWeightedScore !== undefined ? { totalWeightedScore } : {}),
    ...(confidenceScore !== undefined ? { confidenceScore } : {}),
    ...(clipped.length > 0 ? { listBreakdown } : {}),
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
