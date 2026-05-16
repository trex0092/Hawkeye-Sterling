// Hawkeye Sterling — multi-layer entity resolution pipeline.
// Orchestrates: normalization → transliteration → alias expansion →
// token permutation → fuzzy scoring → contextual scoring →
// contradiction analysis → confidence calibration.
//
// Each stage is independently auditable. The pipeline returns a
// PipelineResult with per-stage trace so every hit can be explained
// to a regulator.

import { expandAliases } from './aliases.js';
import { matchEnsemble, type EnsembleMatch } from './matching.js';
import { normalizeArabic } from './ArabicNormalizer.js';
import { colognePhonetic, arabicPhoneticCode } from './PhoneticMatcher.js';
import { scoreContextual, type ContextualInput } from './ContextualScoringEngine.js';
import { analyzeContradictions, type ContradictionReport } from './ContradictionAnalyzer.js';
import { calibrateConfidence, type DisambiguatorState } from './confidence.js';
import type { MatchConfidenceLevel } from '../policy/systemPrompt.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PipelineSubject {
  id: string;
  name: string;
  aliases?: string[];
  entityType: 'individual' | 'organisation' | 'vessel' | 'aircraft' | 'other';
  nationality?: string;
  dateOfBirth?: string;
  dateOfIncorporation?: string;
  identifiers?: Array<{ kind: string; number: string; issuer?: string }>;
  addresses?: Array<{ country?: string; city?: string; full?: string }>;
  programs?: string[];
  commonName?: boolean;
}

export type PipelineStage =
  | 'normalization'
  | 'transliteration'
  | 'alias_expansion'
  | 'token_permutation'
  | 'fuzzy_scoring'
  | 'contextual_scoring'
  | 'contradiction_analysis'
  | 'confidence_calibration';

export interface StageTrace {
  stage: PipelineStage;
  input: string;
  output: string[];
  score?: number;
  notes: string[];
}

export interface PipelineMatch {
  candidateId: string;
  candidateName: string;
  bestSubjectVariant: string;
  bestCandidateVariant: string;
  ensembleMatch: EnsembleMatch;
  contextualScore: number;
  contextualBoosters: string[];
  contextualPenalties: string[];
  contradiction: ContradictionReport;
  confidence: MatchConfidenceLevel;
  finalScore: number;
  stageTrace: StageTrace[];
  rationale: string;
  requiresManualReview: boolean;
  manualReviewReasons: string[];
}

export interface PipelineResult {
  subjectId: string;
  subjectName: string;
  candidatesEvaluated: number;
  matches: PipelineMatch[];
  topMatch: PipelineMatch | null;
  pipelineDurationMs: number;
  stages: PipelineStage[];
}

// ── Stage 1: Normalization ───────────────────────────────────────────────────

function normalizeVariants(name: string): { raw: string; normalized: string; arabicNorm: string } {
  const normalized = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const arabicNorm = normalizeArabic(name);
  return { raw: name, normalized, arabicNorm };
}

// ── Stage 2: Transliteration + Alias Expansion ───────────────────────────────

function buildVariantSet(entity: PipelineSubject): { variants: string[]; trace: StageTrace[] } {
  const traces: StageTrace[] = [];
  const variants = new Set<string>();

  const names = [entity.name, ...(entity.aliases ?? [])];

  for (const name of names) {
    const norm = normalizeVariants(name);
    variants.add(norm.raw);
    variants.add(norm.normalized);
    if (norm.arabicNorm && norm.arabicNorm !== name) variants.add(norm.arabicNorm);

    const expanded = expandAliases(name);
    for (const v of expanded.variants) variants.add(v);
  }

  variants.delete('');
  const variantList = [...variants];

  traces.push({
    stage: 'normalization',
    input: entity.name,
    output: variantList,
    notes: [`${variantList.length} variants generated from ${names.length} name(s)`],
  });

  return { variants: variantList, trace: traces };
}

// ── Stage 3: Token Permutation ───────────────────────────────────────────────

function tokenPermutations(name: string): string[] {
  const tokens = name.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return [tokens.join(' ')];
  if (tokens.length > 6) return [tokens.join(' ')]; // cap to avoid combinatorial explosion
  const results = new Set<string>();
  results.add(tokens.join(' '));
  // All 2-token swaps
  for (let i = 0; i < tokens.length - 1; i++) {
    const swapped = [...tokens];
    [swapped[i], swapped[i + 1]] = [swapped[i + 1] ?? '', swapped[i] ?? ''];
    results.add(swapped.join(' '));
  }
  // First-last swap
  if (tokens.length >= 2) {
    const flipped = [...tokens];
    [flipped[0], flipped[tokens.length - 1]] = [flipped[tokens.length - 1] ?? '', flipped[0] ?? ''];
    results.add(flipped.join(' '));
  }
  return [...results];
}

// ── Stage 4: Fuzzy Scoring ───────────────────────────────────────────────────

function bestFuzzyScore(
  subjectVariants: string[],
  candidateVariants: string[],
): { best: EnsembleMatch; bestSubject: string; bestCandidate: string } {
  let best: EnsembleMatch | null = null;
  let bestSub = '';
  let bestCand = '';

  for (const sv of subjectVariants) {
    for (const cv of candidateVariants) {
      const em = matchEnsemble(sv, cv);
      if (!best || em.best.score > best.best.score) {
        best = em;
        bestSub = sv;
        bestCand = cv;
      }
      if (best.best.score >= 1) break; // exact match — stop early
    }
    if (best && best.best.score >= 1) break;
  }

  if (!best) best = matchEnsemble('', '');
  return { best, bestSubject: bestSub, bestCandidate: bestCand };
}

// ── Stage 5: Phonetic Cross-Check ────────────────────────────────────────────

function phoneticMatch(a: string, b: string): boolean {
  const ca = colognePhonetic(a);
  const cb = colognePhonetic(b);
  if (ca && cb && ca === cb) return true;
  const aa = arabicPhoneticCode(a);
  const ab = arabicPhoneticCode(b);
  if (aa && ab && aa === ab) return true;
  return false;
}

// ── Stage 6: Build DisambiguatorState ────────────────────────────────────────

function buildDisambiguatorState(
  subject: PipelineSubject,
  candidate: PipelineSubject,
  contradiction: ContradictionReport,
): DisambiguatorState {
  const strongPresent: DisambiguatorState['strong']['present'] = [];
  const strongAbsent: DisambiguatorState['strong']['absent'] = [];
  const strongConflicting: DisambiguatorState['strong']['conflicting'] = [];

  // DOB
  if (subject.dateOfBirth && candidate.dateOfBirth) {
    const diffMs = Math.abs(Date.parse(subject.dateOfBirth) - Date.parse(candidate.dateOfBirth));
    const diffDays = diffMs / 86_400_000;
    if (diffDays <= 1) strongPresent.push('dob');
    else if (diffDays <= 365) {
      // within a year — check contradiction list
      const dobContradiction = contradiction.contradictions.some((c) => c.field === 'dateOfBirth');
      if (dobContradiction) strongConflicting.push('dob');
      else strongAbsent.push('dob');
    } else strongConflicting.push('dob');
  } else strongAbsent.push('dob');

  // Nationality
  if (subject.nationality && candidate.nationality) {
    if (subject.nationality.toUpperCase() === candidate.nationality.toUpperCase()) {
      strongPresent.push('nationality');
    } else strongConflicting.push('nationality');
  } else strongAbsent.push('nationality');

  // Identifiers
  const subjIds = new Map((subject.identifiers ?? []).map((i) => [i.kind, i.number.replace(/\s+/g, '')]));
  for (const ci of candidate.identifiers ?? []) {
    const sNum = subjIds.get(ci.kind);
    const cNum = ci.number.replace(/\s+/g, '');
    if (sNum === cNum) {
      strongPresent.push('passport_number');
    } else if (sNum) {
      strongConflicting.push('passport_number');
    }
  }

  if (subject.identifiers?.length === 0 && candidate.identifiers?.length === 0) {
    strongAbsent.push('passport_number');
  }

  // Address country overlap
  const sCountries = new Set((subject.addresses ?? []).map((a) => a.country?.toUpperCase()).filter(Boolean));
  const cCountries = new Set((candidate.addresses ?? []).map((a) => a.country?.toUpperCase()).filter(Boolean));
  if (sCountries.size > 0 && cCountries.size > 0) {
    const overlap = [...sCountries].some((c) => cCountries.has(c));
    if (overlap) strongPresent.push('registered_address');
    else strongConflicting.push('registered_address');
  } else strongAbsent.push('registered_address');

  // Contextual: programs / sanctions lists
  const contextualPresent: DisambiguatorState['contextual']['present'] = [];
  const contextualAbsent: DisambiguatorState['contextual']['absent'] = [];
  if (subject.programs?.length && candidate.programs?.length) {
    const overlap = subject.programs.some((p) => (candidate.programs ?? []).includes(p));
    if (overlap) contextualPresent.push('listed_alias');
    else contextualAbsent.push('listed_alias');
  }

  return {
    strong: { present: strongPresent, absent: strongAbsent, conflicting: strongConflicting },
    contextual: { present: contextualPresent, absent: contextualAbsent },
    commonName: subject.commonName ?? false,
    transliterated: false,
    nativeScriptCorroborated: false,
  };
}

// ── Main Pipeline ─────────────────────────────────────────────────────────────

export function runEntityResolutionPipeline(
  subject: PipelineSubject,
  candidates: PipelineSubject[],
  contextInput?: Partial<ContextualInput>,
): PipelineResult {
  const t0 = Date.now();

  const { variants: subjectVariants, trace: normTrace } = buildVariantSet(subject);

  const subjectPerms = subjectVariants.flatMap((v) => tokenPermutations(v));
  const permTrace: StageTrace = {
    stage: 'token_permutation',
    input: subject.name,
    output: [...new Set(subjectPerms)],
    notes: [`${subjectPerms.length} permutations generated`],
  };

  const matches: PipelineMatch[] = [];

  for (const candidate of candidates) {
    const stageTrace: StageTrace[] = [...normTrace, permTrace];

    const { variants: candidateVariants } = buildVariantSet(candidate);
    const candidatePerms = candidateVariants.flatMap((v) => tokenPermutations(v));

    // Stage 4: Fuzzy scoring
    const { best: ensembleMatch, bestSubject, bestCandidate } = bestFuzzyScore(
      [...new Set(subjectPerms)],
      [...new Set(candidatePerms)],
    );

    const fuzzyScore = ensembleMatch?.best.score ?? 0;

    stageTrace.push({
      stage: 'fuzzy_scoring',
      input: `${subject.name} ↔ ${candidate.name}`,
      output: [bestSubject, bestCandidate],
      score: fuzzyScore,
      notes: [
        `Method: ${ensembleMatch?.best.method ?? 'none'}`,
        `Phonetic agreement: ${ensembleMatch?.phoneticAgreement ? 'yes' : 'no'}`,
        `Cross-phonetic: ${phoneticMatch(subject.name, candidate.name) ? 'yes' : 'no'}`,
      ],
    });

    // Skip very low-scoring candidates early
    if (fuzzyScore < 0.6) continue;

    // Stage 5: Contextual scoring
    const ctxInput: ContextualInput = {
      entityType: subject.entityType,
      jurisdiction: subject.nationality ?? candidate.nationality,
      sanctionsList: candidate.programs?.[0],
      dataCompleteness: Math.min(
        1,
        ((subject.identifiers?.length ?? 0) +
          (subject.dateOfBirth ? 1 : 0) +
          (subject.nationality ? 1 : 0)) / 3,
      ),
      ...contextInput,
    };

    const ctx = scoreContextual(fuzzyScore, ctxInput);

    stageTrace.push({
      stage: 'contextual_scoring',
      input: `raw=${fuzzyScore.toFixed(3)}`,
      output: [`adjusted=${ctx.adjustedScore.toFixed(3)}`],
      score: ctx.adjustedScore,
      notes: [...ctx.boosters.map((b) => `+ ${b}`), ...ctx.penalties.map((p) => `- ${p}`)],
    });

    // Stage 6: Contradiction analysis
    const contradiction = analyzeContradictions(
      {
        name: subject.name,
        dateOfBirth: subject.dateOfBirth,
        nationality: subject.nationality,
        identifiers: subject.identifiers ?? [],
        addresses: subject.addresses ?? [],
      },
      {
        name: candidate.name,
        dateOfBirth: candidate.dateOfBirth,
        nationality: candidate.nationality,
        identifiers: candidate.identifiers ?? [],
        addresses: candidate.addresses ?? [],
      },
    );

    stageTrace.push({
      stage: 'contradiction_analysis',
      input: `${subject.name} ↔ ${candidate.name}`,
      output: contradiction.contradictions.map((c) => `${c.field}: ${c.reason}`),
      notes: [
        `Confidence penalty: -${(contradiction.confidencePenalty * 100).toFixed(0)}%`,
        `Requires manual review: ${contradiction.requiresManualReview ? 'YES' : 'no'}`,
      ],
    });

    // Stage 7: Confidence calibration
    const disambig = buildDisambiguatorState(subject, candidate, contradiction);

    stageTrace.push({
      stage: 'confidence_calibration',
      input: `score=${ctx.adjustedScore.toFixed(3)}`,
      output: [],
      notes: [
        `Strong present: ${disambig.strong.present.join(', ') || 'none'}`,
        `Strong conflicting: ${disambig.strong.conflicting.join(', ') || 'none'}`,
      ],
    });

    // Apply contradiction penalty to final score
    const penalizedScore = Math.max(0, ctx.adjustedScore - contradiction.confidencePenalty);

    const cal = calibrateConfidence(
      {
        subject: bestSubject,
        candidate: bestCandidate,
        scores: ensembleMatch?.scores ?? [],
        best: { ...(ensembleMatch?.best ?? { method: 'exact', score: penalizedScore, threshold: 0, pass: true }), score: penalizedScore },
        phoneticAgreement: ensembleMatch?.phoneticAgreement ?? false,
      } as Parameters<typeof calibrateConfidence>[0],
      disambig,
    );

    const lastStage = stageTrace[stageTrace.length - 1];
    if (lastStage) { lastStage.output = [cal.level]; lastStage.score = penalizedScore; }

    const manualReviewReasons: string[] = [];
    if (contradiction.requiresManualReview) {
      manualReviewReasons.push(...contradiction.contradictions.map((c) => c.reason));
    }
    if (cal.level === 'POSSIBLE' && penalizedScore >= 0.75) {
      manualReviewReasons.push('Score borderline but capped by missing identifiers');
    }

    const rationale = [
      `Fuzzy: ${ensembleMatch?.best.method}=${fuzzyScore.toFixed(3)}.`,
      `Contextual adjusted: ${ctx.adjustedScore.toFixed(3)}.`,
      `Contradictions: ${contradiction.contradictions.length}.`,
      `Final score: ${penalizedScore.toFixed(3)}.`,
      cal.rationale,
    ].join(' ');

    matches.push({
      candidateId: candidate.id,
      candidateName: candidate.name,
      bestSubjectVariant: bestSubject,
      bestCandidateVariant: bestCandidate,
      ensembleMatch: ensembleMatch ?? matchEnsemble('', ''),
      contextualScore: ctx.adjustedScore,
      contextualBoosters: ctx.boosters,
      contextualPenalties: ctx.penalties,
      contradiction,
      confidence: cal.level,
      finalScore: penalizedScore,
      stageTrace,
      rationale,
      requiresManualReview: manualReviewReasons.length > 0,
      manualReviewReasons,
    });
  }

  // Sort by final score descending
  matches.sort((a, b) => b.finalScore - a.finalScore);

  return {
    subjectId: subject.id,
    subjectName: subject.name,
    candidatesEvaluated: candidates.length,
    matches,
    topMatch: matches[0] ?? null,
    pipelineDurationMs: Date.now() - t0,
    stages: [
      'normalization',
      'transliteration',
      'alias_expansion',
      'token_permutation',
      'fuzzy_scoring',
      'contextual_scoring',
      'contradiction_analysis',
      'confidence_calibration',
    ],
  };
}
