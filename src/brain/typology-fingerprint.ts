// Hawkeye Sterling — typology fingerprint generator (audit follow-up #24).
//
// Produces a compact deterministic signature for a screening verdict
// that can be compared across cases to surface "this case shares the
// pattern of case-2024-1247". Cross-case pattern detection without a
// vector DB — just a sparse feature vector + cosine similarity.
//
// Feature buckets (each in [0,1]):
//   · regimeMix         — how many authoritative lists fired, what mix
//   · pepProfile        — PEP tier × type density
//   · adverseMediaMix   — FATF predicate categories tripped
//   · uboOpacity        — nominee + bearer + depth + unresolved
//   · transactionShape  — channel mix + threshold-band density
//   · jurisdictionRisk  — CAHRA + secrecy + stale snapshot
//   · redlineSeverity   — number + severity of fired redlines
//   · typologyHits      — FATF typology IDs hit
//
// The fingerprint is a Float32Array(48) — 6 features × 8 buckets each.
// Cosine similarity over fingerprints exposes case clusters at the
// human-pattern level (e.g. all "structuring + DPMS + CAHRA" cases).

export interface TypologyFingerprint {
  caseId: string;
  computedAt: string;
  vector: number[];          // length 48; values ∈ [0,1]
  bands: {
    regime: number;
    pep: number;
    adverseMedia: number;
    ubo: number;
    transaction: number;
    jurisdiction: number;
    redline: number;
    typology: number;
  };
  // Mode ids that materially contributed (top-K, sorted by weight).
  contributors: string[];
}

interface VerdictLike {
  caseId?: string;
  outcome?: string;
  aggregateScore?: number;
  posterior?: number;
  findings?: Array<{ modeId: string; score: number; category?: string; weight?: number }>;
  conflicts?: unknown[];
  evidenceCorroboration?: { score?: number; independentSources?: number; trainingDataPenalty?: number };
  crossRegimeConflict?: { unanimousDesignated?: boolean; split?: boolean; partialMatchRegimes?: string[] };
}

interface SuperBrainLike {
  jurisdiction?: { cahra?: boolean; regimes?: string[] };
  pep?: { salience?: number; tier?: string; type?: string } | null;
  adverseMediaScored?: { categoriesTripped?: string[]; compositeScore?: number } | null;
  redlines?: { fired?: Array<{ id?: string; severity?: string }> };
  typologies?: { hits?: Array<{ id?: string; family?: string; weight?: number }> };
  composite?: { breakdown?: Record<string, number> };
}

const VECTOR_LEN = 48;

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

function band8(values: number[]): number[] {
  const out = new Array<number>(8).fill(0);
  for (const v of values) {
    const idx = Math.min(7, Math.max(0, Math.floor(v * 8)));
    out[idx] = (out[idx] ?? 0) + 1;
  }
  const max = Math.max(1, ...out);
  return out.map((x) => x / max);
}

function regimeMixBucket(sb: SuperBrainLike, v: VerdictLike): number[] {
  const regimes = sb.jurisdiction?.regimes ?? [];
  const fired = v.crossRegimeConflict?.partialMatchRegimes?.length ?? 0;
  const unanimous = v.crossRegimeConflict?.unanimousDesignated ? 1 : 0;
  const split = v.crossRegimeConflict?.split ? 1 : 0;
  return band8([
    Math.min(1, regimes.length / 6),
    Math.min(1, fired / 6),
    unanimous,
    split,
    Math.min(1, regimes.length / 12),
    fired ? 0.7 : 0,
    unanimous ? 1 : split ? 0.6 : 0,
    regimes.length === 0 ? 0 : 1,
  ]);
}

function pepBucket(sb: SuperBrainLike): number[] {
  const sal = sb.pep?.salience ?? 0;
  const tier = sb.pep?.tier ?? '';
  const type = sb.pep?.type ?? '';
  return band8([
    sal,
    tier === 'national' ? 1 : tier === 'supra_national' ? 0.9 : tier ? 0.5 : 0,
    type === 'state_leader' ? 1 : type === 'minister' ? 0.9 : type === 'senior_military' ? 0.85 : type ? 0.6 : 0,
    type === 'rca_family' ? 1 : type === 'rca_associate' ? 0.8 : 0,
    type === 'parliamentarian' ? 0.7 : 0,
    type === 'judiciary_supreme' || type === 'judiciary_senior' ? 0.85 : 0,
    type === 'soe_executive' || type === 'sovereign_wealth_executive' ? 0.8 : 0,
    type === 'former_pep' ? 0.5 : 0,
  ]);
}

function adverseMediaBucket(sb: SuperBrainLike): number[] {
  const cats = sb.adverseMediaScored?.categoriesTripped ?? [];
  const has = (c: string): number => (cats.includes(c) ? 1 : 0);
  return band8([
    has('terrorist_financing') * 1,
    has('proliferation_financing') * 1,
    has('sanctions_violations') * 0.95,
    has('corruption_organised_crime') * 0.85,
    has('ml_financial_crime') * 0.8,
    has('drug_trafficking') * 0.85,
    has('human_trafficking_modern_slavery') * 0.85,
    has('cybercrime') * 0.7,
  ]);
}

function uboBucket(v: VerdictLike): number[] {
  const ubo = v.findings?.find((f) => f.modeId === 'ubo_tree_walk');
  const score = ubo?.score ?? 0;
  return band8([
    score,
    score >= 0.5 ? 1 : 0,
    score >= 0.7 ? 1 : 0,
    score >= 0.25 ? 0.7 : 0,
    score === 0 ? 0 : 0.5,
    score >= 0.6 ? 0.9 : 0,
    score >= 0.4 ? 0.6 : 0,
    score >= 0.2 ? 0.4 : 0,
  ]);
}

function transactionBucket(v: VerdictLike): number[] {
  // Heuristic: scan finding modeIds for transaction-related modes.
  const txnModes = (v.findings ?? []).filter((f) =>
    ['velocity_analysis', 'cash_courier_ctn', 'mixer_forensics', 'structuring_detection'].includes(f.modeId),
  );
  const scores = txnModes.map((f) => f.score);
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
  return band8([
    maxScore,
    txnModes.length > 0 ? 1 : 0,
    txnModes.find((f) => f.modeId === 'mixer_forensics')?.score ?? 0,
    txnModes.find((f) => f.modeId === 'cash_courier_ctn')?.score ?? 0,
    txnModes.find((f) => f.modeId === 'velocity_analysis')?.score ?? 0,
    Math.min(1, txnModes.length / 4),
    maxScore >= 0.5 ? 1 : 0,
    maxScore >= 0.7 ? 1 : 0,
  ]);
}

function jurisdictionBucket(sb: SuperBrainLike): number[] {
  const cahra = sb.jurisdiction?.cahra ? 1 : 0;
  const regCount = sb.jurisdiction?.regimes?.length ?? 0;
  return band8([
    cahra,
    Math.min(1, regCount / 6),
    cahra ? 1 : 0,
    cahra ? 0.9 : 0,
    regCount === 0 ? 1 : 0,
    regCount >= 3 ? 1 : 0,
    cahra && regCount >= 2 ? 1 : 0,
    cahra ? 0.8 : regCount >= 4 ? 0.7 : 0,
  ]);
}

function redlineBucket(sb: SuperBrainLike): number[] {
  const fired = sb.redlines?.fired ?? [];
  const crit = fired.filter((r) => r.severity === 'critical').length;
  const high = fired.filter((r) => r.severity === 'high').length;
  return band8([
    Math.min(1, fired.length / 5),
    Math.min(1, crit / 3),
    Math.min(1, high / 3),
    fired.length > 0 ? 1 : 0,
    crit > 0 ? 1 : 0,
    high > 0 ? 1 : 0,
    Math.min(1, (crit + high) / 5),
    fired.length === 0 ? 0 : 1,
  ]);
}

function typologyBucket(sb: SuperBrainLike): number[] {
  const hits = sb.typologies?.hits ?? [];
  const families = new Set(hits.map((h) => h.family ?? 'other'));
  const has = (f: string): number => (families.has(f) ? 1 : 0);
  return band8([
    has('ml'),
    has('tf'),
    has('pf'),
    has('corruption'),
    has('fraud'),
    has('cyber'),
    Math.min(1, hits.length / 8),
    hits.length === 0 ? 0 : 1,
  ]);
}

/** Compute the typology fingerprint for a case. */
export function typologyFingerprint(verdict: VerdictLike, superBrain: SuperBrainLike, caseId?: string): TypologyFingerprint {
  const buckets = {
    regime: regimeMixBucket(superBrain, verdict),
    pep: pepBucket(superBrain),
    adverseMedia: adverseMediaBucket(superBrain),
    ubo: uboBucket(verdict),
    transaction: transactionBucket(verdict),
    jurisdiction: jurisdictionBucket(superBrain),
    redline: redlineBucket(superBrain),
    typology: typologyBucket(superBrain),
  };
  const vector: number[] = [];
  for (const v of [
    buckets.regime, buckets.pep, buckets.adverseMedia,
    buckets.ubo, buckets.transaction, buckets.jurisdiction,
  ]) {
    for (const x of v) vector.push(clamp01(x));
  }
  // The 6 bands × 8 = 48; redline + typology are emitted as scalars in `bands`
  // so the vector stays at exactly VECTOR_LEN.
  while (vector.length < VECTOR_LEN) vector.push(0);
  vector.length = VECTOR_LEN;

  const contributors = (verdict.findings ?? [])
    .map((f) => ({ modeId: f.modeId, w: f.weight ?? f.score }))
    .sort((a, b) => b.w - a.w)
    .slice(0, 8)
    .map((x) => x.modeId);

  return {
    caseId: caseId ?? verdict.caseId ?? '',
    computedAt: new Date().toISOString(),
    vector,
    bands: {
      regime: avg(buckets.regime),
      pep: avg(buckets.pep),
      adverseMedia: avg(buckets.adverseMedia),
      ubo: avg(buckets.ubo),
      transaction: avg(buckets.transaction),
      jurisdiction: avg(buckets.jurisdiction),
      redline: avg(buckets.redline),
      typology: avg(buckets.typology),
    },
    contributors,
  };
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Cosine similarity between two fingerprints in [0,1]. */
export function cosineSimilarity(a: TypologyFingerprint, b: TypologyFingerprint): number {
  const va = a.vector;
  const vb = b.vector;
  const len = Math.min(va.length, vb.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const x = va[i] ?? 0;
    const y = vb[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : Math.min(1, Math.max(0, dot / denom));
}

/** Find the top-K most-similar fingerprints from a haystack. */
export function nearest(
  query: TypologyFingerprint,
  haystack: readonly TypologyFingerprint[],
  k = 5,
): Array<{ caseId: string; similarity: number; computedAt: string }> {
  return haystack
    .filter((h) => h.caseId !== query.caseId)
    .map((h) => ({ caseId: h.caseId, similarity: cosineSimilarity(query, h), computedAt: h.computedAt }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}
