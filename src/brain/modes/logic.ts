// Hawkeye Sterling — core logic & inference modes.
//
// These seven modes carry real, domain-aware inference rather than stubs. They are
// evidence-grounded (reading ctx.evidence and ctx.priorFindings) and charter-compliant:
// they produce observable-fact findings, never legal conclusions (P3). Downstream
// fusion combines them via Bayesian update of an 'illicit_risk' / 'sanctioned' /
// 'pep' / 'ubo_opaque' / 'adverse_media_linked' posterior.

import type {
  BrainContext, FacultyId, Finding, Hypothesis, LikelihoodRatio,
  ReasoningCategory, Verdict,
} from '../types.js';

function findingOf(
  modeId: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  verdict: Verdict,
  score: number,
  confidence: number,
  rationale: string,
  opts: {
    evidence?: string[];
    hypothesis?: Hypothesis;
    likelihoodRatios?: LikelihoodRatio[];
    tags?: string[];
  } = {},
): Finding {
  const f: Finding = {
    modeId,
    category,
    faculties,
    score: clamp01(score),
    confidence: clamp01(confidence),
    verdict,
    rationale,
    evidence: opts.evidence ?? [],
    producedAt: Date.now(),
  };
  if (opts.hypothesis !== undefined) f.hypothesis = opts.hypothesis;
  if (opts.likelihoodRatios !== undefined) f.likelihoodRatios = opts.likelihoodRatios;
  if (opts.tags !== undefined) f.tags = opts.tags;
  return f;
}

function priors(ctx: BrainContext): Finding[] {
  return ctx.priorFindings.filter((f) => {
    if (f.tags?.includes('meta') || f.tags?.includes('introspection')) return false;
    if (f.rationale.startsWith('[stub]')) return false;
    return true;
  });
}

function evCount(x: unknown): number {
  return Array.isArray(x) ? x.length : 0;
}

// ── modus_ponens ────────────────────────────────────────────────────────
// If the evidence set explicitly includes a match/hit/designation, derive the
// corresponding observable-fact conclusion with a concrete LR.
export const modusPonensApply = async (ctx: BrainContext): Promise<Finding> => {
  const e = ctx.evidence;
  const triggers: string[] = [];
  const lrs: LikelihoodRatio[] = [];
  let hypothesis: Hypothesis = 'illicit_risk';
  let score = 0;

  const sanc = evCount(e.sanctionsHits);
  if (sanc > 0) {
    triggers.push(`sanctionsHits present (n=${sanc}) ⇒ subject observable in sanctions dataset`);
    lrs.push({ evidenceId: 'sanctions_list:observed', positiveGivenHypothesis: 0.95, positiveGivenNot: 0.02 });
    hypothesis = 'sanctioned';
    score = Math.max(score, 0.9);
  }
  const pep = evCount(e.pepHits);
  if (pep > 0) {
    triggers.push(`pepHits present (n=${pep}) ⇒ subject observable in PEP dataset`);
    lrs.push({ evidenceId: 'pep_list:observed', positiveGivenHypothesis: 0.9, positiveGivenNot: 0.08 });
    if (hypothesis !== 'sanctioned') hypothesis = 'pep';
    score = Math.max(score, 0.7);
  }
  const am = evCount(e.adverseMedia);
  if (am > 0) {
    triggers.push(`adverseMedia present (n=${am}) ⇒ subject referenced in adverse media`);
    lrs.push({ evidenceId: 'adverse_media:observed', positiveGivenHypothesis: 0.8, positiveGivenNot: 0.15 });
    if (hypothesis === 'illicit_risk') hypothesis = 'adverse_media_linked';
    score = Math.max(score, 0.6);
  }

  if (triggers.length === 0) {
    return findingOf(
      'modus_ponens', 'logic', ['reasoning', 'inference'],
      'inconclusive', 0, 0.5,
      'No modus-ponens rule fired: evidence carries no sanctions/PEP/adverse-media flags.',
    );
  }
  return findingOf(
    'modus_ponens', 'logic', ['reasoning', 'inference'],
    score >= 0.85 ? 'escalate' : score >= 0.5 ? 'flag' : 'clear',
    score, 0.85,
    `Modus ponens: ${triggers.join('; ')}.`,
    { evidence: lrs.map((l) => l.evidenceId), hypothesis, likelihoodRatios: lrs },
  );
};

// ── modus_tollens ───────────────────────────────────────────────────────
// "If compliant then expected docs present. ¬expected docs ⇒ ¬compliant."
// Flags absence of expected CDD / UBO documentation when the domain demands it.
export const modusTollensApply = async (ctx: BrainContext): Promise<Finding> => {
  const gaps: string[] = [];
  const lrs: LikelihoodRatio[] = [];
  if (ctx.domains.includes('cdd') && evCount(ctx.evidence.documents) === 0) {
    gaps.push('CDD documentation absent despite cdd domain selected');
    lrs.push({ evidenceId: 'cdd_documents:missing', positiveGivenHypothesis: 0.6, positiveGivenNot: 0.2 });
  }
  if (ctx.domains.includes('ubo') && evCount(ctx.evidence.uboChain) === 0) {
    gaps.push('UBO chain absent despite ubo domain selected');
    lrs.push({ evidenceId: 'ubo_chain:missing', positiveGivenHypothesis: 0.7, positiveGivenNot: 0.15 });
  }
  if (gaps.length === 0) {
    return findingOf(
      'modus_tollens', 'logic', ['reasoning', 'inference'],
      'clear', 0, 0.7,
      'Modus tollens: no missing expected evidence for declared domains.',
    );
  }
  return findingOf(
    'modus_tollens', 'logic', ['reasoning', 'inference'],
    'flag', 0.5, 0.8,
    `Modus tollens: ${gaps.join('; ')}. Expected evidence absent ⇒ compliance pathway incomplete (charter P10: halt and request supplementary evidence).`,
    {
      evidence: lrs.map((l) => l.evidenceId),
      hypothesis: 'ubo_opaque',
      likelihoodRatios: lrs,
    },
  );
};

// ── reductio ────────────────────────────────────────────────────────────
// Assume a 'clear' outcome; search priors for any finding that contradicts it.
// If found, produce a contradiction flag.
export const reductioApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  if (p.length === 0) {
    return findingOf(
      'reductio', 'logic', ['reasoning', 'argumentation'],
      'inconclusive', 0, 0.4,
      'No priors; reductio cannot test a clear-verdict assumption.',
    );
  }
  const meanScore = p.reduce((a, f) => a + f.score, 0) / p.length;
  const spikes = p.filter((f) => f.score >= 0.7);
  const nonSpikes = p.filter((f) => f.score < 0.7);
  const nonSpikesMean = nonSpikes.length ? nonSpikes.reduce((a, f) => a + f.score, 0) / nonSpikes.length : 0;
  // Classic reductio pattern: assume a 'clear' verdict, then point to any
  // severity spike that refutes that assumption. If the remaining priors are
  // collectively low-severity (the implicit "clear" population) but any one
  // prior spikes, the assumption is refuted.
  if (spikes.length > 0 && nonSpikesMean < 0.3) {
    return findingOf(
      'reductio', 'logic', ['reasoning', 'argumentation'],
      'flag', 0.6, 0.85,
      `Reductio: assuming 'clear' verdict (mean score ${meanScore.toFixed(2)}) contradicts ${spikes.length} high-severity finding(s): ${spikes.slice(0, 3).map((f) => `${f.modeId}@${f.score.toFixed(2)}`).join(', ')}. Clear-verdict assumption refuted.`,
      { hypothesis: 'material_concern' },
    );
  }
  return findingOf(
    'reductio', 'logic', ['reasoning', 'argumentation'],
    'clear', 0, 0.8,
    `Reductio: no self-contradiction in priors (mean ${meanScore.toFixed(2)}, no severity spikes).`,
  );
};

// ── bayes_theorem ───────────────────────────────────────────────────────
// Emits explicit, auditable likelihood ratios for the primary hypothesis based
// on evidence presence. Fusion composes these into the posterior.
export const bayesTheoremApply = async (ctx: BrainContext): Promise<Finding> => {
  const lrs: LikelihoodRatio[] = [];
  const notes: string[] = [];
  if (evCount(ctx.evidence.sanctionsHits) > 0) {
    lrs.push({ evidenceId: 'sanctions_hit', positiveGivenHypothesis: 0.95, positiveGivenNot: 0.01 });
    notes.push('sanctions hit LR≈95');
  }
  if (evCount(ctx.evidence.pepHits) > 0) {
    lrs.push({ evidenceId: 'pep_hit', positiveGivenHypothesis: 0.8, positiveGivenNot: 0.1 });
    notes.push('PEP hit LR=8');
  }
  if (evCount(ctx.evidence.adverseMedia) > 0) {
    lrs.push({ evidenceId: 'adverse_media', positiveGivenHypothesis: 0.6, positiveGivenNot: 0.15 });
    notes.push('adverse media LR=4');
  }
  if (evCount(ctx.evidence.transactions) > 0) {
    lrs.push({ evidenceId: 'transactions_observed', positiveGivenHypothesis: 0.5, positiveGivenNot: 0.4 });
    notes.push('transactions present LR=1.25 (mild)');
  }

  if (lrs.length === 0) {
    return findingOf(
      'bayes_theorem', 'statistical', ['data_analysis', 'inference'],
      'inconclusive', 0, 0.5,
      'Bayes: no evidence items to construct a likelihood ratio.',
    );
  }
  return findingOf(
    'bayes_theorem', 'statistical', ['data_analysis', 'inference'],
    'flag', 0.5, 0.85,
    `Bayes emitted ${lrs.length} likelihood ratio(s) for posterior composition: ${notes.join('; ')}.`,
    { evidence: lrs.map((l) => l.evidenceId), hypothesis: 'illicit_risk', likelihoodRatios: lrs },
  );
};

// ── steelman ────────────────────────────────────────────────────────────
// If priors trend adversarial, emit the strongest innocent explanation so the verdict
// is pressure-tested. Tagged 'counterexample' so popper_falsification credits it.
export const steelmanApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  if (p.length === 0) {
    return findingOf(
      'steelman', 'cognitive_science', ['argumentation', 'deep_thinking'],
      'inconclusive', 0, 0.4,
      'Steelman: no priors to oppose.',
    );
  }
  const meanScore = p.reduce((a, f) => a + f.score, 0) / p.length;
  if (meanScore < 0.4) {
    return findingOf(
      'steelman', 'cognitive_science', ['argumentation', 'deep_thinking'],
      'clear', 0, 0.7,
      'Steelman: adversarial pressure not warranted — priors do not assert a hostile verdict.',
      { tags: ['counterexample'] },
    );
  }
  const counters = [
    'name-only collision with an innocent same-named individual (P6)',
    'legitimate business pattern misread as velocity anomaly',
    'training-data recall mistaken for current primary-source confirmation (P8)',
    'paraphrased media report of a dismissed / unproven allegation (P5)',
    'ownership structure legitimately complex for tax/estate reasons, not obfuscation',
  ];
  return findingOf(
    'steelman', 'cognitive_science', ['argumentation', 'deep_thinking'],
    'flag', 0.3, 0.75,
    `Steelman (innocent hypothesis): the signals could also be explained by: ${counters.join('; ')}. Verdict must exclude these alternatives before escalating.`,
    { tags: ['counterexample'] },
  );
};

// ── pre_mortem ──────────────────────────────────────────────────────────
// Imagine the verdict turns out to be wrong six months later. What broke?
export const preMortemApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  const failureModes = [
    'false positive on name-only match freezes legitimate client (reputational + complaint risk)',
    'false negative on training-data-only recall lets a designated party proceed (charter P1/P8 breach)',
    'tipping-off leak via customer communication (charter P4 breach, Art.25 FDL No.10/2025)',
    'disposition recorded without two-sign-off four-eyes (Cabinet Resolution 134/2025 Art.19)',
    'STR filed on insufficient evidence bypassing MLRO review (regulator challenge risk)',
  ];
  return findingOf(
    'pre_mortem', 'cognitive_science', ['deep_thinking'],
    p.length > 0 ? 'clear' : 'inconclusive',
    0, 0.75,
    `Pre-mortem — dominant failure modes if this verdict turns out wrong in 6 months: ${failureModes.map((m, i) => `(${i + 1}) ${m}`).join(' ')}`,
    { tags: ['counterexample'] },
  );
};

// ── contradiction_detection ─────────────────────────────────────────────
// Flags hard verdict contradictions in priors (e.g. one finding says 'block', another 'clear').
export const contradictionDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  const blockers = p.filter((f) => f.verdict === 'block');
  const clears = p.filter((f) => f.verdict === 'clear');
  const escalates = p.filter((f) => f.verdict === 'escalate');
  if (blockers.length > 0 && clears.length > 0) {
    return findingOf(
      'contradiction_detection', 'logic', ['reasoning', 'introspection'],
      'flag', 0.6, 0.9,
      `Hard contradiction: ${blockers.length} block verdict(s) vs ${clears.length} clear verdict(s) in the same run. Cannot average; escalate for human adjudication.`,
      { hypothesis: 'material_concern' },
    );
  }
  if (escalates.length > 0 && clears.length >= 2) {
    return findingOf(
      'contradiction_detection', 'logic', ['reasoning', 'introspection'],
      'flag', 0.4, 0.8,
      `Soft contradiction: ${escalates.length} escalate vs ${clears.length} clear. Resolve before issuing verdict.`,
    );
  }
  return findingOf(
    'contradiction_detection', 'logic', ['reasoning', 'introspection'],
    'clear', 0, 0.8,
    'No verdict contradictions detected in priors.',
  );
};

export const LOGIC_MODE_APPLIES = {
  modus_ponens: modusPonensApply,
  modus_tollens: modusTollensApply,
  reductio: reductioApply,
  bayes_theorem: bayesTheoremApply,
  steelman: steelmanApply,
  pre_mortem: preMortemApply,
  // contradiction_detection is not in the registry as a distinct ID; we route it via
  // paraconsistent which has the same spirit.
  paraconsistent: contradictionDetectionApply,
} as const;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
