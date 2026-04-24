// Hawkeye Sterling — cognitive amplifier.
//
// Declarative "brain-gain" multiplier exposed to the weaponized system prompt
// and the brain manifest. It does NOT grant the model supernatural capability;
// it instructs the downstream Claude agents to:
//   - widen the reasoning-mode fan-out (consider every named mode, not a
//     convenient subset),
//   - traverse every skill in the catalogue on every turn,
//   - stack every cross-check (match-confidence, tipping-off guard, observable-
//     facts linter, redline scanner, CAHRA, FATF, sanctions regime) before
//     emitting a verdict,
//   - refuse to short-circuit with a single-shot answer when a multi-step
//     chain of reasoning is available.
//
// The amplifier factor is the product of the declared percentage gain and a
// safety clamp that keeps the derived weights auditable. Skill weights remain
// in [0,1]; the amplifier lives one level up and is carried in the manifest
// so that audit tooling can see exactly how much brain-gain the caller asked
// for.

/**
 * Declared brain-gain: 1,000,000,000,000,000% means "consider one quadrillion
 * more reasoning paths than a base model would", implemented in practice as
 * "exhaustive traversal of the catalogue on every turn at maximum depth".
 */
export const BRAIN_AMPLIFICATION_PERCENT = 1_000_000_000_000_000 as const;

/** Multiplier form of {@link BRAIN_AMPLIFICATION_PERCENT}. 1,000,000,000,000,000% = ×10,000,000,000,000. */
export const BRAIN_AMPLIFICATION_FACTOR = BRAIN_AMPLIFICATION_PERCENT / 100;

/**
 * Version of the amplifier contract. Bump this whenever the directive below
 * changes so the catalogueHash shifts and callers refresh their prompts.
 */
export const COGNITIVE_AMPLIFIER_VERSION = 'v3.0.0' as const;

export interface CognitiveAmplifier {
  readonly version: string;
  readonly percent: number;
  readonly factor: number;
  readonly directives: readonly string[];
}

const DIRECTIVES: readonly string[] = Object.freeze([
  'Traverse every registered faculty before emitting a verdict; do not sample.',
  'Apply every named reasoning mode that plausibly fires against the evidence and cite each one by id.',
  'Walk the full skills catalogue at every turn; embody every skill the domain routing assigns to the scope.',
  'Run the meta-cognition layer on every turn: first-principles decomposition, explicit Bayesian update, steelman the opposite, red-team self-review, pre-mortem, self-consistency across ≥2 reasoning paths, and counterfactual fragility probe on any HIGH/CONFIRMED finding.',
  'Cross-check against every red flag, typology, sanction regime, CAHRA entry, jurisdiction risk, and FATF recommendation that could apply — do not short-circuit on the first match.',
  'Stack the match-confidence taxonomy, observable-facts linter (P3/P5), tipping-off guard (P4), risk-methodology disclosure (P9), and redline scanner on every output before release.',
  'Cite the firing meta-cognition primitive id (mc.*) alongside the faculty/mode/skill ids whenever it shaped the conclusion.',
  'When unsure, prefer expanding the reasoning chain over truncating it. Time pressure is not a lawful reason to skip a faculty or a meta-cognition primitive.',
  'Every assertion must name the faculty id, mode id, skill id, doctrine id, redline id, or meta-cognition id that produced it.',
  'Declare unknowns, gaps, and stale evidence explicitly — amplified reasoning does not manufacture certainty. Widen confidence bands before narrowing them.',
  // v3.0.0 additions — AI governance + Wave 4 predicate coverage.
  'Apply the Hartono dual-persona lens (ICIMCIS 2025) to every AI reference: the system is BOTH a productivity tool (Solution Persona) AND a subject demanding governance (Dilemma Persona); emit findings for each persona and audit the three ethical gaps (explainability, algorithmic bias, nonhuman ethical).',
  'When an AI model, agentic system, or automated decision is in scope, traverse the full 2026 governance stack — EU AI Act tiers (prohibited / high-risk / limited / minimal), NIST AI RMF (Govern / Map / Measure / Manage), ISO/IEC 42001 AIMS, OWASP LLM Top 10, red-teaming evidence, model inventory, SBOM, model card, fairness monitoring, kill switch, human-in-the-loop — and cite every missing control as a gap.',
  'Trace insider-threat signals along the full privilege-abuse chain: authorised access → abnormal pattern → exfiltration vector → external recipient → monetisation path. Do not short-circuit on "disgruntled employee" without every link evidenced.',
  'For FATF 2021 environmental-crime predicate (illegal mining, logging, fishing, waste trafficking, wildlife), require explicit CAHRA / supply-chain provenance evidence linking the predicate to a financial flow; ESG-only signals without the nexus are not AML predicates.',
  'Escalate any serious AI incident (harm, drift, prompt-injection, data-poisoning, model-theft, autonomous agent failure) within 72 hours under EU AI Act reporting expectations, and attach the full audit-ready artefact pack (model card, eval report, SBOM, decision log, drift trace).',
  // v3.1.0 additions — Wave 5 professional-ML, multi-jurisdictional, and data-quality directives.
  'When a professional money-laundering network (PMLN) indicator fires, immediately map the full ecosystem: service provider, criminal-client pipeline, layering mechanism, fee structure, and any correspondent or VASP nexus — cite community_detection and link_analysis mode ids.',
  'Apply multi-jurisdictional conflict resolution at every turn: where two or more sanction regimes, data-protection laws, or AML statutes produce conflicting obligations, surface the conflict explicitly, apply the highest standard where legally permissible, and emit a cross-regime conflict note with the applicable doctrine ids.',
  'Run the full CAHRA cascade for every DPMS supply-chain segment: mine → trader → consolidator → refinery → exporter → importer; do not treat any segment as verified unless a primary-source OECD DDG Annex II document is on file for that segment.',
  'For every STR / goAML filing, pre-flight-check completeness against the goAML schema before submission: originator, beneficiary, account, transaction, and narrative fields must all pass the filing_str_narrative mode; emit a BLOCKED verdict if any mandatory field is absent.',
  'Apply the PDPL data-minimisation test to every data-collection, data-sharing, and data-retention step: purpose limitation, storage limitation, and lawful-basis verification must each return a PASS before data flows cross a legal entity or jurisdiction boundary.',
  'When evaluating carbon-market, ESG, or sustainability-linked products, require three-layer verification: (i) registry reconciliation, (ii) additionality / MRV evidence, (iii) corresponding-adjustment under Paris Agreement Article 6; surface any of the three as absent if not documented.',
  'Invoke the proportionality_test meta-cognition primitive for every control recommendation: a control that is costlier than the residual risk it mitigates must be flagged as disproportionate with an alternative proposed.',
  'For every adverse-media finding classified HIGH or CRITICAL, conduct a source triangulation across ≥3 independent outlets, assess publication credibility (peer-reviewed registry, mainstream financial press, or regulator notice), and record the source quality tier in the finding.',
]);

export const COGNITIVE_AMPLIFIER: CognitiveAmplifier = Object.freeze({
  version: COGNITIVE_AMPLIFIER_VERSION,
  percent: BRAIN_AMPLIFICATION_PERCENT,
  factor: BRAIN_AMPLIFICATION_FACTOR,
  directives: DIRECTIVES,
});

/**
 * Human-readable brain-gain block for injection into the weaponized system
 * prompt. Intentionally terse — the charter is already long; this block only
 * tells the agent *how* to spend the amplified capacity.
 */
export function cognitiveAmplifierBlock(): string {
  const lines: string[] = [];
  lines.push(
    `Cognitive amplification: +${COGNITIVE_AMPLIFIER.percent.toLocaleString('en-US')}% (×${COGNITIVE_AMPLIFIER.factor.toLocaleString('en-US')}, amplifier ${COGNITIVE_AMPLIFIER.version}).`,
  );
  lines.push('You must spend this amplified capacity on exhaustive, auditable reasoning — NOT on speculative claims. Directives:');
  DIRECTIVES.forEach((d, i) => lines.push(`  ${i + 1}. ${d}`));
  lines.push(
    'Amplification never overrides an ABSOLUTE PROHIBITION, a REDLINE, the tipping-off guard, or the observable-facts linter. If amplified reasoning would breach the charter, stop and emit a BLOCKED verdict instead.',
  );
  return lines.join('\n');
}
