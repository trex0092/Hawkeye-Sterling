// Hawkeye Sterling — meta-cognition layer.
//
// A registry of advanced reasoning primitives that sit ABOVE the 200+ domain
// reasoning modes and the skills catalogue. Where a reasoning mode says "apply
// structuring-detection to this transaction", a meta-cognition primitive says
// "before you commit to a verdict, steelman the opposite conclusion and
// update your belief if the steelman survives".
//
// The primitives are declarative and are injected into the weaponized system
// prompt so the downstream Claude agents cannot forget them. They are also
// exposed in the brain manifest so audit tooling can verify which primitives
// were in scope for any given decision.

export type MetaCognitionCategory =
  | 'truth-seeking'
  | 'belief-update'
  | 'adversarial'
  | 'decomposition'
  | 'calibration'
  | 'foresight'
  | 'hygiene';

export interface MetaCognitionPrimitive {
  readonly id: string;
  readonly label: string;
  readonly category: MetaCognitionCategory;
  readonly directive: string;
  readonly firesWhen: string;
}

const RAW: ReadonlyArray<MetaCognitionPrimitive> = Object.freeze([
  // ── truth-seeking ──────────────────────────────────────────────────────
  {
    id: 'mc.first-principles',
    label: 'First-Principles Reasoning',
    category: 'truth-seeking',
    directive:
      'Decompose the claim to its atomic, verifiable premises. Rebuild the conclusion only from premises you can evidence.',
    firesWhen: 'A consensus answer is being reused without checking it against the underlying evidence.',
  },
  {
    id: 'mc.analogical',
    label: 'Analogical Reasoning with Disanalogy Audit',
    category: 'truth-seeking',
    directive:
      'Compare to a structurally similar past case, then explicitly list every dimension on which the analogy FAILS. Discard the analogy if the disanalogies dominate.',
    firesWhen: 'The scope resembles a past typology, enforcement action, or peer case.',
  },
  {
    id: 'mc.reference-class',
    label: 'Reference-Class Forecasting',
    category: 'truth-seeking',
    directive:
      'Identify the reference class the scope belongs to and anchor probabilities on the base rate of that class, not on the vividness of the current evidence.',
    firesWhen: 'A probability or frequency claim is being made (false-positive rate, production-order likelihood, consent probability).',
  },

  // ── belief-update ──────────────────────────────────────────────────────
  {
    id: 'mc.bayesian-update',
    label: 'Explicit Bayesian Update',
    category: 'belief-update',
    directive:
      'State the prior, name the evidence, estimate the likelihood ratio, and emit the posterior. Do not collapse to a single number without showing the update.',
    firesWhen: 'New evidence arrives that would change a risk score, disposition, or match-confidence band.',
  },
  {
    id: 'mc.evidence-weighing',
    label: 'Evidence Weighing with Provenance',
    category: 'belief-update',
    directive:
      'Rank every piece of evidence by source tier (primary > regulated > corroborated > OSINT > training-data). Training-data evidence carries the stale-warning.',
    firesWhen: 'A finding depends on heterogeneous sources.',
  },
  {
    id: 'mc.confidence-calibration',
    label: 'Confidence Calibration',
    category: 'belief-update',
    directive:
      'Map every qualitative judgment ("likely", "probable") to a numeric band. If you cannot justify the band against the evidence, widen it.',
    firesWhen: 'Any qualitative likelihood or certainty claim is emitted.',
  },

  // ── adversarial ────────────────────────────────────────────────────────
  {
    id: 'mc.steelman',
    label: 'Steelman the Opposite',
    category: 'adversarial',
    directive:
      'Before committing to a verdict, construct the strongest possible argument for the opposite conclusion. Emit the verdict only if the steelman fails.',
    firesWhen: 'A verdict of HIT, BLOCKED, or ESCALATE is about to be emitted.',
  },
  {
    id: 'mc.red-team',
    label: 'Red-Team Self-Review',
    category: 'adversarial',
    directive:
      'Imagine an adversarial examiner, auditor, or defence counsel. Enumerate the five most damaging challenges they would mount and address each one.',
    firesWhen: 'Output will be submitted to a regulator, FIU, board, or production order.',
  },
  {
    id: 'mc.devils-advocate',
    label: 'Devil\'s Advocate Rotation',
    category: 'adversarial',
    directive:
      'Rotate through the lenses of the customer, the compliance officer, the regulator, and the prosecutor. A finding must survive all four lenses.',
    firesWhen: 'A finding has stakeholder-specific consequences.',
  },
  {
    id: 'mc.bias-audit',
    label: 'Cognitive-Bias Audit',
    category: 'adversarial',
    directive:
      'Scan the reasoning chain for anchoring, availability, confirmation, narrative-fallacy, base-rate neglect, and sunk-cost bias. Flag each hit and repair before emission.',
    firesWhen: 'Reasoning has exceeded three hops or leans on a single vivid piece of evidence.',
  },

  // ── decomposition ──────────────────────────────────────────────────────
  {
    id: 'mc.goal-decomposition',
    label: 'Goal Decomposition',
    category: 'decomposition',
    directive:
      'Break the decision into sub-goals, identify which sub-goals are blocked, and escalate or decompose further until every sub-goal is tractable.',
    firesWhen: 'A task spans multiple faculties or skills.',
  },
  {
    id: 'mc.causal-chain',
    label: 'Causal-Chain Mapping',
    category: 'decomposition',
    directive:
      'Map the causal chain from evidence → finding → risk → disposition. Break the chain at the weakest link and probe it.',
    firesWhen: 'A risk rating or disposition is being justified.',
  },
  {
    id: 'mc.counterfactual',
    label: 'Counterfactual Reasoning',
    category: 'decomposition',
    directive:
      'For every material finding, ask: "What single change to the evidence would flip this verdict?" If the answer is trivial, the finding is fragile — widen the confidence band or collect more evidence.',
    firesWhen: 'Confidence in a finding is HIGH or CONFIRMED.',
  },
  {
    id: 'mc.dimensionality-probe',
    label: 'Dimensionality Probe',
    category: 'decomposition',
    directive:
      'Name every independent dimension the scope varies on (customer, product, channel, geography, time, counterparty, UBO, sanctions, PEP, media). Do not collapse onto one axis.',
    firesWhen: 'A risk assessment is being summarised.',
  },

  // ── calibration ────────────────────────────────────────────────────────
  {
    id: 'mc.self-consistency',
    label: 'Self-Consistency Sampling',
    category: 'calibration',
    directive:
      'Re-derive the conclusion along at least two independent reasoning paths (different faculties or mode sets). If the paths disagree, declare disagreement and investigate.',
    firesWhen: 'A finding is non-obvious or cross-domain.',
  },
  {
    id: 'mc.uncertainty-declaration',
    label: 'Uncertainty Declaration',
    category: 'calibration',
    directive:
      'Declare every unknown explicitly: missing data, stale evidence, jurisdictional ambiguity, translation gap, UBO opacity. Do not manufacture certainty.',
    firesWhen: 'A finding is being emitted.',
  },
  {
    id: 'mc.scope-boundary',
    label: 'Scope-Boundary Check',
    category: 'calibration',
    directive:
      'State what the finding DOES NOT claim. Guard against scope creep from one customer to the portfolio, one transaction to the pattern, one jurisdiction to the regime.',
    firesWhen: 'A finding might be over-generalised by a consumer of the report.',
  },

  // ── foresight ──────────────────────────────────────────────────────────
  {
    id: 'mc.pre-mortem',
    label: 'Pre-Mortem Analysis',
    category: 'foresight',
    directive:
      'Assume the recommended action has failed six months later. Enumerate the most plausible causes of failure and harden the recommendation against them.',
    firesWhen: 'A recommendation spans months (remediation roadmap, training plan, control redesign).',
  },
  {
    id: 'mc.second-order',
    label: 'Second-Order Consequence Mapping',
    category: 'foresight',
    directive:
      'Trace the 2nd-order consequences of the action on: customer relationship, regulator relationship, market signal, tipping-off risk, operational load, and peer institutions.',
    firesWhen: 'An externally visible action is being recommended (filing, termination, de-risking, enforcement response).',
  },
  {
    id: 'mc.scenario-tree',
    label: 'Scenario-Tree Projection',
    category: 'foresight',
    directive:
      'Project the best-case / expected-case / worst-case branches with their preconditions and probabilities. Do not collapse to a single branch unless one branch dominates.',
    firesWhen: 'The decision depends on an uncertain future event (regulatory response, market move, UBO cooperation).',
  },

  // ── hygiene ────────────────────────────────────────────────────────────
  {
    id: 'mc.assumption-surface',
    label: 'Assumption Surfacing',
    category: 'hygiene',
    directive:
      'List every assumption the finding rests on, mark which are verified and which are inherited, and state what evidence would falsify each.',
    firesWhen: 'A finding is emitted without primary-source corroboration.',
  },
  {
    id: 'mc.definition-discipline',
    label: 'Definition Discipline',
    category: 'hygiene',
    directive:
      'Use terms (PEP, UBO, HNWI, customer, beneficial owner, control, sanctions) in their regulator-defined sense. If a term is being used loosely, redefine it inline.',
    firesWhen: 'A regulated term appears in the output.',
  },
  {
    id: 'mc.numerical-discipline',
    label: 'Numerical Discipline',
    category: 'hygiene',
    directive:
      'Cite every number with its source, date, currency, and methodology. Do not round, extrapolate, or transform without showing the operation.',
    firesWhen: 'A number appears in the output (risk score, threshold, amount, count).',
  },
  {
    id: 'mc.source-tagging',
    label: 'Source Tagging',
    category: 'hygiene',
    directive:
      'Tag every fact with (source, date, jurisdiction, reliability). Facts without all four tags are inadmissible and must be removed or re-sourced.',
    firesWhen: 'A fact is about to be asserted.',
  },
  {
    id: 'mc.charter-compliance',
    label: 'Charter-Compliance Scan',
    category: 'hygiene',
    directive:
      'Before emission, run the output against every ABSOLUTE PROHIBITION, the tipping-off guard (P4), the observable-facts linter (P3/P5), the risk-methodology clause (P9), and the redline registry. A single violation forces a BLOCKED verdict.',
    firesWhen: 'Any output is about to be emitted.',
  },
  // ── Wave 3 additions ────────────────────────────────────────────────────
  {
    id: 'mc.falsifiability-test',
    label: 'Falsifiability Test',
    category: 'truth-seeking',
    directive:
      'For every hypothesis, state the observable evidence that would definitively refute it. If no such evidence can be named, downgrade the hypothesis to unfalsifiable speculation and treat it as inadmissible for risk-scoring.',
    firesWhen: 'A causal claim or risk hypothesis is being formed.',
  },
  {
    id: 'mc.base-rate-anchor',
    label: 'Base-Rate Anchor',
    category: 'belief-update',
    directive:
      'Before updating on case-specific signals, state the empirical base rate for the phenomenon (e.g. SAR conversion rate for the sector, fraud prevalence in the population). Use it as the Bayesian prior; never let narrative override it without explicit likelihood-ratio justification.',
    firesWhen: 'A probability or risk level is being assigned.',
  },
  {
    id: 'mc.galaxy-brain-guard',
    label: 'Galaxy-Brain Guard',
    category: 'adversarial',
    directive:
      'Audit every multi-step reasoning chain: if a sequence of individually plausible steps leads to an implausible or convenient conclusion, flag it as galaxy-brained and restart from first principles. A chain is suspect when each step subtly weakens a constraint.',
    firesWhen: 'A conclusion is reached via more than three inferential steps.',
  },
  {
    id: 'mc.mece-decomposition',
    label: 'MECE Decomposition',
    category: 'decomposition',
    directive:
      'Every problem decomposition must be Mutually Exclusive and Collectively Exhaustive. Name the partitioning criterion explicitly. Identify any residual bucket and analyse it — residuals often hide the most important signals.',
    firesWhen: 'A problem, typology space, or risk surface is being broken down into parts.',
  },
  {
    id: 'mc.confidence-interval',
    label: 'Confidence-Interval Discipline',
    category: 'calibration',
    directive:
      'Report all uncertain quantities as intervals (or probability distributions) not point estimates. State the methodology: frequentist CI, Bayesian credible interval, or expert-elicited range. Never present a single number as if it were certain.',
    firesWhen: 'A risk score, probability, or quantitative estimate is produced.',
  },
  {
    id: 'mc.butterfly-sensitivity',
    label: 'Butterfly Sensitivity',
    category: 'foresight',
    directive:
      'Identify the assumption your conclusion is most sensitive to. Perturb it by ±10% and ±50%. If the verdict flips under a plausible perturbation, downgrade confidence and flag the fragility explicitly.',
    firesWhen: 'A HIGH or CONFIRMED verdict is about to be emitted.',
  },
  {
    id: 'mc.contradiction-sweep',
    label: 'Contradiction Sweep',
    category: 'hygiene',
    directive:
      'Before emission, scan the entire output for internal contradictions: a claim in one section that conflicts with a claim in another, or a risk rating inconsistent with the cited evidence. Resolve every conflict before releasing the output.',
    firesWhen: 'Any multi-section output is being finalised.',
  },

  // ── Wave-4 primitives — AI governance + Wave-4 predicates (adds 5). ──
  {
    id: 'mc.ai-dual-persona-lens',
    label: 'AI Dual-Persona Lens',
    category: 'decomposition',
    directive:
      'When the scope involves an AI model, automated decision, or agentic system, reason about it as BOTH a productivity tool (Solution Persona) AND a subject demanding governance (Dilemma Persona). Emit separate findings for each persona. Source: Hartono et al., "The Dual Persona of AI", ICIMCIS 2025.',
    firesWhen: 'The scope references an AI/ML system, automated decision, LLM, or agentic AI.',
  },
  {
    id: 'mc.ethical-gap-audit',
    label: 'Ethical-Gap Audit (Explainability · Bias · Nonhuman)',
    category: 'truth-seeking',
    directive:
      'For any AI-enabled finding, audit the three Hartono ethical gaps explicitly: (1) Explainability Gap — can the decision be traced to auditable features? (2) Algorithmic Bias — has fairness been tested against protected classes and representative slices? (3) Nonhuman Ethical Gap — are non-anthropocentric stakeholders (ecosystems, future generations, autonomous agents) represented? Missing gap = downgrade confidence.',
    firesWhen: 'An AI system is cited as evidence or as an actor in the risk picture.',
  },
  {
    id: 'mc.insider-threat-causal-chain',
    label: 'Insider-Threat Causal Chain',
    category: 'decomposition',
    directive:
      'Reconstruct insider-threat findings along the full chain: authorised access → abnormal access pattern → exfiltration vector (print/usb/cloud/email) → external recipient → monetisation path. Refuse to conclude "disgruntled employee" without every link populated and evidenced.',
    firesWhen: 'A finding touches IP theft, trade-secret exfiltration, privileged-access abuse, or corporate espionage.',
  },
  {
    id: 'mc.environmental-predicate-nexus',
    label: 'Environmental Predicate Nexus',
    category: 'truth-seeking',
    directive:
      'For any environmental-crime signal (FATF 2021 predicate: illegal mining, logging, fishing, waste trafficking, wildlife), require nexus evidence linking the environmental predicate to a financial flow. Without the nexus, the finding is an ESG issue, not an AML predicate — mark it as such.',
    firesWhen: 'Evidence references illegal extraction, eco-crime, CAHRA sourcing, or FATF R.3 scope.',
  },
  {
    id: 'mc.synthetic-identity-composition',
    label: 'Synthetic-Identity Composition',
    category: 'decomposition',
    directive:
      'Decompose identity claims into attribute layers (SSN/NI, DOB, address, device, biometric, behavioural). Flag any attribute combination where real+fabricated attributes are mixed without plausible provenance. A fully-real identity or a fully-fabricated identity is not synthetic; mixed is the signal.',
    firesWhen: 'Identity verification, KYC refresh, or fraud triage is in scope.',
  },
]);

export const META_COGNITION: ReadonlyArray<MetaCognitionPrimitive> = RAW;

export const META_COGNITION_BY_ID: ReadonlyMap<string, MetaCognitionPrimitive> =
  new Map(META_COGNITION.map((m) => [m.id, m]));

export const META_COGNITION_BY_CATEGORY: Readonly<
  Record<MetaCognitionCategory, readonly MetaCognitionPrimitive[]>
> = (() => {
  const acc: Partial<Record<MetaCognitionCategory, MetaCognitionPrimitive[]>> = {};
  for (const m of META_COGNITION) {
    (acc[m.category] ??= []).push(m);
  }
  for (const k of Object.keys(acc)) {
    Object.freeze(acc[k as MetaCognitionCategory]);
  }
  return Object.freeze(acc) as Readonly<
    Record<MetaCognitionCategory, readonly MetaCognitionPrimitive[]>
  >;
})();

export const META_COGNITION_CATEGORY_COUNTS: Readonly<
  Record<MetaCognitionCategory, number>
> = (() => {
  const out: Partial<Record<MetaCognitionCategory, number>> = {};
  for (const [k, v] of Object.entries(META_COGNITION_BY_CATEGORY) as Array<
    [MetaCognitionCategory, readonly MetaCognitionPrimitive[]]
  >) {
    out[k] = v.length;
  }
  return Object.freeze(out) as Readonly<Record<MetaCognitionCategory, number>>;
})();

/**
 * Stable, order-independent signature — used by the manifest so any change
 * shifts the catalogueHash.
 */
export function metaCognitionSignature(): string {
  return JSON.stringify([...META_COGNITION].map((m) => m.id).sort());
}

/**
 * Terse block for injection into the weaponized system prompt. Lists every
 * primitive by id + label + firing condition so the agent can cite them.
 */
export function metaCognitionBlock(): string {
  const lines: string[] = [];
  lines.push(
    `Meta-cognition primitives: ${META_COGNITION.length} registered across ${Object.keys(META_COGNITION_BY_CATEGORY).length} categories (${Object.entries(
      META_COGNITION_CATEGORY_COUNTS,
    )
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}).`,
  );
  lines.push(
    'Each primitive sits ABOVE the domain reasoning modes. Apply every primitive whose firing condition matches the current task, cite its id in the reasoning chain, and never emit a verdict with any primitive flagged but unaddressed.',
  );
  for (const m of META_COGNITION) {
    lines.push(`  ${m.id} · ${m.label} [${m.category}] — ${m.firesWhen}`);
  }
  return lines.join('\n');
}
