// Hawkeye Sterling — real always-on meta-cognitive modes.
//
// The six modes here run on every reasoning verdict (selectReasoningModeIdsForDomains
// always adds them — see engine.ts). Making them real means every verdict gets a bias
// audit, calibration check, falsification probe, source triangulation check, global
// triangulation across evidence kinds / faculties, and an Occam-vs-conspiracy audit.
//
// They produce findings tagged 'meta' + 'introspection' so the fusion layer does NOT
// count them as contributors to the posterior — they are *about the reasoning* itself.
// The introspection pass reads them to compute the final confidence adjustment.

import type {
  BrainContext, FacultyId, Finding, ReasoningCategory, Verdict,
} from '../types.js';

const BIAS_FRAMING_TOKENS = [
  'obviously', 'clearly', 'undoubtedly', 'without doubt', 'no question',
  'self-evident', 'beyond doubt', 'certain', 'definitely', 'plainly',
];

const CONJUNCTIVE_TOKENS = [
  ' and ', ' also ', ' furthermore ', ' moreover ', ' additionally ',
  ' in addition ', ' further ', ' besides ',
];

const CONDITIONAL_TOKENS = [
  ' unless ', ' assuming ', ' if we also ', ' if we further ',
  ' if we accept ', ' provided that ', ' supposing ',
];

function metaFinding(
  modeId: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  verdict: Verdict,
  confidence: number,
  rationale: string,
  evidencePointers: string[] = [],
): Finding {
  return {
    modeId,
    category,
    faculties,
    score: 0,
    confidence: Math.min(1, Math.max(0, confidence)),
    verdict,
    rationale,
    evidence: evidencePointers,
    producedAt: Date.now(),
    tags: ['meta', 'introspection'],
  };
}

function priors(ctx: BrainContext): Finding[] {
  // Ignore the meta/stub findings themselves when auditing.
  return ctx.priorFindings.filter((f) => {
    if (f.tags?.includes('meta') || f.tags?.includes('introspection')) return false;
    if (f.rationale.startsWith('[stub]')) return false;
    return true;
  });
}

// ── cognitive_bias_audit ─────────────────────────────────────────────────
// Scans prior findings for anchoring, availability, confirmation, framing, narrative-over-evidence.
export const cognitiveBiasAuditApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  const biases: string[] = [];

  if (p.length >= 2) {
    const sorted = [...p].sort((a, b) => b.score - a.score);
    const leader = sorted[0]!;
    const rest = sorted.slice(1);
    const restMean = rest.reduce((a, f) => a + f.score, 0) / Math.max(1, rest.length);
    if (leader.score > 0.7 && leader.score - restMean > 0.4) {
      biases.push(`anchoring:${leader.modeId} score ${leader.score.toFixed(2)} dominates rest (mean ${restMean.toFixed(2)})`);
    }
  }

  const kinds = new Set<string>();
  for (const f of p) for (const e of f.evidence) {
    const kind = e.split(':')[0] || 'unknown';
    kinds.add(kind);
  }
  if (p.length >= 3 && kinds.size === 1) {
    const only = [...kinds][0] ?? 'unknown';
    biases.push(`availability:all evidence from one kind (${only})`);
  }

  if (p.length >= 3) {
    const directions = p.map((f) => (f.score >= 0.5 ? 1 : -1));
    const pos = directions.filter((d) => d > 0).length;
    const neg = directions.length - pos;
    if (pos === directions.length || neg === directions.length) {
      biases.push(`confirmation:${pos === directions.length ? 'all' : 'none'} of ${p.length} findings agree without dissent`);
    }
  }

  const framingHits: string[] = [];
  for (const f of p) {
    const r = f.rationale.toLowerCase();
    for (const token of BIAS_FRAMING_TOKENS) {
      if (r.includes(token)) { framingHits.push(`${f.modeId}:"${token}"`); break; }
    }
  }
  if (framingHits.length > 0) {
    biases.push(`framing:loaded language in ${framingHits.length} finding(s) — ${framingHits.slice(0, 3).join(', ')}`);
  }

  const withEvidence = p.filter((f) => f.evidence.length > 0).length;
  if (p.length >= 4 && withEvidence / p.length < 0.25) {
    biases.push(`narrative_over_evidence:${withEvidence}/${p.length} findings cite evidence`);
  }

  if (biases.length === 0) {
    return metaFinding(
      'cognitive_bias_audit', 'cognitive_science', ['introspection'],
      'clear', 0.85,
      `No bias signatures detected across ${p.length} contributing findings (anchoring, availability, confirmation, framing, narrative-over-evidence).`,
    );
  }
  const severity = Math.min(1, biases.length / 5);
  return metaFinding(
    'cognitive_bias_audit', 'cognitive_science', ['introspection'],
    severity > 0.6 ? 'flag' : 'flag', 0.85 - severity * 0.3,
    `Bias signatures detected (${biases.length}): ${biases.join(' | ')}.`,
  );
};

// ── confidence_calibration ──────────────────────────────────────────────
// Compares claimed confidence against evidence density. Over-confidence or under-confidence is flagged.
export const confidenceCalibrationApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  if (p.length === 0) {
    return metaFinding(
      'confidence_calibration', 'cognitive_science', ['introspection'],
      'inconclusive', 0.5,
      'No contributing findings to calibrate.',
    );
  }
  const meanConf = p.reduce((a, f) => a + f.confidence, 0) / p.length;
  const meanEvidencePerFinding = p.reduce((a, f) => a + f.evidence.length, 0) / p.length;

  // Proxy: expected confidence given evidence density, capped at 0.9.
  const expected = Math.min(0.9, 0.3 + 0.15 * meanEvidencePerFinding);
  const gap = meanConf - expected;

  const notes: string[] = [
    `mean_confidence=${meanConf.toFixed(2)}`,
    `evidence_per_finding=${meanEvidencePerFinding.toFixed(2)}`,
    `expected_confidence=${expected.toFixed(2)}`,
    `calibration_gap=${gap.toFixed(2)}`,
  ];

  let verdict: Verdict;
  let rationale: string;
  if (gap > 0.2) {
    verdict = 'flag';
    rationale = `Over-confidence: claimed confidence exceeds evidence density by ${gap.toFixed(2)}. ${notes.join('; ')}.`;
  } else if (gap < -0.25) {
    verdict = 'flag';
    rationale = `Under-confidence: claimed confidence is ${(-gap).toFixed(2)} below what evidence density supports. ${notes.join('; ')}.`;
  } else {
    verdict = 'clear';
    rationale = `Calibration within tolerance. ${notes.join('; ')}.`;
  }
  return metaFinding(
    'confidence_calibration', 'cognitive_science', ['introspection'],
    verdict, 0.9 - Math.min(0.4, Math.abs(gap)),
    rationale,
  );
};

// ── popper_falsification ─────────────────────────────────────────────────
// The leading hypothesis is strengthened if a genuine attempt to disprove it has happened.
// We look for (a) counterexample_search / falsification-tagged findings, or
// (b) findings that materially contradict the leader (score gap ≥ 0.4 with dissent).
export const popperFalsificationApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  if (p.length < 2) {
    return metaFinding(
      'popper_falsification', 'logic', ['reasoning', 'introspection'],
      'inconclusive', 0.4,
      'Too few findings to assess falsification attempts.',
    );
  }
  const sorted = [...p].sort((a, b) => b.score - a.score);
  const leader = sorted[0]!;
  const dissenters = sorted.slice(1).filter((f) => leader.score - f.score >= 0.4);

  const activeFalsifiers = p.filter((f) =>
    f.modeId === 'counterexample_search' ||
    f.modeId === 'steelman' ||
    f.modeId === 'adversarial_collaboration' ||
    f.tags?.includes('counterexample') ||
    f.tags?.includes('falsification'),
  );

  if (activeFalsifiers.length > 0 || dissenters.length > 0) {
    return metaFinding(
      'popper_falsification', 'logic', ['reasoning', 'introspection'],
      'clear', 0.85,
      `Falsification attempted: ${activeFalsifiers.length} dedicated falsifier(s), ${dissenters.length} material dissenter(s) against leading finding ${leader.modeId}.`,
    );
  }
  return metaFinding(
    'popper_falsification', 'logic', ['reasoning', 'introspection'],
    'flag', 0.8,
    `No falsification attempted. Leading finding ${leader.modeId} (score ${leader.score.toFixed(2)}) runs unopposed. Charter: an untested hypothesis is a weak one.`,
  );
};

// ── source_triangulation ────────────────────────────────────────────────
// Per-finding: high-score claims should cite ≥ 2 independent evidence kinds.
// Kinds are inferred from the evidence-ID prefix before ':' (e.g. 'sanctions_list:un-1').
// Without a kind prefix, conservative: treat as single-kind.
export const sourceTriangulationApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  const highScore = p.filter((f) => f.score >= 0.5);
  if (highScore.length === 0) {
    return metaFinding(
      'source_triangulation', 'compliance_framework', ['ratiocination'],
      'inconclusive', 0.5,
      'No high-score findings requiring triangulation.',
    );
  }
  const untriangulated: string[] = [];
  for (const f of highScore) {
    const kinds = new Set<string>();
    for (const e of f.evidence) kinds.add(e.split(':')[0] || 'unknown');
    if (kinds.size < 2) untriangulated.push(`${f.modeId}(kinds=${kinds.size})`);
  }
  if (untriangulated.length === 0) {
    return metaFinding(
      'source_triangulation', 'compliance_framework', ['ratiocination'],
      'clear', 0.9,
      `All ${highScore.length} high-score findings triangulated across ≥2 evidence kinds.`,
    );
  }
  return metaFinding(
    'source_triangulation', 'compliance_framework', ['ratiocination'],
    'flag', 0.85,
    `Un-triangulated high-score claims (${untriangulated.length}/${highScore.length}): ${untriangulated.slice(0, 5).join(', ')}. Charter P1/P2: sanctions and adverse-media claims must not rest on a single source kind.`,
  );
};

// ── triangulation (global) ──────────────────────────────────────────────
// Global check: across all findings does the verdict draw on ≥2 faculties AND ≥2 evidence kinds?
export const triangulationApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  const faculties = new Set<string>();
  const kinds = new Set<string>();
  for (const f of p) {
    for (const fac of f.faculties) faculties.add(fac);
    for (const e of f.evidence) kinds.add(e.split(':')[0] || 'unknown');
  }
  const notes = [`faculties=${faculties.size}`, `evidence_kinds=${kinds.size}`, `contributors=${p.length}`];
  if (faculties.size >= 3 && kinds.size >= 2) {
    return metaFinding(
      'triangulation', 'logic', ['reasoning', 'ratiocination'],
      'clear', 0.9,
      `Global triangulation satisfied (${notes.join('; ')}).`,
    );
  }
  return metaFinding(
    'triangulation', 'logic', ['reasoning', 'ratiocination'],
    'flag', 0.8,
    `Weak global triangulation (${notes.join('; ')}). Expect ≥3 faculties and ≥2 independent evidence kinds for high-confidence verdicts.`,
  );
};

// ── occam_vs_conspiracy ─────────────────────────────────────────────────
// Count conjunctive / conditional connectives in the top rationales.
// Many connectives ⇒ narrative depends on several unlikely conditions holding jointly.
export const occamVsConspiracyApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  if (p.length === 0) {
    return metaFinding(
      'occam_vs_conspiracy', 'logic', ['reasoning', 'introspection'],
      'inconclusive', 0.4,
      'No findings to audit for parsimony.',
    );
  }
  const top = [...p].sort((a, b) => b.score - a.score).slice(0, 3);
  let conjunctive = 0;
  let conditional = 0;
  for (const f of top) {
    const r = ' ' + f.rationale.toLowerCase() + ' ';
    for (const t of CONJUNCTIVE_TOKENS) if (r.includes(t)) conjunctive++;
    for (const t of CONDITIONAL_TOKENS) if (r.includes(t)) conditional++;
  }
  const complexity = conjunctive + 2 * conditional;
  if (complexity <= 3) {
    return metaFinding(
      'occam_vs_conspiracy', 'logic', ['reasoning', 'introspection'],
      'clear', 0.85,
      `Parsimony satisfied: top-${top.length} rationales cite ${conjunctive} conjunctive / ${conditional} conditional connectives.`,
    );
  }
  return metaFinding(
    'occam_vs_conspiracy', 'logic', ['reasoning', 'introspection'],
    'flag', 0.8,
    `Narrative load-bearing on multiple joint conditions (${conjunctive} conjunctive / ${conditional} conditional). Prefer the simpler explanation unless complexity is evidence-backed.`,
  );
};

export const META_MODE_APPLIES = {
  cognitive_bias_audit: cognitiveBiasAuditApply,
  confidence_calibration: confidenceCalibrationApply,
  popper_falsification: popperFalsificationApply,
  source_triangulation: sourceTriangulationApply,
  triangulation: triangulationApply,
  occam_vs_conspiracy: occamVsConspiracyApply,
} as const;
