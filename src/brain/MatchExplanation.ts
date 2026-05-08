// Hawkeye Sterling — match confidence explainability.
// Every sanctions/watchlist hit must explain:
//   - WHY it matched (which algorithms, which fields, which variants)
//   - WHY it's not exact (what would be needed for higher confidence)
//   - WHICH fields matched (name, DOB, nationality, identifiers)
//   - WHICH fields contradicted (DOB mismatch, conflicting ID)
//   - A plain-language rationale suitable for MLRO review
//
// This is a regulatory requirement under FATF R.10 (record-keeping)
// and forms part of the evidence pack attached to every STR/SAR.

import type { MatchConfidenceLevel } from '../policy/systemPrompt.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type MatchFieldType =
  | 'name_exact'
  | 'name_fuzzy'
  | 'name_phonetic'
  | 'name_transliterated'
  | 'name_alias'
  | 'name_token_permutation'
  | 'dob_exact'
  | 'dob_approximate'
  | 'nationality'
  | 'passport_number'
  | 'national_id'
  | 'registration_number'
  | 'address_country'
  | 'address_full'
  | 'sanctions_program'
  | 'entity_type';

export interface MatchedField {
  fieldType: MatchFieldType;
  subjectValue: string;
  candidateValue: string;
  matchMethod: string;         // algorithm name
  score: number;               // 0..1
  isExact: boolean;
  notes?: string;
}

export interface ContradictedField {
  fieldType: MatchFieldType;
  subjectValue: string;
  candidateValue: string;
  contradictionType: 'mismatch' | 'impossible_timeline' | 'conflicting_document';
  confidenceImpact: number;    // negative — how much confidence is reduced
  notes: string;
}

export interface MatchExplanation {
  // ── Hit summary ──────────────────────────────────────────────────────────
  matchId: string;
  subjectName: string;
  candidateName: string;
  candidateId: string;
  sourceList: string;
  programs: string[];
  confidence: MatchConfidenceLevel;
  finalScore: number;

  // ── Field-level evidence ──────────────────────────────────────────────────
  matchedFields: MatchedField[];
  contradictedFields: ContradictedField[];

  // ── Why not exact ────────────────────────────────────────────────────────
  whyNotExact: string[];       // list of what would be needed to reach EXACT
  whyNotStrong: string[];      // list of what would be needed to reach STRONG

  // ── Plain-language rationale ──────────────────────────────────────────────
  rationale: string;           // MLRO-grade one-paragraph summary
  analyticalBasis: string;     // which algorithms and data sources were used
  limitations: string[];       // known gaps / caveats

  // ── Regulator trail ───────────────────────────────────────────────────────
  screeningVersion: string;
  sanctionsListVersion: string;
  rulesetVersion: string;
  evidenceHash: string;        // deterministic hash of this explanation record
  generatedAt: string;
}

// ── Confidence level requirements ─────────────────────────────────────────────

const CONFIDENCE_REQUIREMENTS: Record<MatchConfidenceLevel, { requires: string[]; description: string }> = {
  EXACT: {
    requires: ['name_exact or near-exact match', 'at least two strong identifiers (DOB + passport or national ID)'],
    description: 'Definitive match — same entity beyond reasonable doubt',
  },
  STRONG: {
    requires: ['name score ≥ 0.90', 'at least one strong identifier (DOB or passport)'],
    description: 'Very likely the same entity — single identifier corroborates name',
  },
  POSSIBLE: {
    requires: ['name score ≥ 0.82', 'contextual corroboration (nationality, address, or alias)'],
    description: 'Possible match — manual review required before disposition',
  },
  WEAK: {
    requires: ['name score ≥ 0.70', 'some contextual alignment'],
    description: 'Weak match — insufficient evidence for disposition without further investigation',
  },
  NO_MATCH: {
    requires: [],
    description: 'Below threshold — not the same entity based on available evidence',
  },
};

// ── Evidence hash ─────────────────────────────────────────────────────────────

function buildEvidenceHash(explanation: Omit<MatchExplanation, 'evidenceHash'>): string {
  const key = [
    explanation.matchId,
    explanation.subjectName,
    explanation.candidateId,
    explanation.confidence,
    explanation.finalScore.toFixed(4),
    explanation.matchedFields.map((f) => `${f.fieldType}:${f.score.toFixed(3)}`).join('|'),
    explanation.contradictedFields.map((f) => f.fieldType).join('|'),
    explanation.generatedAt,
  ].join('::');

  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ── Rationale builder ─────────────────────────────────────────────────────────

function buildRationale(
  subjectName: string,
  candidateName: string,
  confidence: MatchConfidenceLevel,
  matchedFields: MatchedField[],
  contradictedFields: ContradictedField[],
  programs: string[],
  sourceList: string,
): string {
  const confDesc = CONFIDENCE_REQUIREMENTS[confidence]?.description ?? confidence;
  const primaryMatch = matchedFields.find((f) => f.fieldType.startsWith('name'));
  const idMatches = matchedFields.filter((f) =>
    ['passport_number', 'national_id', 'dob_exact'].includes(f.fieldType)
  );
  const contradictions = contradictedFields.length > 0
    ? ` However, ${contradictedFields.length} contradiction(s) were detected (${contradictedFields.map((c) => c.fieldType).join(', ')}), which reduce confidence.`
    : '';

  const progText = programs.length > 0 ? ` under program(s) ${programs.join(', ')}` : '';

  const basis = primaryMatch
    ? `The subject "${subjectName}" was matched against the ${sourceList} entry "${candidateName}"${progText}. ` +
      `Best name match: ${primaryMatch.matchMethod} (score ${(primaryMatch.score * 100).toFixed(0)}%). ` +
      (idMatches.length > 0
        ? `Corroborating identifiers: ${idMatches.map((i) => i.fieldType).join(', ')}. `
        : 'No corroborating identifiers were available. ')
    : `Name match between "${subjectName}" and "${candidateName}" scored below primary threshold. `;

  return `${basis}Confidence assessment: ${confDesc}.${contradictions} ` +
    `${CONFIDENCE_REQUIREMENTS[confidence]?.description ?? ''}`;
}

// ── Explanation builder ───────────────────────────────────────────────────────

export interface BuildExplanationInput {
  matchId?: string;
  subjectName: string;
  candidateName: string;
  candidateId: string;
  sourceList: string;
  programs: string[];
  confidence: MatchConfidenceLevel;
  finalScore: number;
  matchedFields: MatchedField[];
  contradictedFields: ContradictedField[];
  screeningVersion?: string;
  sanctionsListVersion?: string;
  rulesetVersion?: string;
}

export function buildMatchExplanation(input: BuildExplanationInput): MatchExplanation {
  const generatedAt = new Date().toISOString();
  const matchId = input.matchId ?? `MATCH-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  // Determine what's missing for higher confidence
  const whyNotExact: string[] = [];
  const whyNotStrong: string[] = [];

  const hasExactName = input.matchedFields.some((f) => f.fieldType === 'name_exact');
  const hasDob = input.matchedFields.some((f) => f.fieldType.startsWith('dob'));
  const hasPassport = input.matchedFields.some((f) => f.fieldType === 'passport_number');
  const hasNationalId = input.matchedFields.some((f) => f.fieldType === 'national_id');
  const hasNationality = input.matchedFields.some((f) => f.fieldType === 'nationality');

  if (input.confidence !== 'EXACT') {
    if (!hasExactName) whyNotExact.push('Exact name match required (score = 1.00)');
    if (!hasDob) whyNotExact.push('Date of birth not present or not matching');
    if (!hasPassport && !hasNationalId) whyNotExact.push('At least two strong identifiers required (passport, national ID, etc.)');
    if (input.contradictedFields.length > 0) whyNotExact.push(`Resolve ${input.contradictedFields.length} contradiction(s)`);
  }

  if (input.confidence !== 'EXACT' && input.confidence !== 'STRONG') {
    if (!hasDob && !hasPassport) whyNotStrong.push('Provide date of birth or passport number to corroborate name match');
    if (!hasNationality) whyNotStrong.push('Subject nationality not available for comparison');
    if (input.finalScore < 0.90) whyNotStrong.push(`Name match score (${(input.finalScore * 100).toFixed(0)}%) below STRONG threshold (90%)`);
  }

  const limitations: string[] = [];
  if (!hasExactName) limitations.push('Name match relied on fuzzy/phonetic algorithms — false-positive risk from homonyms');
  if (input.matchedFields.length === 0) limitations.push('No corroborating fields beyond name — disposition requires manual investigation');
  if (input.contradictedFields.length > 0) limitations.push('Contradicted fields present — manual review mandatory');
  limitations.push('Screening reflects data available at time of query — re-screen when new data is available');

  const analyticalBasis = [
    `Algorithms used: ${[...new Set(input.matchedFields.map((f) => f.matchMethod))].join(', ')}`,
    `Fields assessed: ${input.matchedFields.length} matched, ${input.contradictedFields.length} contradicted`,
    `Source list: ${input.sourceList}`,
  ].join('. ');

  const rationale = buildRationale(
    input.subjectName,
    input.candidateName,
    input.confidence,
    input.matchedFields,
    input.contradictedFields,
    input.programs,
    input.sourceList,
  );

  const base = {
    matchId,
    subjectName: input.subjectName,
    candidateName: input.candidateName,
    candidateId: input.candidateId,
    sourceList: input.sourceList,
    programs: input.programs,
    confidence: input.confidence,
    finalScore: input.finalScore,
    matchedFields: input.matchedFields,
    contradictedFields: input.contradictedFields,
    whyNotExact,
    whyNotStrong,
    rationale,
    analyticalBasis,
    limitations,
    screeningVersion: input.screeningVersion ?? '2025.1',
    sanctionsListVersion: input.sanctionsListVersion ?? 'latest',
    rulesetVersion: input.rulesetVersion ?? '2025.1',
    generatedAt,
  };

  return {
    ...base,
    evidenceHash: buildEvidenceHash(base),
  };
}

// ── Batch explanation builder ─────────────────────────────────────────────────

export function buildMatchExplanations(inputs: BuildExplanationInput[]): MatchExplanation[] {
  return inputs.map((input) => buildMatchExplanation(input));
}

// ── Markdown formatter (for reports) ─────────────────────────────────────────

export function formatExplanationMarkdown(e: MatchExplanation): string {
  const lines: string[] = [
    `## Match Explanation — ${e.confidence}`,
    `**Subject:** ${e.subjectName}  `,
    `**Candidate:** ${e.candidateName} (${e.candidateId})  `,
    `**List:** ${e.sourceList} | **Programs:** ${e.programs.join(', ') || 'none'}  `,
    `**Score:** ${(e.finalScore * 100).toFixed(1)}% | **Generated:** ${e.generatedAt}  `,
    '',
    `### Rationale`,
    e.rationale,
    '',
    `### Matched Fields`,
    ...e.matchedFields.map((f) => `- **${f.fieldType}**: ${f.subjectValue} ↔ ${f.candidateValue} (${f.matchMethod}, ${(f.score * 100).toFixed(0)}%)`),
    '',
  ];

  if (e.contradictedFields.length > 0) {
    lines.push(`### Contradictions`);
    lines.push(...e.contradictedFields.map((f) => `- **${f.fieldType}**: ${f.notes}`));
    lines.push('');
  }

  if (e.whyNotExact.length > 0) {
    lines.push(`### What Would Raise Confidence to EXACT`);
    lines.push(...e.whyNotExact.map((w) => `- ${w}`));
    lines.push('');
  }

  lines.push(`### Limitations`);
  lines.push(...e.limitations.map((l) => `- ${l}`));
  lines.push('');
  lines.push(`*Evidence hash: ${e.evidenceHash} | Screening version: ${e.screeningVersion}*`);

  return lines.join('\n');
}
