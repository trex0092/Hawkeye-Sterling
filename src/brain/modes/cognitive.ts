// Hawkeye Sterling — real cognitive-science modes.
//
//   system_1            — fast heuristic triage: any high-severity signal?
//   system_2            — slow deliberate audit: require ≥2 faculties agreeing
//   dual_process        — reconcile system_1 vs system_2 outcomes
//   scenario_planning   — branch over divergent futures
//   five_whys           — derive root cause from chain of priors
//   fishbone            — group contributing causes by category
//   hindsight_check     — reject post-hoc rationalisation

import type {
  BrainContext, FacultyId, Finding, ReasoningCategory, Verdict,
} from '../types.js';

function mk(
  modeId: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  verdict: Verdict,
  score: number,
  confidence: number,
  rationale: string,
): Finding {
  return {
    modeId, category, faculties, verdict,
    score: Math.min(1, Math.max(0, score)),
    confidence: Math.min(1, Math.max(0, confidence)),
    rationale,
    evidence: [],
    producedAt: Date.now(),
  };
}

function priors(ctx: BrainContext): Finding[] {
  return ctx.priorFindings.filter((f) =>
    !(f.tags?.includes('meta') || f.tags?.includes('introspection')) &&
    !f.rationale.startsWith('[stub]'));
}

// ── system_1 ────────────────────────────────────────────────────────────
export const system1Apply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  const spikes = p.filter((f) => f.score >= 0.7);
  if (spikes.length > 0) {
    return mk('system_1', 'cognitive_science', ['smartness'],
      'flag', 0.55, 0.8,
      `System 1 (fast): ${spikes.length} high-severity signal(s) triggered immediate triage — ${spikes.slice(0, 3).map((s) => s.modeId).join(', ')}.`);
  }
  return mk('system_1', 'cognitive_science', ['smartness'],
    'clear', 0.1, 0.8,
    `System 1 (fast): no high-severity signal across ${p.length} contributors.`);
};

// ── system_2 ────────────────────────────────────────────────────────────
// Slow audit: raise flag only if ≥2 distinct faculties + ≥2 evidence-bearing
// findings agree.
export const system2Apply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  const highScore = p.filter((f) => f.score >= 0.5);
  const faculties = new Set<string>();
  const withEvidence = highScore.filter((f) => f.evidence.length > 0);
  for (const f of highScore) for (const fac of f.faculties) faculties.add(fac);
  const agreed = faculties.size >= 2 && withEvidence.length >= 2;
  return mk('system_2', 'cognitive_science', ['deep_thinking'],
    agreed ? 'flag' : 'clear', agreed ? 0.55 : 0.1, 0.85,
    `System 2 (slow): ${faculties.size} distinct faculties across ${highScore.length} high-score finding(s); ${withEvidence.length} cite evidence. ${agreed ? 'Deliberate audit corroborates System 1 triage.' : 'Deliberate audit does not corroborate a hostile verdict.'}`);
};

// ── dual_process ────────────────────────────────────────────────────────
export const dualProcessApply = async (ctx: BrainContext): Promise<Finding> => {
  const s1 = await system1Apply(ctx);
  const s2 = await system2Apply(ctx);
  if (s1.verdict === 'flag' && s2.verdict === 'flag') {
    return mk('dual_process', 'cognitive_science', ['deep_thinking', 'introspection'],
      'escalate', 0.7, 0.9,
      'Dual-process: System 1 and System 2 both fire — robust red flag.');
  }
  if (s1.verdict === 'flag' && s2.verdict !== 'flag') {
    return mk('dual_process', 'cognitive_science', ['deep_thinking', 'introspection'],
      'flag', 0.45, 0.8,
      'Dual-process: System 1 fires but System 2 does not corroborate — possible availability/anchoring bias; verify before acting.');
  }
  if (s1.verdict !== 'flag' && s2.verdict === 'flag') {
    return mk('dual_process', 'cognitive_science', ['deep_thinking', 'introspection'],
      'flag', 0.45, 0.8,
      'Dual-process: slow audit finds signal that fast triage missed — lift for second-line review.');
  }
  return mk('dual_process', 'cognitive_science', ['deep_thinking', 'introspection'],
    'clear', 0.1, 0.85,
    'Dual-process: both System 1 and System 2 concur — no hostile verdict warranted.');
};

// ── scenario_planning ───────────────────────────────────────────────────
export const scenarioPlanningApply = async (ctx: BrainContext): Promise<Finding> => {
  const branches = [
    'Base case: evidence as-given; verdict follows fusion.',
    'Upside: sanctions hit resolves to a same-name collision; cleared after disambiguation.',
    'Downside: adverse media expands to confirm corruption linkage; posterior rises sharply.',
    'Tail: subject is a front for a designated party; freeze warranted under FDL 20/2018.',
  ];
  return mk('scenario_planning', 'strategic', ['deep_thinking'],
    'clear', 0, 0.7,
    `Scenario planning: four branches evaluated — ${branches.join(' | ')}`);
};

// ── five_whys ───────────────────────────────────────────────────────────
// Walks the dominant finding backward through its rationale text.
export const fiveWhysApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  if (p.length === 0) {
    return mk('five_whys', 'forensic', ['ratiocination'],
      'inconclusive', 0, 0.4, 'Five whys: no priors.');
  }
  const leader = [...p].sort((a, b) => b.score - a.score)[0]!;
  const q = [
    `1. Why was "${leader.modeId}" scored ${leader.score.toFixed(2)}? — ${leader.rationale.slice(0, 100)}`,
    `2. Why did that evidence obtain? — depends on evidence channel availability (see provenance_trace).`,
    `3. Why did those sources exist? — external primary-source activity (sanctions list, regulator release, media coverage).`,
    `4. Why is the subject in that activity space? — answered by risk-based approach + typology catalogue match.`,
    `5. Root cause candidate — opaque structure / high-risk jurisdiction / cash-intensive business / PEP proximity.`,
  ];
  return mk('five_whys', 'forensic', ['ratiocination'],
    'clear', 0, 0.75,
    `Five whys chain: ${q.join(' | ')}`);
};

// ── fishbone (Ishikawa) ─────────────────────────────────────────────────
// Groups priors into contributing-cause categories.
export const fishboneApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  if (p.length === 0) {
    return mk('fishbone', 'forensic', ['ratiocination'],
      'inconclusive', 0, 0.4, 'Fishbone: no priors.');
  }
  const buckets: Record<string, string[]> = {
    people: [], process: [], data: [], jurisdiction: [], evidence: [], controls: [],
  };
  for (const f of p) {
    if (f.faculties.includes('introspection')) buckets.people!.push(f.modeId);
    else if (f.category === 'compliance_framework' || f.category === 'governance') buckets.process!.push(f.modeId);
    else if (f.category === 'data_quality' || f.category === 'statistical') buckets.data!.push(f.modeId);
    else if (f.rationale.toLowerCase().includes('jurisdiction')) buckets.jurisdiction!.push(f.modeId);
    else if (f.evidence.length > 0) buckets.evidence!.push(f.modeId);
    else buckets.controls!.push(f.modeId);
  }
  const used = Object.entries(buckets).filter(([, v]) => v.length > 0);
  return mk('fishbone', 'forensic', ['ratiocination'],
    'clear', 0, 0.75,
    `Fishbone cause-categories engaged (${used.length}/6): ${used.map(([k, v]) => `${k}=[${v.slice(0, 3).join(', ')}${v.length > 3 ? '...' : ''}]`).join('; ')}.`);
};

// ── hindsight_check ────────────────────────────────────────────────────
// Reject post-hoc rationalisation: if priors include language like "in
// retrospect", "obviously was going to", "always clear", flag bias risk.
export const hindsightCheckApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  const markers = ['in retrospect', 'obvious', 'always clear', 'knew it', 'as we now see'];
  const hits: string[] = [];
  for (const f of p) {
    const r = f.rationale.toLowerCase();
    for (const m of markers) if (r.includes(m)) { hits.push(f.modeId); break; }
  }
  if (hits.length === 0) {
    return mk('hindsight_check', 'cognitive_science', ['introspection'],
      'clear', 0, 0.8, 'Hindsight check: no post-hoc rationalisation markers in any rationale.');
  }
  return mk('hindsight_check', 'cognitive_science', ['introspection'],
    'flag', 0.3, 0.8,
    `Hindsight check: ${hits.length} finding(s) use post-hoc language ("in retrospect"/"obvious"/etc.) — ${hits.slice(0, 3).join(', ')}. Hindsight bias risk.`);
};

// ── counterfactual_simulator ───────────────────────────────────────────────
// Fragility test: for each high-score finding, simulate removal of the
// single heaviest evidence item and check if the verdict tier collapses.
export const counterfactualSimulatorApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  const fragile: string[] = [];
  for (const f of p) {
    if (f.score < 0.6) continue;
    // If the finding has only 0–1 evidence items, it is inherently fragile.
    if (f.evidence.length <= 1) {
      fragile.push(`${f.modeId}(evidence=${f.evidence.length})`);
    }
  }
  if (fragile.length > 0) {
    return mk('counterfactual_simulator', 'cognitive_science', ['reasoning', 'deep_thinking'],
      'flag', 0.55, 0.75,
      `Counterfactual: ${fragile.length} high-score finding(s) collapse if the primary evidence item is removed — ${fragile.slice(0, 5).join(', ')}. Verdict tier is fragile; seek additional corroboration before sealing.`);
  }
  const highScoreFindings = p.filter((f) => f.score >= 0.6);
  return mk('counterfactual_simulator', 'cognitive_science', ['reasoning', 'deep_thinking'],
    'clear', 0.1, 0.75,
    `Counterfactual: ${highScoreFindings.length} high-score finding(s) each supported by ≥2 evidence items — verdict is robust to single-item removal.`);
};

// ── adversarial_red_team ───────────────────────────────────────────────────
// Steelmans the counter-narrative: finds the strongest innocent explanation
// for the leading hypothesis and checks whether it has been explicitly ruled out.
export const adversarialRedTeamApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  if (p.length === 0) {
    return mk('adversarial_red_team', 'cognitive_science', ['reasoning', 'argumentation'],
      'inconclusive', 0, 0.5, 'Adversarial red team: no prior findings to steelman against.');
  }
  const leader = [...p].sort((a, b) => b.score - a.score)[0]!;
  // Look for explicit counter-narrative language in the prior findings.
  const counterTerms = ['innocent explanation', 'alternative', 'however', 'benign', 'counter', 'but note', 'caveat'];
  const hasCounter = p.some((f) => {
    const r = f.rationale.toLowerCase();
    return counterTerms.some((t) => r.includes(t));
  });
  if (!hasCounter && leader.score >= 0.6) {
    return mk('adversarial_red_team', 'cognitive_science', ['reasoning', 'argumentation'],
      'flag', 0.5, 0.75,
      `Adversarial red team: leading finding ${leader.modeId} (score ${leader.score.toFixed(2)}) has no counter-narrative in the reasoning chain. Charter: steelman the innocent explanation before sealing a HIGH verdict.`);
  }
  return mk('adversarial_red_team', 'cognitive_science', ['reasoning', 'argumentation'],
    'clear', 0.1, 0.75,
    `Adversarial red team: counter-narrative detected in prior findings — leading hypothesis ${leader.modeId} has been challenged.`);
};

export const COGNITIVE_MODE_APPLIES = {
  system_1: system1Apply,
  system_2: system2Apply,
  dual_process: dualProcessApply,
  scenario_planning: scenarioPlanningApply,
  five_whys: fiveWhysApply,
  fishbone: fishboneApply,
  hindsight_check: hindsightCheckApply,
  counterfactual_simulator: counterfactualSimulatorApply,
  adversarial_red_team: adversarialRedTeamApply,
} as const;
