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
export const COGNITIVE_AMPLIFIER_VERSION = 'v3.5.0' as const;

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
  // v3.2.0 additions — sector-expanded, multi-regime, and financial-crime predicate directives.
  'For correspondent banking relationships, execute the nested-bank and payable-through-account sub-chain walk at every review cycle: identify every legal entity that can originate or receive payments through the account and verify each against all declared sanction regimes before clearing.',
  'When evaluating NPO or charity relationships, apply the FATF R.8 programme-level risk assessment: map every geographic programme delivery zone against the CAHRA registry and the active-CAHRA gate; treat any programme in an active-CAHRA zone as a hard-escalation signal absent independent humanitarian-organisation certification.',
  'Apply the sector-rubric scoring engine to every case where a sector tag is present: load the applicable SectorRubric by id, score all dimensions using observable evidence, and surface the sector risk tier (LOW / MEDIUM / HIGH / VERY HIGH) as a named artefact in the output alongside the dimension breakdown.',
  'For every tax-crime or fiscal-fraud indicator that fires, trace the predicate-to-proceeds chain under FATF R.3: identify the predicate offence, the financial flow that constitutes proceeds, the layering mechanism used, and the integration endpoint — all four must be evidenced before a HIGH verdict is emitted.',
  'When a human-trafficking or modern-slavery indicator fires, apply the ILO 11 Forced Labour Indicators framework as the structured evidence template: for each indicator that is positively evidenced, record the raw observable, the ILO indicator label, and the severity weight before computing the aggregated forced-labour risk score.',
  'For VASP and digital-asset cases, traverse the full on-chain provenance chain from wallet to fiat off-ramp: mixer exposure, privacy-coin swap, chain-hop, VASP counterparty licence status, and travel-rule compliance must each be assessed and cited by mode id before the chain_analysis verdict is emitted.',
  'When a multi-jurisdictional sanctions exposure is detected, rank applicable sanction regimes by strictness using the highest-standard principle (US OFAC > EU consolidated > UK OFSI > bilateral), emit a cross-regime conflict note for any obligation that differs across regimes, and apply the strictest lawful obligation.',
  // v3.3.0 additions — DNFBP/real estate, UBO penetration, shell-company detection, PF, hawala, SoW/SoF, PEP network, media velocity.
  'For every DNFBP relationship (lawyer, notary, accountant, real-estate agent, trust/company service provider, high-value dealer), apply FATF R.22/23 sector-specific CDD/EDD gates: verify trigger threshold (real estate ≥ AED 55,000; high-value dealer single cash transaction ≥ AED 55,000; legal/accounting professional any transaction forming part of a client operation), confirm registration with the competent supervisory authority, and escalate to EDD if the sector-risk tier is HIGH or the client is a PEP or CAHRA-linked entity.',
  'For every legal entity in scope, execute the beneficial-ownership chain walk to natural-person level under FATF R.24/25: pierce every corporate, trust, foundation, and partnership veil; the chain is unresolved until a natural person holding ≥25% ownership or exercising effective control is named with a primary-source document (registry extract, notarised certificate, or equivalent); flag any layer where beneficial ownership cannot be confirmed as a UBO opacity alert with an immediate EDD trigger.',
  'Detect shell-company and nominee hallmarks exhaustively: bearer shares or share warrants in issue; nominee director or nominee shareholder on record without a disclosed principal; registered-agent address shared with ≥50 other legal entities; no employees, no physical commercial premises, no primary economic activity; jurisdiction-stacking across ≥2 secrecy jurisdictions in the same ownership chain — any combination of three or more hallmarks constitutes a hard-escalation signal regardless of the transaction amount.',
  'Apply the full FATF R.7 Proliferation Financing (PF) screening layer independently of terrorism-financing checks: cross-reference every counterparty, goods description, and transit point against the Wassenaar Arrangement (dual-use goods/technologies), Nuclear Suppliers Group, Missile Technology Control Regime, Australia Group, and CWC Schedule 1–3 lists; verify end-user statements and stated final destination against UN Panel of Experts reports; treat any re-export routing through a jurisdiction under UN, US, or EU PF sanctions as a CRITICAL signal requiring mandatory reporting.',
  'When hawala or informal value transfer system (IVTS) indicators fire, apply the FATF R.14 unregistered-MSB framework: verify operator registration with the UAE Central Bank or relevant NCA; flag absence of physical paperwork, settlement via commodity or trade credit, geographic reach to FATF high-risk or non-cooperative jurisdictions, and balancing of correspondent accounts through real estate or bulk-cash movements — any unregistered IVTS nexus is an automatic RED verdict and STR trigger.',
  'For every PEP or HIGH-risk subject, require independent Source of Wealth (SoW) and Source of Funds (SoF) verification traceable to a documented primary economic activity: salary scales, audited business valuations, inheritance probate records, or property-sale evidence; reject self-declared SoW without corroborating primary-source evidence; where wealth substantially exceeds the known economic profile, emit an Unexplained Wealth flag citing the wealth-to-profile gap in absolute terms before any relationship approval.',
  'Apply second-degree PEP and sanctions network exposure scoring to every named associate, relative, close associate (RCA), co-director, or co-signatory of a PEP or listed entity: immediate family → implicit-PEP treatment with full EDD; business partner or joint-venture counterparty → PEP-by-proxy with enhanced monitoring; co-director or co-signatory on a sanctioned account → heightened scrutiny with 30-day re-assessment cycle; cite relationship_mapping and community_detection mode ids for every second-degree node scored.',
  'Measure adverse-media velocity as a standalone risk signal: a surge of ≥3 HIGH or CRITICAL severity adverse-media articles referencing the same subject within any rolling 7-day window is a CRITICAL accelerant signal that escalates the overall risk tier by one step regardless of individual article credibility scores; record the article count, the 7-day window start/end dates, the dominant adverse-media category, and the escalated tier in the finding; do not suppress the escalation pending source triangulation — flag both simultaneously.',
  // v3.4.0 additions — sanctions evasion, UAE real estate, DeFi, designation velocity, deepfake KYC, regulatory arbitrage, luxury/art, BEC mule chain.
  'Screen exhaustively for sanctions evasion techniques: name masking (omission of transliterated characters, name inversion, Anglicised variants, deliberate misspelling), vessel AIS transponder manipulation and flag-hopping through ≥2 registries within 12 months, transhipment through UAE free-trade zones or third-country hubs without end-user documentation, and front-company networks where nominee directors or registered agents serve on ≥10 other entities — any confirmed evasion technique elevates the finding to CONFIRMED EVASION regardless of whether the underlying list-match is POSSIBLE.',
  'Apply the UAE real estate sector AML framework to every property-related transaction: cash purchase or cryptocurrency-settled purchase of any value; AED 2 million+ single-property acquisition by a non-resident SPV with no UAE commercial nexus; rapid flip (acquisition and re-sale or re-mortgage within 12 months); property valued ≥20% below Dubai Land Department median for the district at acquisition; off-plan purchase settled via third-party payer — each is a standalone red flag requiring EDD and MLRO escalation under MoET Circular 03/2024.',
  'For DeFi, smart-contract, and Web3 transactions, traverse the on-chain laundering vector catalogue: DEX swap chains used to obscure token origin; cross-chain bridge hops ≥2 in a single settlement; NFT wash-trading patterns (same wallet pair, ≥3 round-trip trades, price escalation >200%); DAO treasury as anonymous beneficiary; liquidity-pool injection followed by immediate drain (rug-pull indicator); mixer or tumbler contract interaction regardless of nominal amount — any confirmed on-chain ML vector is a CRITICAL finding requiring Travel Rule compliance check and chain_analysis citation.',
  'Treat new sanctions designations (any counterparty appearing on OFAC, EU, UK OFSI, or UAE EOCN within the preceding 90 days) as time-sensitive escalations: do not process through the normal CDD refresh cycle; require same-day TFS freeze notification to the MLRO, asset freeze execution within 24 hours per Cabinet Decision 74/2020, and goAML FFR filing within 48 hours — log the designation date, the designating authority, and the elapsed time from designation to detection in the audit trail.',
  'Flag submitted KYC documents where ≥2 deepfake or document-fraud indicators are present: absent or inconsistent EXIF/metadata (creation date, device signature, GPS coordinates); image compression artifacts inconsistent with the camera type of the stated issuing authority; font, layout, or microprint inconsistencies relative to the issuing authority template library; biometric photograph with GAN-model artefacts (symmetry anomalies, ear/hair boundary blur, eye-reflection inconsistency); MRZ checksum failure — treat any document scoring ≥2 indicators as a BLOCKED onboarding and refer for forensic document examination before any decision.',
  'Detect regulatory arbitrage: when an entity structures its activities, entities, or transactions across ≥2 jurisdictions in a pattern that keeps each individual exposure below the regulatory trigger threshold in that jurisdiction, aggregate the exposures into a single consolidated figure and apply the highest applicable standard across all regimes; emit a threshold-splitting alert naming the jurisdictions, the individual sub-threshold amounts, and the aggregated total; cite the proportionality_test and multi_jurisdictional_conflict meta-cognition primitives.',
  'Apply FATF R.22/23 DNFBP controls to luxury goods, art, and collectibles: for art dealers, auction houses, and luxury goods dealers (watches, jewellery, vehicles, yachts) where a single transaction or linked series exceeds AED 55,000, require full CDD, SoF verification, and provenance documentation; for cultural property and antiquities, apply the OECD/UNESCO 1970 Convention provenance framework — no transaction proceeds without a documented provenance chain to a pre-1970 or conflict-zone-free origin; treat unverifiable provenance as a hard-stop.',
  'For Business Email Compromise (BEC), fraud, and cyber-enabled theft proceeds, trace the mule-account chain from victim to integration endpoint: map every account that received a transfer within 72 hours of the initial fraud event; flag any account that matches ≥3 of the following mule-account hallmarks — new account opened within 30 days of first receipt, non-resident account holder, rapid full withdrawal after receipt, repeated pattern of receiving then forwarding exact amounts, address shared with other flagged mule accounts; escalate the full mule-chain map to the MLRO as a single networked-fraud artefact citing link_analysis and community_detection mode ids.',
  // v3.5.0 additions — TM patterns, wire stripping, cash-front companies, insurance ML, capital markets, UAE exchange houses, autonomous agent gates, STR predicate quality.
  'Apply the full transaction monitoring pattern library on every case: structuring / smurfing (multiple transactions below AED 55,000 threshold within 48 hours from the same originator or beneficiary cluster); velocity spike (≥300% increase in transaction count or value versus the 90-day baseline); geographic anomaly (funds routed through ≥3 jurisdictions with no stated commercial nexus); counterparty concentration (≥70% of outflows to a single counterparty not matching declared business purpose); dormant-account activation (no transactions for ≥12 months followed by immediate large-value movement); round-dollar clustering (≥5 transactions of identical or near-identical amounts within 7 days) — each pattern is a standalone red flag; any two co-occurring patterns escalate to HIGH.',
  'For every cross-border wire transfer, execute the SWIFT payment-chain integrity check: detect MT202 cover payments issued without a corresponding MT103 originator reference (cover payment stripping); flag removal or truncation of originator name, address, or account identifier at any intermediary hop (payment stripping under FATF R.16); escalate any correspondent chain exceeding 3 hops without full originator-to-beneficiary transparency as a nested correspondent risk requiring enhanced due diligence on every intermediate institution.',
  'Evaluate cash-intensive business and front-company risk using the commercial substance test: compare declared revenue against sector-average revenue-per-employee benchmarks; flag businesses where cash deposit velocity exceeds 80th-percentile for the sector; identify absence of supplier invoices, payroll records, or commercial lease agreements proportionate to the declared business scale; cross-reference utility consumption, delivery records, and social media presence against the declared turnover — a business scoring implausible on ≥3 substance indicators is a probable front with a HIGH ML risk verdict.',
  'For insurance-sector relationships, traverse the insurance ML vector catalogue: premium financing where the loan is repaid early using funds of unexplained origin; policy surrender within 24 months of inception with cash payout to a third party; offshore life insurance or annuity issued to a non-resident beneficiary without UAE nexus; policy loan draw-down immediately followed by repayment from a different account; reinsurance fronting arrangement where the fronting insurer retains <5% of the risk — each constitutes a distinct ML vector; any combination of two requires MLRO escalation and EDD on the policy beneficiary.',
  'For capital-markets and securities transactions, apply the market-integrity abuse layer: pump-and-dump indicators (coordinated social-media promotion concurrent with large insider sell orders on OTC or low-liquidity exchanges); layered structured products (CLO/CDO stacking across ≥3 SPV tiers where the ultimate beneficial owner of the mezzanine/equity tranche is undisclosed); front-running signals (anomalous options or futures positions opened ≤48 hours before a material corporate announcement); short-and-distort campaign (pattern of negative content publication correlated with short-position accumulation) — each pattern triggers MARKET ABUSE alert and referral to the relevant securities regulator alongside the AML STR.',
  'Apply the UAE exchange house and remittance sector risk framework: for any customer conducting AED equivalent transactions via a UAE-licensed exchange house or hawala operator, verify CBUAE Notice 79/2021 compliance (counterparty due diligence, transaction purpose, beneficiary bank AML status); flag multi-currency conversion chains (AED → USD → EUR → AED within 72 hours) as circular-transaction indicators; escalate remittances destined for FATF grey-list or black-list jurisdictions where the customer cannot produce a documented commercial or family nexus; treat gold-settled or commodity-settled hawala balances as equivalent to cash for CDD threshold purposes.',
  'When an agentic AI system, automated decision engine, or autonomous workflow is processing transactions or making risk determinations, enforce the autonomous-agent governance gate: require a human-in-the-loop approval checkpoint for any single transaction ≥ AED 10,000 or any batch totalling ≥ AED 50,000 within a 24-hour window; log every agent-initiated action with model_id, prompt_hash, input_token_count, decision_rationale, and confidence_score; flag any agent operating outside its declared scope or invoking tool calls not listed in its approved capability manifest as an autonomous-agent-failure incident requiring immediate suspension and audit under the EU AI Act high-risk system obligations.',
  'Enforce the STR predicate-quality gate before any Suspicious Transaction Report is released: the narrative must identify (i) the specific predicate offence from the FATF R.3 designated category list with the applicable UAE statutory reference, (ii) the financial flow that constitutes proceeds of that predicate with transaction identifiers, (iii) the ML stage — placement, layering, or integration — with observable evidence for each claimed stage, and (iv) the suspicion basis — the specific combination of red flags, typology matches, and analytical findings that generated the suspicion; any STR narrative failing one or more of these four gates must be returned to the analyst with a structured deficiency notice before it is filed on goAML 2.0.',
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
