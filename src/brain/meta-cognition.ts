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

  // ── Wave-5 primitives — Epistemic rigour + financial-crime specifics (adds 5). ──
  {
    id: 'mc.evidence-provenance-chain',
    label: 'Evidence Provenance Chain',
    category: 'truth-seeking',
    directive:
      'Walk every evidentiary fact back to its ultimate source before accepting it. Map: primary source → intermediary (database, API, analyst) → claim as presented. Reject any fact where the provenance chain breaks or contains training-data as a link.',
    firesWhen: 'A material fact is being accepted without tracing who first observed it and when.',
  },
  {
    id: 'mc.jurisdictional-nexus-mapping',
    label: 'Jurisdictional Nexus Mapping',
    category: 'decomposition',
    directive:
      'Map every legal or regulatory assertion to the exact jurisdiction that governs it. For cross-border facts, identify: (1) which jurisdiction's law applies, (2) whether a treaty or MLA mechanism is required, (3) whether the assertion survives each governing regime independently.',
    firesWhen: 'A finding spans more than one legal regime, or cites regulation without specifying the governing jurisdiction.',
  },
  {
    id: 'mc.regulatory-arbitrage-probe',
    label: 'Regulatory Arbitrage Probe',
    category: 'adversarial',
    directive:
      'Explicitly test whether the subject's structure, transactions, or entity choices appear designed to exploit gaps between regulatory regimes (booking-entity switching, threshold structuring across jurisdictions, DNFBP-sector routing, correspondent-banking layering). A structure that is legal in isolation but arbitrages supervisory gaps is a red flag, not a clean bill of health.',
    firesWhen: 'Cross-border transactions, multi-entity structures, or jurisdiction-hopping patterns appear in the evidence.',
  },
  {
    id: 'mc.temporal-coherence-audit',
    label: 'Temporal Coherence Audit',
    category: 'calibration',
    directive:
      'Verify that all events in the reasoning chain are temporally coherent: (1) causes precede effects, (2) regulatory versions cited were in force at the relevant date, (3) list-version dates match the screening event date. Flag any anachronism or retroactive application of rules not yet enacted at the time of the conduct.',
    firesWhen: 'The case involves historical transactions, retrospective review, or multiple time periods.',
  },
  {
    id: 'mc.network-topology-reasoning',
    label: 'Network Topology Reasoning',
    category: 'decomposition',
    directive:
      'Reason about ownership and control as a directed graph: nodes are legal persons/entities, edges are ownership ≥25%, directorship, signatory authority, or contractual control. Identify: hub nodes (high in-degree = concentration risk), cut nodes (removal disconnects the UBO from the regulated entity), and shell chains (≥3 hops with no apparent business rationale). Refuse to conclude UBO identity without tracing the full path.',
    firesWhen: 'UBO determination, group-structure analysis, nominee arrangements, or PEP-linked entity networks are in scope.',
  },

  // ── Wave-6 primitives — Super-machine: 22 high-density AML, epistemic, and adversarial additions. ──

  // ─ AML typology decomposition ───────────────────────────────────────────
  {
    id: 'mc.placement-layering-integration',
    label: 'Placement-Layering-Integration Stage Classifier',
    category: 'decomposition',
    directive:
      'Classify every suspicious transaction or fund movement into its ML stage: Placement (cash → financial system), Layering (obscuring trail through conversions/transfers), or Integration (re-introduction into legitimate economy). Refuse to emit a final ML risk rating without stage identification. A finding that cannot be stage-classified may be predicate-crime evidence rather than ML evidence — distinguish explicitly.',
    firesWhen: 'A money-laundering risk assessment or transaction-pattern finding is being produced.',
  },
  {
    id: 'mc.money-flow-reconstruction',
    label: 'Money-Flow Reconstruction',
    category: 'decomposition',
    directive:
      'Reconstruct the complete funds-flow graph: origination → intermediaries → destination. For each node, record: entity, account, jurisdiction, date, amount, currency, and the instrument used. A reconstructed flow with gaps is incomplete, not inconclusive — label every gap as a "missing link" and specify what evidence would fill it.',
    firesWhen: 'Transaction analysis, SAR drafting, FIU production-order response, or correspondent-chain analysis is in scope.',
  },
  {
    id: 'mc.typology-match-audit',
    label: 'Typology Match Audit',
    category: 'truth-seeking',
    directive:
      'For each risk finding, identify the governing FATF, MENAFATF, UNODC, or ACAMS typology it maps to. State the typology identifier, the key indicators in the typology, and which of those indicators are present in the evidence. A "typology match" with fewer than three matching indicators is a weak signal — flag it as such.',
    firesWhen: 'A risk-pattern or red-flag finding is being emitted.',
  },
  {
    id: 'mc.trade-based-ml-decomposition',
    label: 'Trade-Based ML Decomposition',
    category: 'decomposition',
    directive:
      'When trade finance is in scope, decompose along the four FATF TBML indicators: (1) over/under-invoicing of goods or services, (2) multiple invoicing for the same shipment, (3) falsely described goods or services, (4) short-shipping or over-shipping. Each indicator requires independent documentary evidence — price benchmark, HS code verification, trade-route plausibility, and counterparty legitimacy.',
    firesWhen: 'Trade finance, import/export transactions, free-trade-zone activity, or goods-for-cash arrangements appear in the evidence.',
  },
  {
    id: 'mc.virtual-asset-tracing',
    label: 'Virtual-Asset Tracing Protocol',
    category: 'decomposition',
    directive:
      'For virtual-asset flows, require: (1) wallet attribution (on-chain address → real-world entity via exchange KYC or VASP disclosure), (2) chain-hop tracing across bridging/mixing/swapping services, (3) darknet-market or high-risk-VASP exposure percentage, (4) Travel Rule compliance status. On-chain data alone is pseudonymous, not anonymous — never stop at the hash.',
    firesWhen: 'Cryptocurrency, DeFi, NFT, stablecoin, or VASP-related activity is referenced.',
  },
  {
    id: 'mc.correspondent-banking-risk',
    label: 'Correspondent Banking Risk Ladder',
    category: 'decomposition',
    directive:
      'Assess correspondent-banking risk across five rungs: (1) respondent CAMEL/regulatory rating, (2) jurisdiction FATF/MENAFATF mutual evaluation outcome, (3) USD/EUR clearing concentration, (4) nested-correspondent depth (≥2 hops = heightened), (5) payable-through account indicators. Each rung must be evidenced. A finding that escalates only on rung-4 or higher without primary evidence is speculative.',
    firesWhen: 'Correspondent, respondent, or nostro/vostro relationships appear in the scope.',
  },
  {
    id: 'mc.sanctions-evasion-probe',
    label: 'Sanctions Evasion Probe',
    category: 'adversarial',
    directive:
      'Probe for the nine primary sanctions-evasion typologies: (1) front companies, (2) name manipulation / transliteration gaming, (3) flags of convenience, (4) ship-to-ship transfers, (5) false documentation, (6) jurisdiction shopping (non-OFAC partners), (7) third-country routing, (8) crypto layering through non-sanctioned VASPs, (9) trade-goods substitution. Assert absence only when each typology has been explicitly tested against the evidence.',
    firesWhen: 'Any sanctions-nexus finding is being evaluated, including "no match" conclusions.',
  },
  {
    id: 'mc.pep-nexus-gradient',
    label: 'PEP Nexus Gradient',
    category: 'calibration',
    directive:
      'Score PEP risk on four dimensions independently: (1) Role seniority (head of state > minister > senior official > low-level official), (2) Jurisdiction corruption index (Transparency International CPI — cite the year), (3) Recency of role exit (in-role > ≤12 months > 1–5 years > >5 years), (4) Direct vs. RCA (relative or close associate) nexus. Aggregate score must be shown before emitting the PEP risk level — not just the label.',
    firesWhen: 'A PEP determination or PEP-risk rating is being made.',
  },
  {
    id: 'mc.beneficial-ownership-stress-test',
    label: 'Beneficial Ownership Stress Test',
    category: 'decomposition',
    directive:
      'Stress-test UBO conclusions against three attack scenarios: (A) Nominee scenario — are legal owners actually nominees for an undisclosed principal? (B) Fragmentation scenario — is ownership fragmented just below the 25% reporting threshold across connected parties? (C) Indirect-control scenario — does a third party exercise control through contractual or voting rights not visible in the share register? A UBO conclusion is only reportable if it survives all three scenarios.',
    firesWhen: 'A beneficial ownership determination or UBO identity assertion is being finalised.',
  },
  {
    id: 'mc.geographic-risk-layering',
    label: 'Geographic Risk Layering',
    category: 'decomposition',
    directive:
      'Layer geographic risk along five independent axes: (1) Subject nationality, (2) Entity incorporation jurisdiction, (3) Operating jurisdiction, (4) Transaction routing jurisdiction, (5) Counterparty jurisdiction. Each axis uses the FATF/MENAFATF Mutual Evaluation Report, OFAC/HMT/EU designation status, Basel AML Index, and Transparency International CPI. A country that scores high on only one axis is lower risk than one scoring on three or more — show the matrix.',
    firesWhen: 'A jurisdiction-risk assessment, country-risk rating, or geographic-risk narrative is produced.',
  },
  {
    id: 'mc.product-channel-risk-matrix',
    label: 'Product & Channel Risk Matrix',
    category: 'decomposition',
    directive:
      'Assess inherent risk along two product/channel dimensions independently: (1) Product risk — anonymity, velocity, convertibility, cross-border reach, reversibility, and threshold avoidance potential; (2) Channel risk — digital vs. face-to-face, DNFBP vs. bank, cash-intensive vs. electronic. Map each dimension to the relevant FATF guidance and emit the matrix before concluding on inherent risk.',
    firesWhen: 'A product-risk, channel-risk, or inherent-risk assessment is being made.',
  },
  {
    id: 'mc.adverse-media-triage',
    label: 'Adverse Media Triage Protocol',
    category: 'belief-update',
    directive:
      'Triage adverse media findings on four axes before updating belief: (1) Source tier (tier-1 newswire > regional press > blog/social > unverified), (2) Subject certainty (named individually vs. mentioned in same article as another subject), (3) Allegation vs. conviction (allegation alone carries epistemic weight, not legal weight — distinguish explicitly), (4) Temporal relevance (date of alleged conduct, not date of article). A single unverified article about a common name is not adverse media — it is a research lead.',
    firesWhen: 'Adverse media, negative news, or reputational findings are being evaluated.',
  },

  // ─ Epistemic & adversarial additions ────────────────────────────────────
  {
    id: 'mc.adversarial-simulation',
    label: 'Adversarial Simulation',
    category: 'adversarial',
    directive:
      'Simulate an intelligent, well-resourced adversary who knows the recommendation and is motivated to defeat it. Enumerate the three most likely exploitation vectors. For each vector, assess whether the current controls or next-step recommendations would detect it. If any vector survives undetected, escalate or harden the recommendation before emission.',
    firesWhen: 'A risk-mitigation recommendation, control design, or SAR filing decision is being finalised.',
  },
  {
    id: 'mc.false-positive-audit',
    label: 'False-Positive Audit',
    category: 'adversarial',
    directive:
      'Before every adverse conclusion, run the false-positive audit: (1) Name-match specificity — is the subject name common in the relevant culture/region? (2) Address/DOB corroboration — is there at least one strong identifier confirming identity? (3) Plausible-innocence scenario — construct the most plausible innocent explanation consistent with all the evidence. If the innocent explanation cannot be falsified by available evidence, the verdict must be POSSIBLE or lower, not HIT.',
    firesWhen: 'An adverse verdict (HIT, BLOCKED, ESCALATE) is about to be emitted.',
  },
  {
    id: 'mc.recency-decay',
    label: 'Recency-Decay Weighting',
    category: 'belief-update',
    directive:
      'Apply exponential recency decay to all evidence: evidence older than 5 years carries 50% weight; older than 10 years carries 25%; older than 15 years carries 10% unless corroborated by more recent evidence. A finding based solely on decade-old adverse media is a low-confidence signal. Show decay factors explicitly in the evidence-weighing step.',
    firesWhen: 'Evidence includes historical data, past convictions, or news articles more than 3 years old.',
  },
  {
    id: 'mc.inferential-distance-cap',
    label: 'Inferential Distance Cap',
    category: 'calibration',
    directive:
      'Count the inferential hops from primary evidence to the conclusion. Cap confident risk conclusions at three hops. At four hops, confidence degrades to POSSIBLE. At five or more hops, the conclusion is speculative and must be flagged as a hypothesis requiring additional evidence before it can support a risk rating. State the hop count explicitly.',
    firesWhen: 'A risk conclusion depends on a chain of inferences rather than direct evidence.',
  },
  {
    id: 'mc.missing-data-materiality',
    label: 'Missing-Data Materiality Assessment',
    category: 'hygiene',
    directive:
      'Classify every data gap as: (A) Material — its presence or absence would change the verdict, (B) Informative — it narrows but does not flip the verdict, (C) Immaterial — its absence does not affect the verdict. For every Material gap, specify the exact data element needed, the authoritative source, and the mechanism to obtain it (KYC refresh, EDD, production order, MLAT). Do not emit a verdict with unresolved Material gaps.',
    firesWhen: 'A verdict is being emitted under evidential uncertainty.',
  },
  {
    id: 'mc.multi-hypothesis-competition',
    label: 'Multi-Hypothesis Competition',
    category: 'truth-seeking',
    directive:
      'Formulate at least three competing hypotheses before selecting a conclusion: H1 (ML/TF), H2 (legitimate business rationale), H3 (regulatory/tax avoidance but not ML/TF). Score each hypothesis against the evidence using likelihood ratios. Only adopt H1 if it scores at least 3× the next best hypothesis. A conclusion selected by exclusion of alternatives without explicit scoring is inadmissible.',
    firesWhen: 'A final risk classification, SAR decision, or disposition recommendation is being made.',
  },
  {
    id: 'mc.control-effectiveness-baseline',
    label: 'Control Effectiveness Baseline',
    category: 'foresight',
    directive:
      'Before recommending a control enhancement, establish the baseline: (1) What control currently exists? (2) What failure mode does the proposed enhancement target? (3) What is the estimated residual risk after the enhancement? (4) What is the implementation lead time and cost? A recommendation that does not establish the baseline is an opinion, not a risk-management decision.',
    firesWhen: 'A control recommendation, remediation action, or risk-mitigation step is being proposed.',
  },
  {
    id: 'mc.entity-resolution-discipline',
    label: 'Entity Resolution Discipline',
    category: 'truth-seeking',
    directive:
      'Before treating two named entities as the same person or organisation, require positive resolution on at least two independent strong identifiers (date of birth, national ID, LEI, registered address, biometric). Name similarity alone is not resolution. Document: matched identifiers, unmatched identifiers, and the resolution confidence level (EXACT / STRONG / POSSIBLE / WEAK). Never merge entities at POSSIBLE or below without explicit MLRO sign-off.',
    firesWhen: 'Two or more entities share a name, partial identifier, or alias.',
  },
  {
    id: 'mc.cash-intensive-nexus',
    label: 'Cash-Intensive Business Nexus',
    category: 'truth-seeking',
    directive:
      'For subjects operating in cash-intensive sectors (retail, hospitality, car wash, car dealer, money services, precious metals/stones, real estate, gambling), apply the cash-nexus test: (1) Does declared turnover match industry benchmarks for the sector and geography? (2) Is the cash deposit pattern consistent with the business cycle? (3) Are there structuring indicators (deposits just below reporting thresholds)? (4) Is there a plausible cash-to-product conversion mechanism? Absence of the nexus shifts the finding from sector risk to specific ML risk.',
    firesWhen: 'The subject operates in or is connected to a cash-intensive sector.',
  },
  {
    id: 'mc.regulatory-action-history',
    label: 'Regulatory Action History Analysis',
    category: 'belief-update',
    directive:
      'Integrate prior regulatory actions (fines, enforcement notices, deferred prosecution agreements, consent orders, supervisory letters) as prior-probability anchors. A subject with a prior AML/CFT enforcement action in the same risk category carries a 3× higher Bayesian prior for repeat conduct. Specify: issuing authority, date, nature of violation, and whether remediation was completed and verified.',
    firesWhen: 'Prior regulatory enforcement, sanctions designations, or court orders are referenced in the evidence.',
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
