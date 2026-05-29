// Wave 13 — forensic accounting expansion, quantum intelligence expansion,
// anticipation expansion, geopolitical awareness expansion.
// 19 new modes filling the four sparsest faculties in the registry.

import type {
  FacultyId, ReasoningCategory, ReasoningMode,
} from './types.js';
import { defaultApply } from './modes/default-apply.js';

const m = (
  id: string,
  name: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  description: string,
): ReasoningMode => ({
  id, name, category, faculties, wave: 13, description,
  apply: defaultApply(id, category, faculties, description),
});

// ── forensic_accounting (6 new) ───────────────────────────────────────────────
const forensic_accounting: ReasoningMode[] = [
  m('fa.journal_entry_timing_analysis', 'Journal Entry Timing Analysis', 'forensic_accounting',
    ['forensic_accounting', 'data_analysis'],
    'Detect off-hours, weekend, and period-end journal entries — a primary ACFE fraud indicator. ' +
    'Legitimate accounting follows business hours; manual overrides at 2AM or on the last day of the ' +
    'reporting period signal fabrication or concealment (ACFE Report to the Nations, Exhibit 4.3).'),

  m('fa.round_dollar_clustering', 'Round-Dollar Transaction Clustering', 'forensic_accounting',
    ['forensic_accounting', 'data_analysis', 'smartness'],
    'Identify unusual clustering of transactions at perfectly round dollar amounts. ' +
    'Legitimate commerce produces non-uniform amounts reflecting real pricing; excessive round-number ' +
    'concentration indicates fabricated transactions, estimated invoices, or deliberate structuring.'),

  m('fa.duplicate_transaction_detection', 'Duplicate Transaction Pattern Detection', 'forensic_accounting',
    ['forensic_accounting', 'data_analysis'],
    'Surface same-amount, same-counterparty, same-date clusters that exceed plausible business repetition. ' +
    'Fabricated transactions are often copy-pasted with minimal variation; ' +
    'true duplicates signal ghost-vendor schemes or inflated revenue streams per ACFE ghost-employee typology.'),

  m('fa.shell_company_financial_signature', 'Shell Company Financial Signature', 'forensic_accounting',
    ['forensic_accounting', 'intelligence'],
    'Recognise the financial fingerprint of shell and shelf companies: minimal payroll expense, ' +
    'high intercompany receivables, no fixed assets, revenues unmatched by VAT filings, ' +
    'and nominee directors with multiple simultaneous directorships across unrelated sectors.'),

  m('fa.transfer_pricing_manipulation', 'Transfer Pricing Manipulation Detection', 'forensic_accounting',
    ['forensic_accounting', 'reasoning'],
    'Assess whether intercompany transactions are priced at arm\'s length per OECD Transfer Pricing ' +
    'Guidelines. Material deviations from CUP, cost-plus, or resale-price methods signal profit ' +
    'shifting to low-tax or secrecy jurisdictions — a key predicate for ML via tax evasion (FATF R.3).'),

  m('fa.revenue_recognition_anomaly', 'Revenue Recognition Anomaly', 'forensic_accounting',
    ['forensic_accounting', 'data_analysis', 'ratiocination'],
    'Detect channel-stuffing and bill-and-hold schemes by comparing end-of-period revenue spikes ' +
    'against inventory and receivables movements. Revenue booked without a corresponding inventory ' +
    'reduction, or reversed in the next period, is a channel-stuffing indicator per PCAOB AS 2401.'),
];

// ── quantum_intelligence (4 new) ──────────────────────────────────────────────
const quantum_intelligence: ReasoningMode[] = [
  m('qi.bayesian_network_fusion', 'Bayesian Network Multi-Factor Fusion', 'synthetic_intelligence',
    ['quantum_intelligence', 'inference', 'synthesis'],
    'Construct a Bayesian network over the observed risk factors; compute joint posterior ' +
    'P(ML | evidence) using variable elimination. Yields calibrated probability of ML activity ' +
    'even when individual factors are weak or correlated, exceeding simple additive scoring systems.'),

  m('qi.ensemble_uncertainty_quantification', 'Ensemble Uncertainty Quantification', 'synthetic_intelligence',
    ['quantum_intelligence', 'introspection', 'data_analysis'],
    'Aggregate outputs from multiple reasoning modes and decompose total uncertainty into epistemic ' +
    '(model uncertainty — reducible with more data) and aleatoric (irreducible noise) components. ' +
    'High epistemic uncertainty requests EDD; high aleatoric signals intrinsic data quality issues.'),

  m('qi.markov_chain_risk_projection', 'Markov Chain Risk State Projection', 'synthetic_intelligence',
    ['quantum_intelligence', 'anticipation', 'inference'],
    'Model the customer risk profile as a Markov chain; estimate the n-step transition probability ' +
    'of moving from current state (standard) to high-risk or sanctions-adjacent states. ' +
    'Identifies latent risk trajectories that point-in-time static scoring systematically misses.'),

  m('qi.entropy_anomaly_detection', 'Entropy-Based Behavioural Anomaly Detection', 'synthetic_intelligence',
    ['quantum_intelligence', 'data_analysis', 'smartness'],
    'Apply Shannon entropy to transaction amount distributions, counterparty graphs, and timing intervals. ' +
    'Abnormally low entropy (stereotyped repetitive behaviour) and abnormally high entropy ' +
    '(chaotic, non-patterned flows) both diverge from legitimate business baselines and warrant scrutiny.'),
];

// ── anticipation (5 new) ──────────────────────────────────────────────────────
const anticipation: ReasoningMode[] = [
  m('an.regulatory_change_impact_assessment', 'Regulatory Change Impact Assessment', 'compliance_framework',
    ['anticipation', 'reasoning', 'ratiocination'],
    'Pre-emptively model how an impending regulatory change (FATF recommendation update, CBUAE circular, ' +
    'new AML/CFT directive) will alter the risk profile of the current customer portfolio. ' +
    'Identify customers who transition from standard to EDD category under the new thresholds before ' +
    'the effective date, enabling proactive file remediation rather than reactive breach remediation.'),

  m('an.network_restructuring_prediction', 'Post-Designation Network Restructuring Prediction', 'network_science',
    ['anticipation', 'intelligence', 'reasoning'],
    'Predict the likely restructuring moves a sanctioned or under-investigation entity will make: ' +
    'new nominee director appointments, fresh SPV incorporations in adjacent jurisdictions, and asset ' +
    'transfers to connected-but-undesignated parties. Proactively flags second-order nodes who are ' +
    'likely to receive assets before formal designation propagates through correspondent networks.'),

  m('an.pre_sanction_positioning_detection', 'Pre-Sanction Asset Positioning Detection', 'geopolitical_risk',
    ['anticipation', 'geopolitical_awareness', 'intelligence'],
    'Detect asset movement and jurisdiction-shift patterns consistent with actors who have advance ' +
    'knowledge of an impending sanctions designation. Typical patterns: rapid real-estate purchases ' +
    'in non-FATF-member jurisdictions, crypto-to-cash conversions at OTC desks, and voluntary ' +
    'dissolution of named corporate entities followed by re-registration under new names.'),

  m('an.seasonal_ml_pattern_forecasting', 'Seasonal ML Pattern Forecasting', 'behavioral_science',
    ['anticipation', 'data_analysis', 'smartness'],
    'Forecast ML risk spikes tied to known seasonal cycles: Ramadan and Hajj cash flows, year-end ' +
    'tax optimisation windows, school fee cycles in UAE (Aug–Sep), Q4 gold price volatility-driven ' +
    'DPMS activity, and major sporting events associated with illegal betting cash surges. ' +
    'Raises pre-emptive alerts before the risk window opens rather than reacting after the spike.'),

  m('an.typology_evolution_tracker', 'Typology Evolution Tracker', 'regulatory_aml',
    ['anticipation', 'intelligence', 'synthesis'],
    'Track how known ML/TF typologies mutate over time in response to enhanced controls and new ' +
    'regulatory requirements. When a known typology is detected, predict its next-generation variant: ' +
    'if smurfing is disrupted by threshold monitoring, the likely successor is MVTS or in-kind transfers; ' +
    'if wire layering is detected, the variant shifts to crypto chain-hopping. ' +
    'Raises proactive detection guidance to stay ahead of typology evolution curves.'),
];

// ── geopolitical_awareness (4 new) ────────────────────────────────────────────
const geopolitical_awareness: ReasoningMode[] = [
  m('ga.dual_use_goods_proliferation_financing', 'Dual-Use Goods Proliferation Financing Detection',
    'geopolitical_risk',
    ['geopolitical_awareness', 'intelligence', 'reasoning'],
    'Detect trade finance transactions involving dual-use goods per EU Regulation 2021/821 and the ' +
    'US Commerce Control List. Combine HS code analysis, declared end-user certificate validation, ' +
    'and shipping route assessment to identify proliferation financing risk — critical for UAE as a ' +
    'major re-export hub under FATF Recommendation 7 (targeted financial sanctions for PF).'),

  m('ga.de_dollarization_cbdc_risk', 'De-Dollarisation and CBDC Sanctions Evasion Risk',
    'geopolitical_risk',
    ['geopolitical_awareness', 'anticipation', 'intelligence'],
    'Monitor exposure to alternative payment systems (mBridge, CIPS, INSTEX) and central bank ' +
    'digital currencies being used to circumvent USD-denominated sanctions enforcement. Assess whether ' +
    'bilateral trade settlements in RMB, INR, or national CBDCs bypass OFAC and EU Council ' +
    'screening channels, representing a structural gap in the international sanctions architecture.'),

  m('ga.bri_project_nexus_assessment', 'Belt and Road Initiative Project Nexus Assessment',
    'geopolitical_risk',
    ['geopolitical_awareness', 'intelligence'],
    'Assess financial flows with a nexus to BRI projects in FATF high-risk jurisdictions. ' +
    'BRI infrastructure financing in Pakistan (CPEC), Central Asia, and Sub-Saharan Africa has been ' +
    'linked to debt-trap diplomacy, inflated contractor invoicing, and state-directed ML channels ' +
    'per UN Office on Drugs and Crime and FATF advisory publications on trade-based ML.'),

  m('ga.crypto_state_actor_evasion', 'State-Actor Cryptocurrency Sanctions Evasion',
    'geopolitical_risk',
    ['geopolitical_awareness', 'intelligence', 'reasoning'],
    'Apply DPRK Lazarus Group, Iranian IRGC, and Russian oligarch crypto evasion typologies from ' +
    'OFAC SDN designations and UN Panel of Experts attribution data. Key patterns: mixer and ' +
    'tumbler usage, multi-hop chain sequences, P2P exchange off-ramps in non-compliant jurisdictions, ' +
    'and OTC desks accepting large crypto-for-cash without CDD — all indicators per OFAC Virtual ' +
    'Currency Advisory and FinCEN FIN-2022-Alert001.'),
];

export const WAVE13_MODES: ReasoningMode[] = [
  ...forensic_accounting,
  ...quantum_intelligence,
  ...anticipation,
  ...geopolitical_awareness,
];

export const WAVE13_OVERRIDES: ReasoningMode[] = [];
