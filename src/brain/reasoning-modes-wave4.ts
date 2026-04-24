// Wave 4 — predicate-crime, proliferation, correspondent banking, and
// advanced typology reasoning modes. All stub-apply pending Phase 7.

import type {
  BrainContext, Finding, FacultyId, ReasoningCategory, ReasoningMode,
} from './types.js';

const stubApply = (modeId: string, category: ReasoningCategory, faculties: FacultyId[]) =>
  async (_ctx: BrainContext): Promise<Finding> => ({
    modeId,
    category,
    faculties,
    score: 0,
    confidence: 0,
    verdict: 'inconclusive',
    rationale: `[stub] ${modeId} — implementation pending (Phase 7).`,
    evidence: [],
    producedAt: Date.now(),
  });

const m = (
  id: string,
  name: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  description: string,
): ReasoningMode => ({
  id, name, category, faculties, wave: 4 as unknown as 1, description,
  apply: stubApply(id, category, faculties),
});

export const WAVE4_MODES: ReasoningMode[] = [
  // ── PREDICATE CRIME ANALYSIS ─────────────────────────────────────────
  m('predicate_crime_cascade', 'Predicate Crime Cascade', 'predicate_crime', ['reasoning','intelligence'], 'Maps all applicable ML predicate offences under FDL 20/2018 to the evidence set.'),
  m('environmental_predicate', 'Environmental Predicate Assessment', 'predicate_crime', ['reasoning','intelligence'], 'FATF R.3 (2021 revision) — wildlife, timber, fisheries, waste, emissions.'),
  m('tax_evasion_predicate', 'Tax Evasion Predicate', 'predicate_crime', ['reasoning','inference'], 'Determines whether fiscal misconduct crosses the ML predicate threshold.'),
  m('insider_trading_predicate', 'Insider Trading / Market Abuse Predicate', 'predicate_crime', ['reasoning','smartness'], 'Front-running, tipper-tippee, market manipulation as ML predicates.'),
  m('cyber_crime_predicate', 'Cybercrime Predicate', 'predicate_crime', ['reasoning','intelligence'], 'Ransomware, BEC, DDoS extortion, dark-web marketplace proceeds.'),
  m('human_trafficking_predicate', 'Human Trafficking Predicate', 'predicate_crime', ['reasoning','intelligence'], 'Labour exploitation, sex trafficking, smuggling proceeds identification.'),

  // ── PROLIFERATION FINANCING ──────────────────────────────────────────
  m('pf_red_flag_screen', 'Proliferation Financing Red Flag Screen', 'proliferation', ['reasoning','intelligence'], 'FATF R.7 / INR.7 — dual-use goods, front companies, intermediary networks.'),
  m('dual_use_end_user', 'Dual-Use End-User Certificate Verification', 'proliferation', ['reasoning','strong_brain'], 'Validates EUC authenticity for controlled goods under Wassenaar / EAR / ITAR.'),
  m('sanctions_evasion_network', 'Sanctions Evasion Network Mapping', 'proliferation', ['intelligence','reasoning'], 'UN 1718/2231/1267 — shell-company layering, third-country transhipment.'),
  m('ship_flag_hop_analysis', 'Flag-Hop / AIS-Dark Maritime Analysis', 'proliferation', ['intelligence'], 'Ship-to-ship transfers, flag-shopping, AIS transponder manipulation.'),

  // ── CORRESPONDENT BANKING ────────────────────────────────────────────
  m('cbr_risk_matrix', 'Correspondent Banking Risk Matrix', 'correspondent_banking', ['reasoning','strong_brain'], 'FATF R.13 / Wolfsberg — jurisdiction, product, client, volume risk composite.'),
  m('nested_account_detection', 'Nested Account Detection', 'correspondent_banking', ['reasoning','intelligence'], 'Identifies sub-accounts operated through respondent access without direct CBR.'),
  m('payable_through_account', 'Payable-Through Account Assessment', 'correspondent_banking', ['reasoning'], 'PTA / pass-through structure risk — direct customer access to nostro.'),
  m('cbr_due_diligence_cascade', 'CBR Due Diligence Cascade (Wolfsberg)', 'correspondent_banking', ['reasoning','strong_brain'], 'Steps through Wolfsberg CBDDQ — AML programme, sanctions, PEP, STR.'),

  // ── HAWALA / IVT ─────────────────────────────────────────────────────
  m('hawala_network_map', 'Hawala / IVT Network Mapping', 'hawala_ivt', ['reasoning','intelligence'], 'Reconstructs broker-hawaladar chains and settlement patterns.'),
  m('settlement_commodity_flow', 'Commodity Settlement Identification', 'hawala_ivt', ['reasoning','intelligence'], 'Gold, DPMS, or commodity leg used as IVT settlement instrument.'),
  m('value_equivalence_check', 'Cross-Market Value Equivalence Check', 'hawala_ivt', ['reasoning','inference'], 'Tests whether two-leg IVT flows offset at market rates or premium.'),

  // ── FREE TRADE ZONE ──────────────────────────────────────────────────
  m('ftz_opacity_screen', 'FTZ Opacity Screen', 'ftz_risk', ['reasoning','intelligence'], 'Identifies under-regulated FTZ usage: phantom re-exports, transshipment, misdeclaration.'),
  m('re_export_discrepancy', 'Re-Export Documentation Discrepancy', 'ftz_risk', ['reasoning','inference'], 'HS code mismatches, value gaps, and entity inconsistencies in re-export chains.'),

  // ── VIRTUAL ASSET ADVANCED ───────────────────────────────────────────
  m('travel_rule_gap_analysis', 'Travel Rule Gap Analysis (FATF R.16)', 'crypto_defi', ['reasoning','strong_brain'], 'Identifies originator/beneficiary data missing in VA transfers above threshold.'),
  m('crypto_ransomware_cashout', 'Ransomware Cash-Out Pattern', 'crypto_defi', ['intelligence','smartness'], 'Chain-hop, mixer, P2P, OTC cash-out sequences following ransomware event.'),
  m('p2p_exchange_risk', 'P2P Exchange Risk Assessment', 'crypto_defi', ['reasoning','intelligence'], 'Non-custodial P2P platforms — KYC gap, volume limits, fiat on-ramp risk.'),

  // ── PROFESSIONAL ML ──────────────────────────────────────────────────
  m('professional_ml_ecosystem', 'Professional ML Ecosystem Mapping', 'professional_ml', ['intelligence','reasoning'], 'Lawyer, accountant, notary, company-formation agent complicity indicators.'),
  m('invoice_fabrication_pattern', 'Invoice Fabrication Pattern', 'professional_ml', ['reasoning','smartness'], 'Round-tripping, fictitious services, inflated consulting invoices.'),
  m('funnel_mule_cascade', 'Funnel Account / Mule Cascade Analysis', 'professional_ml', ['reasoning','intelligence'], 'Sequential mule-hop pattern, rapid funds dispersion, layering velocity.'),

  // ── GOVERNANCE & REGULATORY ──────────────────────────────────────────
  m('vara_rulebook_check', 'VARA Rulebook Compliance Check', 'regulatory_aml', ['reasoning','strong_brain'], 'Maps VASP activity against VARA Rulebook chapter-by-chapter obligations.'),
  m('pdpl_data_minimisation', 'PDPL Data-Minimisation Test', 'regulatory_aml', ['reasoning'], 'FDL 45/2021 Art.4 — proportionality of personal data processed vs stated purpose.'),
  m('ewra_scoring_calibration', 'EWRA Scoring Calibration', 'regulatory_aml', ['reasoning','strong_brain'], 'Validates inherent-risk and control-effectiveness scores against CBUAE benchmark.'),
  m('goaml_schema_preflight', 'goAML Schema Pre-Flight', 'regulatory_aml', ['reasoning','strong_brain'], 'Validates STR/FFR XML payload against UAEFIU goAML schema before submission.'),
];

export const WAVE4_OVERRIDES: ReasoningMode[] = [];
