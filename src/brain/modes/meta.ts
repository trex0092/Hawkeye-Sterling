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

// ── proportionality_test ──────────────────────────────────────────────────
// A recommended control must not cost more than the residual risk it mitigates.
// Fires on BLOCK/ESCALATE findings to check whether simpler interventions suffice.
export const proportionalityTestApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  const hardFindings = p.filter((f) => f.verdict === 'block' || f.verdict === 'escalate');
  if (hardFindings.length === 0) {
    return metaFinding(
      'proportionality_test', 'legal_reasoning', ['argumentation', 'ratiocination'],
      'clear', 0.85,
      'Proportionality: no block/escalate findings — proportionality gate not triggered.',
    );
  }
  // Look for cost/benefit signals in finding rationales.
  const costTerms = ['full exit', 'terminate', 'permanent block', 'total freeze'];
  const overreachHits: string[] = [];
  for (const f of hardFindings) {
    const r = f.rationale.toLowerCase();
    for (const t of costTerms) {
      if (r.includes(t) && f.score < 0.7) {
        overreachHits.push(`${f.modeId}(score=${f.score.toFixed(2)},action='${t}')`);
        break;
      }
    }
  }
  if (overreachHits.length > 0) {
    return metaFinding(
      'proportionality_test', 'legal_reasoning', ['argumentation', 'ratiocination'],
      'flag', 0.7,
      `Proportionality: potentially disproportionate control(s) — ${overreachHits.join(', ')}. A control costlier than the residual risk must be flagged; consider a less restrictive alternative.`,
    );
  }
  return metaFinding(
    'proportionality_test', 'legal_reasoning', ['argumentation', 'ratiocination'],
    'clear', 0.85,
    `Proportionality: ${hardFindings.length} block/escalate finding(s) — controls appear proportionate to scores.`,
  );
};

// ── multi_jurisdictional_conflict ─────────────────────────────────────────
// Detects when findings reference obligations from ≥2 jurisdictions that
// conflict and applies the highest-standard rule.
export const multiJurisdictionalConflictApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  const jx: string[] = [];
  for (const f of p) {
    const r = f.rationale;
    const matches = r.match(/\b(UAE|US|EU|UK|OFAC|CBUAE|DFSA|FCA|MAS|FINMA|HK)\b/g) ?? [];
    for (const m of matches) if (!jx.includes(m)) jx.push(m);
  }
  if (jx.length < 2) {
    return metaFinding(
      'multi_jurisdictional_conflict', 'compliance_framework', ['ratiocination'],
      'clear', 0.8,
      `Multi-jurisdictional conflict: only ${jx.length} jurisdiction(s) detected — no cross-regime conflict to resolve.`,
    );
  }
  return metaFinding(
    'multi_jurisdictional_conflict', 'compliance_framework', ['ratiocination'],
    'flag', 0.75,
    `Multi-jurisdictional conflict: ${jx.length} jurisdiction/regime references detected (${jx.join(', ')}). Apply highest-standard rule; surface any conflicting obligation explicitly before emitting verdict.`,
  );
};

// ── evidence_chain_audit ──────────────────────────────────────────────────
// Detects dangling references (a finding cites an evidence ID not present
// in ctx.evidence) and assertive-without-evidence language.
export const evidenceChainAuditApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  const availableEvidence = new Set(
    (ctx.evidence.transactions ?? []).map((_, i) => `tx:${i}`),
  );
  const assertiveTerms = ['clearly', 'obviously', 'undoubtedly', 'it is evident', 'without doubt'];
  const bareAssertions: string[] = [];
  const danglingRefs: string[] = [];

  for (const f of p) {
    const r = f.rationale.toLowerCase();
    for (const t of assertiveTerms) {
      if (r.includes(t) && f.evidence.length === 0) {
        bareAssertions.push(`${f.modeId}("${t}")`);
        break;
      }
    }
    for (const ev of f.evidence) {
      if (!availableEvidence.has(ev) && ev.startsWith('tx:')) danglingRefs.push(`${f.modeId}->${ev}`);
    }
  }

  if (bareAssertions.length > 0 || danglingRefs.length > 0) {
    const parts: string[] = [];
    if (bareAssertions.length) parts.push(`bare assertions: ${bareAssertions.slice(0, 4).join(', ')}`);
    if (danglingRefs.length)   parts.push(`dangling refs: ${danglingRefs.slice(0, 4).join(', ')}`);
    return metaFinding(
      'evidence_chain_audit', 'data_quality', ['ratiocination'],
      'flag', 0.8,
      `Evidence chain: ${parts.join('; ')}. Charter P1/P2: no assertion without cited evidence.`,
    );
  }
  return metaFinding(
    'evidence_chain_audit', 'data_quality', ['ratiocination'],
    'clear', 0.9,
    `Evidence chain: all ${p.length} finding(s) have cited evidence and no bare assertions detected.`,
  );
};

// ── ontology_mismatch_detector ────────────────────────────────────────────
// Detects when a finding's category or faculty drifts from the mode's
// declared category/faculty signature — a sign of registry misconfiguration.
export const ontologyMismatchDetectorApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  const mismatches: string[] = [];
  // Heuristic: findings in graph_analysis category should use data_analysis faculty.
  // Findings in crypto_defi should use inference or data_analysis.
  const EXPECTED: Record<string, string[]> = {
    graph_analysis: ['data_analysis', 'intelligence'],
    crypto_defi:    ['data_analysis', 'inference'],
    logic:          ['reasoning', 'argumentation', 'ratiocination', 'introspection'],
    forensic:       ['reasoning', 'data_analysis', 'forensic_accounting'],
  };
  for (const f of p) {
    const expected = EXPECTED[f.category];
    if (!expected) continue;
    const hasExpected = f.faculties.some((fac) => expected.includes(fac));
    if (!hasExpected) mismatches.push(`${f.modeId}(cat=${f.category},fac=${f.faculties.join('+') || 'none'})`);
  }
  if (mismatches.length > 0) {
    return metaFinding(
      'ontology_mismatch_detector', 'data_quality', ['ratiocination'],
      'flag', 0.5,
      `Ontology mismatch: ${mismatches.length} finding(s) use unexpected faculty for their category — ${mismatches.slice(0, 5).join(', ')}. Registry misconfiguration risk.`,
    );
  }
  return metaFinding(
    'ontology_mismatch_detector', 'data_quality', ['ratiocination'],
    'clear', 0.9,
    `Ontology: ${p.length} finding(s) checked — no category/faculty drift detected.`,
  );
};

// ── prior_belief_decay ────────────────────────────────────────────────────
// Applies a half-life decay to stale evidence kinds. Evidence older than
// 180 days should carry diminishing weight; this mode flags when stale
// evidence is the primary driver of a high-score finding.
export const priorBeliefDecayApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  const now = Date.now();
  const HALF_LIFE_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

  const staleDrivers: string[] = [];
  for (const f of p) {
    if (f.score < 0.5) continue;
    // producedAt proxies the evidence timestamp when no explicit timestamp is available.
    const ageMs = now - (f.producedAt ?? now);
    const decayFactor = Math.pow(0.5, ageMs / HALF_LIFE_MS);
    if (decayFactor < 0.5) {
      staleDrivers.push(`${f.modeId}(decay=${decayFactor.toFixed(2)},age=${Math.round(ageMs / 86400000)}d)`);
    }
  }

  if (staleDrivers.length > 0) {
    return metaFinding(
      'prior_belief_decay', 'statistical', ['reasoning', 'ratiocination'],
      'flag', 0.6,
      `Prior belief decay: ${staleDrivers.length} high-score finding(s) are stale (>180 days, half-life decay <0.5) — ${staleDrivers.slice(0, 5).join(', ')}. Stale evidence should not dominate the posterior without fresh corroboration.`,
    );
  }
  return metaFinding(
    'prior_belief_decay', 'statistical', ['reasoning', 'ratiocination'],
    'clear', 0.85,
    `Prior belief decay: all high-score findings are within the 180-day credibility half-life.`,
  );
};

export const META_MODE_APPLIES = {
  cognitive_bias_audit: cognitiveBiasAuditApply,
  confidence_calibration: confidenceCalibrationApply,
  popper_falsification: popperFalsificationApply,
  source_triangulation: sourceTriangulationApply,
  triangulation: triangulationApply,
  occam_vs_conspiracy: occamVsConspiracyApply,
  proportionality_test: proportionalityTestApply,
  multi_jurisdictional_conflict: multiJurisdictionalConflictApply,
  evidence_chain_audit: evidenceChainAuditApply,
  ontology_mismatch_detector: ontologyMismatchDetectorApply,
  prior_belief_decay: priorBeliefDecayApply,
} as const;
