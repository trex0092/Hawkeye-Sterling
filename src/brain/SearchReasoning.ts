// Hawkeye Sterling — search explainability engine.
// Produces human-readable reasoning for why an entity matched a query,
// which tokens contributed to the score, and the confidence breakdown.
// Required by regulators to audit why a hit was or was not returned.

import type { ResolutionResult } from './entity-resolution.js';

// ── Token-level explanation ───────────────────────────────────────────────────

export type TokenMatchType =
  | 'exact'           // identical after normalisation
  | 'phonetic'        // phonetic equivalence (Soundex/Cologne)
  | 'fuzzy'           // edit-distance match
  | 'transliteration' // script conversion match (Arabic→Latin)
  | 'alias'           // matched via known alias
  | 'token_reorder'   // same tokens in different order
  | 'partial'         // substring match
  | 'no_match';

export interface TokenMatch {
  queryToken: string;
  candidateToken: string;
  matchType: TokenMatchType;
  similarity: number;    // 0..1
  contribution: number;  // fractional contribution to final score
  isKeyToken: boolean;   // surname/entity name is key
}

// ── Field-level explanation ───────────────────────────────────────────────────

export type MatchedField =
  | 'primary_name'
  | 'alias'
  | 'dob'
  | 'nationality'
  | 'passport'
  | 'national_id'
  | 'address'
  | 'gender'
  | 'entity_type';

export interface FieldExplanation {
  field: MatchedField;
  queryValue: string;
  candidateValue: string;
  matched: boolean;
  matchType: TokenMatchType;
  weight: number;         // weight of this field in scoring
  weightedScore: number;  // matched ? similarity * weight : 0
  tokens?: TokenMatch[];  // for name fields
}

// ── Confidence pathway ────────────────────────────────────────────────────────

export interface ConfidenceStep {
  step: string;
  before: number;
  after: number;
  delta: number;
  reason: string;
}

// ── Search reasoning result ───────────────────────────────────────────────────

export interface SearchReasoning {
  queryId: string;
  query: string;
  candidateId: string;
  candidateName: string;
  finalScore: number;
  confidenceLabel: string;
  fieldExplanations: FieldExplanation[];
  tokenMatches: TokenMatch[];
  confidencePathway: ConfidenceStep[];
  whyMatched: string[];       // plain-language bullets for the MLRO
  whyNotHigher: string[];     // why confidence is not STRONG/EXACT
  keyEvidenceTokens: string[]; // tokens that drove the match
  contradictions: string[];    // field contradictions detected
  recommendedAction: string;
  generatedAt: string;
}

// ── Query tokeniser ───────────────────────────────────────────────────────────

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(''));
  const setB = new Set(b.split(''));
  const intersection = [...setA].filter((c) => setB.has(c)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function levenshteinSim(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0 || n === 0) return 0;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return 1 - (dp[m]![n]! / Math.max(m, n));
}

// ── Token match classifier ────────────────────────────────────────────────────

function classifyTokenMatch(
  qt: string,
  ct: string,
): { matchType: TokenMatchType; similarity: number } {
  if (qt === ct) return { matchType: 'exact', similarity: 1.0 };

  // Check for partial / substring
  if (ct.includes(qt) || qt.includes(ct)) {
    const sim = Math.min(qt.length, ct.length) / Math.max(qt.length, ct.length);
    return { matchType: 'partial', similarity: sim };
  }

  const lev = levenshteinSim(qt, ct);
  if (lev >= 0.85) return { matchType: 'fuzzy', similarity: lev };
  if (lev >= 0.70) return { matchType: 'fuzzy', similarity: lev };

  const jac = jaccardSimilarity(qt, ct);
  if (jac >= 0.60) return { matchType: 'fuzzy', similarity: jac };

  return { matchType: 'no_match', similarity: 0 };
}

// ── Name token alignment ──────────────────────────────────────────────────────

function alignTokens(queryName: string, candidateName: string): TokenMatch[] {
  const qTokens = tokenise(queryName);
  const cTokens = tokenise(candidateName);
  const results: TokenMatch[] = [];
  const usedC = new Set<number>();

  for (const qt of qTokens) {
    let bestIdx = -1;
    let bestSim = 0;
    let bestType: TokenMatchType = 'no_match';

    for (let ci = 0; ci < cTokens.length; ci++) {
      if (usedC.has(ci)) continue;
      const { matchType, similarity } = classifyTokenMatch(qt, cTokens[ci]!);
      if (similarity > bestSim) {
        bestSim = similarity;
        bestIdx = ci;
        bestType = matchType;
      }
    }

    if (bestIdx >= 0 && bestSim > 0.5) {
      usedC.add(bestIdx);
    }

    const isKeyToken = qt === qTokens[qTokens.length - 1] || qTokens.length === 1;
    const contribution = isKeyToken ? 0.6 / qTokens.length : 0.4 / qTokens.length;

    results.push({
      queryToken: qt,
      candidateToken: bestIdx >= 0 ? cTokens[bestIdx]! : '—',
      matchType: bestType,
      similarity: bestSim,
      contribution: bestSim > 0 ? contribution * bestSim : 0,
      isKeyToken,
    });
  }

  return results;
}

// ── Confidence label ──────────────────────────────────────────────────────────

function labelConfidence(score: number): string {
  if (score >= 0.95) return 'EXACT';
  if (score >= 0.85) return 'STRONG';
  if (score >= 0.70) return 'PROBABLE';
  if (score >= 0.55) return 'POSSIBLE';
  return 'WEAK';
}

// ── Plain-language generation ─────────────────────────────────────────────────

function buildWhyMatched(fields: FieldExplanation[], tokens: TokenMatch[]): string[] {
  const bullets: string[] = [];

  const exactName = tokens.filter((t) => t.matchType === 'exact' && t.isKeyToken);
  if (exactName.length > 0) {
    bullets.push(`Key name token(s) matched exactly: "${exactName.map((t) => t.queryToken).join('", "')}"`);
  }

  const fuzzyName = tokens.filter((t) => t.matchType === 'fuzzy' && t.isKeyToken);
  if (fuzzyName.length > 0) {
    bullets.push(`Key name token(s) matched with high similarity (fuzzy): "${fuzzyName.map((t) => `${t.queryToken}→${t.candidateToken}`).join('", "')}"`);
  }

  for (const f of fields) {
    if (f.matched && f.field !== 'primary_name') {
      bullets.push(`${f.field.replace(/_/g, ' ')} matched: "${f.queryValue}" ≈ "${f.candidateValue}"`);
    }
  }

  return bullets.length > 0 ? bullets : ['Score meets minimum threshold based on composite fuzzy matching'];
}

function buildWhyNotHigher(
  score: number,
  fields: FieldExplanation[],
  tokens: TokenMatch[],
): string[] {
  const reasons: string[] = [];

  const unmatchedFields = fields.filter((f) => !f.matched && f.weight > 0.1);
  for (const f of unmatchedFields) {
    reasons.push(`${f.field.replace(/_/g, ' ')} not matched (weight: ${(f.weight * 100).toFixed(0)}%)`);
  }

  const noMatchTokens = tokens.filter((t) => t.matchType === 'no_match');
  if (noMatchTokens.length > 0) {
    reasons.push(`${noMatchTokens.length} name token(s) could not be aligned: "${noMatchTokens.map((t) => t.queryToken).join('", "')}"`);
  }

  if (score < 0.85) reasons.push('Score below STRONG threshold — corroboration from identifiers recommended');
  if (score < 0.70) reasons.push('Score below PROBABLE threshold — manual review required before escalation');

  return reasons;
}

// ── Main reasoning builder ────────────────────────────────────────────────────

export interface SearchReasoningInput {
  queryId: string;
  query: string;
  candidateId: string;
  candidateName: string;
  candidateAliases?: string[];
  finalScore: number;
  nameScore?: number;
  dobMatch?: { queryDob?: string; candidateDob?: string; matched: boolean };
  nationalityMatch?: { queryNat?: string; candidateNat?: string; matched: boolean };
  identifierMatch?: { type: string; queryVal: string; candidateVal: string; matched: boolean }[];
  contradictions?: string[];
  confidencePathwaySteps?: ConfidenceStep[];
}

let _qCounter = 0;

export function buildSearchReasoning(input: SearchReasoningInput): SearchReasoning {
  _qCounter++;
  const queryId = input.queryId || `SRQ-${Date.now().toString(36).toUpperCase()}-${String(_qCounter).padStart(4, '0')}`;

  // Token-level alignment on primary name
  const tokens = alignTokens(input.query, input.candidateName);

  // Also try aliases if primary name tokens are weak
  const nameSim = tokens.reduce((s, t) => s + t.contribution, 0);
  if (nameSim < 0.5 && input.candidateAliases) {
    for (const alias of input.candidateAliases) {
      const aliasTokens = alignTokens(input.query, alias);
      const aliasSim = aliasTokens.reduce((s, t) => s + t.contribution, 0);
      if (aliasSim > nameSim) {
        // Mark alias tokens as alias match type
        for (const t of aliasTokens) {
          if (t.matchType !== 'no_match') t.matchType = 'alias';
        }
        tokens.splice(0, tokens.length, ...aliasTokens);
        break;
      }
    }
  }

  // Field explanations
  const fieldExplanations: FieldExplanation[] = [];

  fieldExplanations.push({
    field: 'primary_name',
    queryValue: input.query,
    candidateValue: input.candidateName,
    matched: (input.nameScore ?? input.finalScore) >= 0.6,
    matchType: tokens.find((t) => t.matchType !== 'no_match')?.matchType ?? 'no_match',
    weight: 0.60,
    weightedScore: (input.nameScore ?? input.finalScore) * 0.60,
    tokens,
  });

  if (input.dobMatch) {
    fieldExplanations.push({
      field: 'dob',
      queryValue: input.dobMatch.queryDob ?? 'N/A',
      candidateValue: input.dobMatch.candidateDob ?? 'N/A',
      matched: input.dobMatch.matched,
      matchType: input.dobMatch.matched ? 'exact' : 'no_match',
      weight: 0.15,
      weightedScore: input.dobMatch.matched ? 0.15 : 0,
    });
  }

  if (input.nationalityMatch) {
    fieldExplanations.push({
      field: 'nationality',
      queryValue: input.nationalityMatch.queryNat ?? 'N/A',
      candidateValue: input.nationalityMatch.candidateNat ?? 'N/A',
      matched: input.nationalityMatch.matched,
      matchType: input.nationalityMatch.matched ? 'exact' : 'no_match',
      weight: 0.10,
      weightedScore: input.nationalityMatch.matched ? 0.10 : 0,
    });
  }

  for (const idMatch of (input.identifierMatch ?? [])) {
    fieldExplanations.push({
      field: idMatch.type === 'passport' ? 'passport' : 'national_id',
      queryValue: idMatch.queryVal,
      candidateValue: idMatch.candidateVal,
      matched: idMatch.matched,
      matchType: idMatch.matched ? 'exact' : 'no_match',
      weight: 0.20,
      weightedScore: idMatch.matched ? 0.20 : 0,
    });
  }

  // Confidence pathway
  const pathway: ConfidenceStep[] = input.confidencePathwaySteps ?? [];
  if (pathway.length === 0) {
    let running = input.nameScore ?? input.finalScore;
    pathway.push({
      step: 'name_matching',
      before: 0,
      after: running,
      delta: running,
      reason: 'Base name similarity score',
    });
    if (input.dobMatch?.matched) {
      const before = running;
      running = Math.min(1, running + 0.08);
      pathway.push({ step: 'dob_boost', before, after: running, delta: running - before, reason: 'DOB corroboration' });
    }
    if (input.nationalityMatch?.matched) {
      const before = running;
      running = Math.min(1, running + 0.05);
      pathway.push({ step: 'nationality_boost', before, after: running, delta: running - before, reason: 'Nationality corroboration' });
    }
    if ((input.identifierMatch ?? []).some((m) => m.matched)) {
      const before = running;
      running = Math.min(1, running + 0.12);
      pathway.push({ step: 'identifier_boost', before, after: running, delta: running - before, reason: 'Identifier corroboration' });
    }
  }

  const keyEvidenceTokens = tokens
    .filter((t) => t.matchType !== 'no_match' && t.isKeyToken)
    .map((t) => t.queryToken);

  const whyMatched = buildWhyMatched(fieldExplanations, tokens);
  const whyNotHigher = buildWhyNotHigher(input.finalScore, fieldExplanations, tokens);

  // Recommended action
  const label = labelConfidence(input.finalScore);
  const recommendedAction =
    label === 'EXACT' ? 'Confirmed match — proceed to case creation and escalate per risk tier' :
    label === 'STRONG' ? 'High-confidence match — manual review recommended before escalation' :
    label === 'PROBABLE' ? 'Analyst review required — corroborate with additional identifiers' :
    label === 'POSSIBLE' ? 'Low-confidence — request additional customer data before conclusion' :
    'Below threshold — log and dismiss unless additional context available';

  return {
    queryId,
    query: input.query,
    candidateId: input.candidateId,
    candidateName: input.candidateName,
    finalScore: input.finalScore,
    confidenceLabel: label,
    fieldExplanations,
    tokenMatches: tokens,
    confidencePathway: pathway,
    whyMatched,
    whyNotHigher,
    keyEvidenceTokens,
    contradictions: input.contradictions ?? [],
    recommendedAction,
    generatedAt: new Date().toISOString(),
  };
}

// ── Markdown formatter ────────────────────────────────────────────────────────

export function formatReasoningMarkdown(r: SearchReasoning): string {
  const lines: string[] = [
    `## Search Reasoning — ${r.queryId}`,
    ``,
    `**Query:** "${r.query}"  **Candidate:** ${r.candidateName} (${r.candidateId})`,
    `**Score:** ${(r.finalScore * 100).toFixed(1)}%  **Confidence:** ${r.confidenceLabel}`,
    ``,
    `### Why Matched`,
    ...r.whyMatched.map((b) => `- ${b}`),
    ``,
  ];

  if (r.whyNotHigher.length > 0) {
    lines.push(`### Why Not Higher Confidence`);
    lines.push(...r.whyNotHigher.map((b) => `- ${b}`));
    lines.push('');
  }

  lines.push(`### Token Alignment`);
  lines.push(`| Query Token | Candidate Token | Match Type | Similarity | Key? |`);
  lines.push(`|---|---|---|---|---|`);
  for (const t of r.tokenMatches) {
    lines.push(`| ${t.queryToken} | ${t.candidateToken} | ${t.matchType} | ${(t.similarity * 100).toFixed(0)}% | ${t.isKeyToken ? 'Yes' : 'No'} |`);
  }
  lines.push('');

  lines.push(`### Confidence Pathway`);
  for (const step of r.confidencePathway) {
    const sign = step.delta >= 0 ? '+' : '';
    lines.push(`- **${step.step}**: ${(step.before * 100).toFixed(1)}% → ${(step.after * 100).toFixed(1)}% (${sign}${(step.delta * 100).toFixed(1)}%) — ${step.reason}`);
  }
  lines.push('');

  if (r.contradictions.length > 0) {
    lines.push(`### Contradictions`);
    lines.push(...r.contradictions.map((c) => `- ${c}`));
    lines.push('');
  }

  lines.push(`### Recommended Action`);
  lines.push(r.recommendedAction);

  return lines.join('\n');
}

// ── Single-pair reasoning from a ResolutionResult ────────────────────────────

export function reasonResolutionResult(
  query: string,
  candidateId: string,
  candidateName: string,
  result: ResolutionResult,
): SearchReasoning {
  return buildSearchReasoning({
    queryId: `${query.replace(/\s+/g, '_').toUpperCase()}-RES`,
    query,
    candidateId,
    candidateName,
    finalScore: result.score,
    contradictions: result.disagreements,
  });
}
