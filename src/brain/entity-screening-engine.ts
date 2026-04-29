// Hawkeye Sterling — entity screening engine.
// Orchestrator composing the brain's screening primitives into a single,
// audit-grade pipeline. Consumes a subject + candidate list + optional context
// signals; emits a charter-compliant response envelope (scope declaration +
// findings + gaps + red flags + recommended next steps + audit line).
//
// Pipeline (three-tier, short-circuiting in favour of higher-confidence tiers):
//   1. Identifier-exact  — shared strong ID across same-type entities.
//   2. Name-exact        — normalised-name equality corroborated by at least
//                          one contextual / strong disambiguator.
//   3. Fuzzy + matrix    — ensemble name match + disambiguator calibration
//                          via resolveEntities / calibrateConfidence.
//
// Charter alignment:
//   - P1  never asserts sanctions without an authoritative list in input.
//   - P3  never produces legal conclusions; only indicators and next steps.
//   - P6  never merges distinct candidates; each becomes a separate finding.
//   - P7  always emits a scope declaration, even for "no hit" runs.
//   - P9  recommended actions cite methodology, inputs, and caps engaged.
//   - P10 halts with a structured gap list when inputs are insufficient.

import {
  resolveEntities,
  type EntityRecord,
  type ResolutionResult,
} from './entity-resolution.js';
import { matchEnsemble } from './matching.js';
import type { MatchConfidenceLevel } from '../policy/systemPrompt.js';
import type { Alert, AlertKind } from './alerts.js';
import {
  SANCTION_REGIME_BY_ID,
  type SanctionRegimeId,
} from './sanction-regimes.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MatchRiskTier =
  | 'CONFIRMED'
  | 'HIGH_PROBABILITY'
  | 'MODERATE'
  | 'LOW'
  | 'FP_LIKELY';

export type RecommendedAction =
  | 'block_and_file_TFS_notification'
  | 'escalate_to_MLRO'
  | 'EDD_and_disambiguate'
  | 'document_and_monitor'
  | 'document_false_positive'
  | 'refuse_no_authoritative_source';

export type CandidateNature =
  | 'sanctions'
  | 'pep'
  | 'rca'
  | 'adverse_media'
  | 'enforcement'
  | 'litigation'
  | 'internal_watchlist'
  | 'other';

export interface ScreeningCandidate {
  listId: string;
  listRef: string;
  listVersionDate?: string;       // ISO date of the list snapshot — P7 requirement.
  nature: CandidateNature;
  regimes?: SanctionRegimeId[];
  record: EntityRecord;
  rawClaim?: string;              // verbatim designation / allegation text.
  sourceLanguage?: string;
}

export interface ScreeningSubject extends EntityRecord {
  jurisdiction?: string;          // primary-residence / registration iso2.
}

export type AmplifierReason =
  | 'high_risk_jurisdiction_overlap'
  | 'high_risk_product'
  | 'cash_intensity'
  | 'transaction_volume_anomaly'
  | 'sanctioned_regime_in_scope'
  | 'adverse_media_corroborated';

export type AttenuatorReason =
  | 'strong_identifier_conflict'
  | 'entity_type_mismatch'
  | 'common_name_no_strong_id'
  | 'transliteration_no_native_corroboration'
  | 'list_version_stale'
  | 'low_ensemble_score';

export interface ScreeningContext {
  // Optional transaction / relationship signals the caller may supply. None
  // are required — missing signals become gaps, not inferred values (P10).
  jurisdictionsInTransaction?: string[];
  productRiskLevel?: 'low' | 'medium' | 'high';
  cashIntensive?: boolean;
  transactionVolumeAnomaly?: boolean;
  adverseMediaCorroborated?: boolean;
  // Staleness threshold in days. List snapshots older than this attenuate
  // confidence and contribute a gap, per charter P8.
  listStalenessDays?: number;
}

export interface ScreeningEngineOptions {
  // Caller asserts that the candidate list came from an authoritative source
  // actually supplied in input. If false (default), the engine will never
  // recommend `block_and_file_TFS_notification` — P1.
  authoritativeListSupplied?: boolean;
  // Fuzzy floor below which candidates are discarded outright.
  ensembleFloor?: number;
  // Clock injection for deterministic tests.
  now?: () => string;
  // Optional stable engine version string; included in the audit line.
  engineVersion?: string;
}

export interface FalsePositiveResolution {
  candidateIndex: number;
  resolvedBy: string;          // MLRO / analyst identifier
  resolvedAt: string;          // ISO timestamp
  reason: string;
  evidenceRefs?: string[];
}

export interface ScreeningFinding {
  candidateIndex: number;
  listId: string;
  listRef: string;
  listVersionDate?: string;
  nature: CandidateNature;
  regimes: SanctionRegimeId[];
  regimeAuthorities: string[];
  confidence: MatchConfidenceLevel;
  matchRiskTier: MatchRiskTier;
  ensembleScore: number;        // 0..1
  bestMatchPair?: { subject: string; candidate: string };
  disambiguatorsPresent: string[];
  disambiguatorsAbsent: string[];
  sharedIdentifiers: string[];
  conflictingIdentifiers: string[];
  amplifiers: AmplifierReason[];
  attenuators: AttenuatorReason[];
  caps: string[];
  rationale: string;
  rawClaim?: string;
  sourceLanguage?: string;
  recommendedAction: RecommendedAction;
  resolution?: FalsePositiveResolution;
}

export interface ScreeningScopeDeclaration {
  listsChecked: Array<{
    listId: string;
    listRef: string;
    listVersionDate?: string;
    regimes: SanctionRegimeId[];
  }>;
  listCount: number;
  candidatesScreened: number;
  identifiersMatchedOn: string[];
  identifiersAbsent: string[];
  matchingMethods: string[];
  authoritativeListSupplied: boolean;
}

export interface ScreeningAuditLine {
  timestamp: string;
  engineVersion: string;
  scopeHash: string;
  decisionSupportOnly: string;
}

export interface ScreeningEngineResult {
  subject: { name: string; type: EntityRecord['entityType']; jurisdiction?: string };
  scopeDeclaration: ScreeningScopeDeclaration;
  findings: ScreeningFinding[];
  gaps: string[];
  redFlags: string[];
  recommendedNextSteps: string[];
  alerts: Alert[];
  topMatchRiskTier: MatchRiskTier | 'NONE';
  topConfidence: MatchConfidenceLevel;
  auditLine: ScreeningAuditLine;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_ENSEMBLE_FLOOR = 0.7;
const DEFAULT_STALENESS_DAYS = 30;
const ENGINE_VERSION = 'hawkeye-sterling.entity-screening-engine@1.0.0';

// High-risk jurisdictions that, when overlapping with the subject's profile,
// amplify match risk. Source: FATF grey/black and UAE-referenced NCRA lists.
// This is intentionally a conservative static set — the caller's own CAHRA
// feed (src/brain/cahra.ts) is the authoritative runtime source.
const STATIC_HIGH_RISK_JURISDICTIONS = new Set<string>([
  'AF', 'BY', 'CU', 'IR', 'KP', 'LY', 'MM', 'RU', 'SD', 'SS', 'SY', 'VE', 'YE',
]);

// Regimes whose designation nature justifies the strongest recommended
// action once the underlying match is corroborated.
const TFS_CRITICAL_REGIMES: ReadonlySet<SanctionRegimeId> = new Set([
  'un_1267',
  'un_1988',
  'un_dprk',
  'un_iran',
  'uae_eocn',
  'uae_local_terrorist',
]);

function toStrongPresentList(r: ResolutionResult): string[] {
  // resolveEntities encodes agreements as strings; filter the identifier/DOB/
  // nationality lines so callers can render a clean disambiguator inventory.
  const out: string[] = [];
  if (r.sharedIdentifiers.length) out.push(...r.sharedIdentifiers);
  for (const a of r.agreements) {
    if (a.startsWith('same entity type')) out.push(a);
  }
  return out;
}

function toConfidenceTier(
  level: MatchConfidenceLevel,
  attenuators: AttenuatorReason[],
  commonName: boolean,
  ensembleScore: number,
): MatchRiskTier {
  // FP_LIKELY is reserved for structural impossibilities (entity-type
  // mismatch) and for low-score fuzzy hits without any corroboration. A
  // strong-identifier conflict collapses confidence to POSSIBLE (per charter)
  // but the recommended action is EDD / disambiguate — NOT "document FP" —
  // because P6 demands that distinct persons be kept as separate candidates
  // under investigation, not silently dismissed.
  const fpSignals =
    attenuators.includes('entity_type_mismatch') ||
    (commonName && attenuators.includes('common_name_no_strong_id') && level === 'WEAK') ||
    (ensembleScore < 0.7 && level !== 'EXACT' && level !== 'STRONG' && level !== 'POSSIBLE');

  if (fpSignals && (level === 'WEAK' || level === 'NO_MATCH')) {
    return 'FP_LIKELY';
  }

  switch (level) {
    case 'EXACT':
      return 'CONFIRMED';
    case 'STRONG':
      return 'HIGH_PROBABILITY';
    case 'POSSIBLE':
      return 'MODERATE';
    case 'WEAK':
      return 'LOW';
    case 'NO_MATCH':
      return 'FP_LIKELY';
  }
}

function actionFor(
  tier: MatchRiskTier,
  nature: CandidateNature,
  regimes: SanctionRegimeId[],
  authoritative: boolean,
): RecommendedAction {
  if (!authoritative && nature === 'sanctions') {
    // P1 — cannot assert sanctions without an authoritative list in input.
    return 'refuse_no_authoritative_source';
  }
  const regimeIsCritical = regimes.some((r) => TFS_CRITICAL_REGIMES.has(r));
  if (tier === 'CONFIRMED' && nature === 'sanctions' && regimeIsCritical) {
    return 'block_and_file_TFS_notification';
  }
  if (tier === 'CONFIRMED' || tier === 'HIGH_PROBABILITY') return 'escalate_to_MLRO';
  if (tier === 'MODERATE') return 'EDD_and_disambiguate';
  if (tier === 'LOW') return 'document_and_monitor';
  return 'document_false_positive';
}

function alertKindFor(nature: CandidateNature, tier: MatchRiskTier): AlertKind {
  if (nature === 'sanctions') {
    return tier === 'CONFIRMED' || tier === 'HIGH_PROBABILITY'
      ? 'sanctions_match'
      : 'partial_sanctions_match';
  }
  if (nature === 'adverse_media') return 'adverse_media';
  if (nature === 'pep' || nature === 'rca') return 'pep_onboarding';
  return 'red_flag';
}

function riskTierHint(tier: MatchRiskTier): 'low' | 'medium' | 'high' | 'very_high' {
  switch (tier) {
    case 'CONFIRMED':
      return 'very_high';
    case 'HIGH_PROBABILITY':
      return 'high';
    case 'MODERATE':
      return 'medium';
    case 'LOW':
      return 'low';
    case 'FP_LIKELY':
      return 'low';
  }
}

function isStale(listVersionDate: string | undefined, thresholdDays: number, nowMs: number): boolean {
  if (!listVersionDate) return false;
  const t = Date.parse(listVersionDate);
  if (Number.isNaN(t)) return false;
  const ageDays = (nowMs - t) / 86_400_000;
  return ageDays > thresholdDays;
}

function stableScopeHash(input: {
  subject: string;
  lists: Array<{ listId: string; listRef: string; listVersionDate?: string }>;
  methods: string[];
}): string {
  // Deterministic, collision-resilient hash without pulling in `crypto`. The
  // audit-chain module handles cryptographic scope hashing; here we only need
  // a stable, comparable fingerprint for the response envelope.
  const canon = JSON.stringify({
    s: input.subject,
    l: [...input.lists].sort((a, b) => (a.listId + a.listRef).localeCompare(b.listId + b.listRef)),
    m: [...input.methods].sort(),
  });
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < canon.length; i++) {
    const c = canon.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return `scope-${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

// ---------------------------------------------------------------------------
// Tier-1 exact-identifier short-circuit
// ---------------------------------------------------------------------------

interface IdentifierExactHit {
  candidateIndex: number;
  sharedKey: string;
}

function identifierExactHits(
  subject: EntityRecord,
  candidates: ScreeningCandidate[],
): IdentifierExactHit[] {
  const hits: IdentifierExactHit[] = [];
  const subjectIds = new Map<string, string>();
  for (const i of subject.identifiers ?? []) {
    subjectIds.set(i.kind, i.number.replace(/\s+/g, ''));
  }
  if (subjectIds.size === 0) return hits;

  candidates.forEach((cand, idx) => {
    if (cand.record.entityType !== subject.entityType) return;
    for (const i of cand.record.identifiers ?? []) {
      const sn = subjectIds.get(i.kind);
      if (sn && sn === i.number.replace(/\s+/g, '')) {
        hits.push({ candidateIndex: idx, sharedKey: `${i.kind}::${sn}` });
        return;
      }
    }
  });
  return hits;
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export function screenEntity(
  subject: ScreeningSubject,
  candidates: ScreeningCandidate[],
  context: ScreeningContext = {},
  options: ScreeningEngineOptions = {},
): ScreeningEngineResult {
  const now = options.now ?? (() => new Date().toISOString());
  const nowIso = now();
  const nowMs = Date.parse(nowIso);
  const ensembleFloor = options.ensembleFloor ?? DEFAULT_ENSEMBLE_FLOOR;
  const stalenessDays = context.listStalenessDays ?? DEFAULT_STALENESS_DAYS;
  const authoritative = options.authoritativeListSupplied === true;
  const engineVersion = options.engineVersion ?? ENGINE_VERSION;

  const tier1 = new Set(identifierExactHits(subject, candidates).map((h) => h.candidateIndex));
  const methodsUsed = new Set<string>();
  const findings: ScreeningFinding[] = [];

  candidates.forEach((cand, idx) => {
    const resolution = resolveEntities(subject, cand.record);
    const ensemble = matchEnsemble(subject.name, cand.record.name);
    const ensembleScore = Math.max(resolution.score, ensemble.best.score);
    methodsUsed.add(ensemble.best.method);

    // Filter floor unless Tier-1 identifier match already promoted this row.
    if (!tier1.has(idx) && ensembleScore < ensembleFloor && resolution.confidence === 'NO_MATCH') {
      return;
    }

    const attenuators: AttenuatorReason[] = [];
    if (resolution.conflictingIdentifiers.length > 0) {
      attenuators.push('strong_identifier_conflict');
    }
    if (subject.entityType !== cand.record.entityType) {
      attenuators.push('entity_type_mismatch');
    }
    const commonName = !!(subject.commonName || cand.record.commonName);
    if (commonName && resolution.sharedIdentifiers.length === 0) {
      attenuators.push('common_name_no_strong_id');
    }
    // Transliteration heuristic: raw strings differ but phonetic matchers
    // agree. Charter caps this at POSSIBLE unless native-script corroborated.
    const subjRaw = subject.name.trim().toLowerCase();
    const candRaw = cand.record.name.trim().toLowerCase();
    const rawsMatch = subjRaw === candRaw;
    if (
      !rawsMatch &&
      ensemble.phoneticAgreement &&
      !resolution.caps.includes('transliterated-uncorroborated-capped-at-possible')
    ) {
      attenuators.push('transliteration_no_native_corroboration');
    }
    if (resolution.caps.includes('transliterated-uncorroborated-capped-at-possible')) {
      attenuators.push('transliteration_no_native_corroboration');
    }
    if (isStale(cand.listVersionDate, stalenessDays, nowMs)) {
      attenuators.push('list_version_stale');
    }
    if (ensembleScore < 0.82) {
      attenuators.push('low_ensemble_score');
    }

    const amplifiers: AmplifierReason[] = [];
    const txnJurisdictions = (context.jurisdictionsInTransaction ?? []).map((j) => j.toUpperCase());
    const subjectJur = subject.jurisdiction?.toUpperCase();
    const allJurisdictions = new Set<string>([
      ...(subjectJur ? [subjectJur] : []),
      ...txnJurisdictions,
    ]);
    if ([...allJurisdictions].some((j) => STATIC_HIGH_RISK_JURISDICTIONS.has(j))) {
      amplifiers.push('high_risk_jurisdiction_overlap');
    }
    if (context.productRiskLevel === 'high') amplifiers.push('high_risk_product');
    if (context.cashIntensive === true) amplifiers.push('cash_intensity');
    if (context.transactionVolumeAnomaly === true) amplifiers.push('transaction_volume_anomaly');
    if (cand.regimes?.some((r) => TFS_CRITICAL_REGIMES.has(r))) {
      amplifiers.push('sanctioned_regime_in_scope');
    }
    if (context.adverseMediaCorroborated === true && cand.nature === 'adverse_media') {
      amplifiers.push('adverse_media_corroborated');
    }

    // Tier-1 identifier-exact overrides fuzzy confidence upward — but only
    // when entity types agree AND there is no strong-ID conflict elsewhere
    // (P6 — distinct identifiers are never merged).
    let confidence: MatchConfidenceLevel = resolution.confidence;
    if (tier1.has(idx) && !attenuators.includes('entity_type_mismatch') && !attenuators.includes('strong_identifier_conflict')) {
      if (confidence === 'WEAK' || confidence === 'POSSIBLE' || confidence === 'NO_MATCH') {
        confidence = 'STRONG';
      }
    }
    // Charter cap: transliterated matches never above POSSIBLE without
    // native-script corroboration.
    if (
      attenuators.includes('transliteration_no_native_corroboration') &&
      (confidence === 'EXACT' || confidence === 'STRONG')
    ) {
      confidence = 'POSSIBLE';
    }

    const matchRiskTier = toConfidenceTier(confidence, attenuators, commonName, ensembleScore);
    const regimes = cand.regimes ?? [];
    const recommendedAction = actionFor(matchRiskTier, cand.nature, regimes, authoritative);

    const regimeAuthorities = regimes
      .map((id) => SANCTION_REGIME_BY_ID.get(id)?.authority)
      .filter((x): x is string => typeof x === 'string');

    const disambiguatorsPresent = toStrongPresentList(resolution);
    const disambiguatorsAbsent = resolution.disagreements;

    const finding: ScreeningFinding = {
      candidateIndex: idx,
      listId: cand.listId,
      listRef: cand.listRef,
      nature: cand.nature,
      regimes,
      regimeAuthorities,
      confidence,
      matchRiskTier,
      ensembleScore,
      disambiguatorsPresent,
      disambiguatorsAbsent,
      sharedIdentifiers: resolution.sharedIdentifiers,
      conflictingIdentifiers: resolution.conflictingIdentifiers,
      amplifiers,
      attenuators,
      caps: resolution.caps,
      rationale: resolution.rationale,
      recommendedAction,
    };
    if (cand.listVersionDate !== undefined) finding.listVersionDate = cand.listVersionDate;
    if (resolution.bestPair !== undefined) {
      finding.bestMatchPair = { subject: resolution.bestPair.a, candidate: resolution.bestPair.b };
    }
    if (cand.rawClaim !== undefined) finding.rawClaim = cand.rawClaim;
    if (cand.sourceLanguage !== undefined) finding.sourceLanguage = cand.sourceLanguage;

    findings.push(finding);
  });

  // Rank findings: CONFIRMED > HIGH_PROBABILITY > MODERATE > LOW > FP_LIKELY;
  // within tier, by ensemble score.
  const tierRank: Record<MatchRiskTier, number> = {
    CONFIRMED: 5,
    HIGH_PROBABILITY: 4,
    MODERATE: 3,
    LOW: 2,
    FP_LIKELY: 1,
  };
  findings.sort((a, b) => {
    const d = tierRank[b.matchRiskTier] - tierRank[a.matchRiskTier];
    return d !== 0 ? d : b.ensembleScore - a.ensembleScore;
  });

  const topMatchRiskTier: MatchRiskTier | 'NONE' = findings[0]?.matchRiskTier ?? 'NONE';
  const topConfidence: MatchConfidenceLevel = findings[0]?.confidence ?? 'NO_MATCH';

  // Alerts: one per non-FP finding; FP_LIKELY stays in the record but does
  // not raise an alert (keeps the MLRO inbox clean, but findings persist for
  // audit — P6).
  const alerts: Alert[] = findings
    .filter((f) => f.matchRiskTier !== 'FP_LIKELY')
    .map((f) => ({
      id: `${f.listId}:${f.listRef}:${f.candidateIndex}`,
      kind: alertKindFor(f.nature, f.matchRiskTier),
      subject: subject.name,
      createdAt: nowIso,
      severityHints: {
        riskTier: riskTierHint(f.matchRiskTier),
        regimes: f.regimes,
      },
    }));

  // Gaps — charter P7 / P10 — surface what was NOT checked.
  const gaps: string[] = [];
  if (!authoritative) {
    gaps.push(
      'No authoritative list provenance declared by caller; sanctions assertions inadmissible per P1.',
    );
  }
  if (candidates.length === 0) {
    gaps.push('No candidate rows supplied; engine screened against an empty scope.');
  }
  const missingListVersionDates = candidates.filter((c) => !c.listVersionDate).length;
  if (missingListVersionDates > 0) {
    gaps.push(`${missingListVersionDates} candidate row(s) lacked listVersionDate — staleness unknown.`);
  }
  if (!subject.dateOfBirth && subject.entityType === 'individual') {
    gaps.push('Subject dateOfBirth absent — DOB disambiguation unavailable.');
  }
  if (!subject.nationality && subject.entityType === 'individual') {
    gaps.push('Subject nationality absent — nationality disambiguation unavailable.');
  }
  if (!subject.identifiers || subject.identifiers.length === 0) {
    gaps.push('No strong identifiers supplied for subject — EXACT/STRONG tiers unreachable via Tier-1.');
  }

  // Red flags — factual indicators only (P3 — no legal conclusions).
  const redFlags: string[] = [];
  for (const f of findings) {
    if (f.amplifiers.includes('high_risk_jurisdiction_overlap')) {
      redFlags.push(`High-risk jurisdiction overlap with candidate ${f.listRef}.`);
    }
    if (f.amplifiers.includes('sanctioned_regime_in_scope')) {
      redFlags.push(`Candidate ${f.listRef} belongs to TFS-critical regime.`);
    }
    if (f.attenuators.includes('strong_identifier_conflict')) {
      redFlags.push(`Strong-identifier conflict on candidate ${f.listRef} — distinct persons likely (P6).`);
    }
    if (f.attenuators.includes('transliteration_no_native_corroboration')) {
      redFlags.push(`Transliteration match on ${f.listRef} without native-script corroboration.`);
    }
  }

  // Recommended next steps — never final disposition (charter output section 6).
  const nextSteps: string[] = [];
  if (topMatchRiskTier === 'CONFIRMED' || topMatchRiskTier === 'HIGH_PROBABILITY') {
    nextSteps.push('Freeze onboarding and escalate to MLRO for review.');
    nextSteps.push('Request native-script name, full DOB, and passport/ID scan if not already held.');
  }
  if (topMatchRiskTier === 'MODERATE') {
    nextSteps.push('Run enhanced due diligence to disambiguate candidate identity.');
    nextSteps.push('Obtain native-script name and strong identifiers to collapse candidate set.');
  }
  if (topMatchRiskTier === 'LOW' || topMatchRiskTier === 'FP_LIKELY' || topMatchRiskTier === 'NONE') {
    nextSteps.push('Document screening result and monitor per periodic review cadence.');
  }
  for (const f of findings) {
    if (f.recommendedAction === 'refuse_no_authoritative_source') {
      nextSteps.push(
        `Candidate ${f.listRef}: retrieve authoritative list snapshot before asserting sanctions status (P1).`,
      );
      break;
    }
  }

  // Scope declaration — P7.
  const identifiersMatchedOn = new Set<string>();
  const identifiersAbsent = new Set<string>();
  for (const f of findings) for (const id of f.sharedIdentifiers) identifiersMatchedOn.add(id);
  if (!subject.dateOfBirth && subject.entityType === 'individual') identifiersAbsent.add('dob');
  if (!subject.nationality && subject.entityType === 'individual') identifiersAbsent.add('nationality');
  if ((subject.identifiers ?? []).length === 0) identifiersAbsent.add('strong_identifiers');

  const scopeLists = candidates.map((c) => {
    const entry: ScreeningScopeDeclaration['listsChecked'][number] = {
      listId: c.listId,
      listRef: c.listRef,
      regimes: c.regimes ?? [],
    };
    if (c.listVersionDate !== undefined) entry.listVersionDate = c.listVersionDate;
    return entry;
  });

  const scopeDeclaration: ScreeningScopeDeclaration = {
    listsChecked: scopeLists,
    listCount: new Set(candidates.map((c) => c.listId)).size,
    candidatesScreened: candidates.length,
    identifiersMatchedOn: [...identifiersMatchedOn],
    identifiersAbsent: [...identifiersAbsent],
    matchingMethods: [...methodsUsed].sort(),
    authoritativeListSupplied: authoritative,
  };

  const scopeHashInput: { subject: string; lists: ScreeningScopeDeclaration['listsChecked']; methods: string[] } = {
    subject: subject.name,
    lists: scopeLists,
    methods: [...methodsUsed].sort(),
  };

  const auditLine: ScreeningAuditLine = {
    timestamp: nowIso,
    engineVersion,
    scopeHash: stableScopeHash(scopeHashInput),
    decisionSupportOnly: 'This output is decision support, not a decision. MLRO review required.',
  };

  const subjectRef: ScreeningEngineResult['subject'] = {
    name: subject.name,
    type: subject.entityType,
  };
  if (subject.jurisdiction !== undefined) subjectRef.jurisdiction = subject.jurisdiction;

  return {
    subject: subjectRef,
    scopeDeclaration,
    findings,
    gaps,
    redFlags: [...new Set(redFlags)],
    recommendedNextSteps: [...new Set(nextSteps)],
    alerts,
    topMatchRiskTier,
    topConfidence,
    auditLine,
  };
}

// ---------------------------------------------------------------------------
// False-positive resolution workflow
// ---------------------------------------------------------------------------

export function resolveFalsePositive(
  result: ScreeningEngineResult,
  resolution: FalsePositiveResolution,
): ScreeningEngineResult {
  const findings = result.findings.map((f) =>
    f.candidateIndex === resolution.candidateIndex ? { ...f, resolution } : f,
  );
  return { ...result, findings };
}
