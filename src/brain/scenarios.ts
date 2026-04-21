// Hawkeye Sterling — scenario preset registry.
// Named AML/CFT/sanctions/PEP/adverse-media scenarios with narrative, bound template,
// and expected-flag profile. Used for regression testing, training, and live demo.

import type { Scenario } from './types.js';

const s = (
  id: string,
  name: string,
  domain: string,
  narrative: string,
  templateId: string | undefined,
  expectedFlags: string[],
): Scenario => ({
  id, name, domain, narrative, expectedFlags,
  ...(templateId ? { templateId } : {}),
});

export const SCENARIOS: Scenario[] = [
  // ─── WAVE 1 ─────────────────────────────────────────────────────────
  s('dpms_retail_micro_structure', 'DPMS — Retail Micro-Structuring', 'dpms',
    'Same retail buyer splits a single gold purchase across three consecutive days, each below AED 55,000, paid in cash, no KYC triggered under the naive threshold.',
    'dpms_retail_threshold',
    ['structuring','threshold_avoidance','kyc_gap']),

  s('dpms_retail_expatriate_cash', 'DPMS — Expatriate Cash Buyer', 'dpms',
    'Newly arrived expatriate pays AED 180k cash for investment-grade bars; declared SoF is "savings"; no tax/bank proofs offered.',
    'dpms_retail_threshold',
    ['sow_unverified','cash_intensive','adverse_profile_mismatch']),

  s('bullion_wholesale_loco_split', 'Bullion — Loco-Split Delivery', 'dpms',
    'Refined bars ordered in Dubai, split-delivered Loco Zurich and Loco London across two buyers with linked UBOs.',
    undefined,
    ['ubo_linked_parties','jurisdiction_split','typology_match']),

  s('bullion_dore_drc_asm', 'Bullion — DRC ASM Doré', 'dpms',
    'Doré shipments declared as Ugandan-origin but customs paperwork traces back to DRC artisanal mines in a CAHRA.',
    'dpms_refiner_cahra',
    ['cahra_exposure','provenance_mismatch','lbma_step_gap']),

  s('vasp_sanctioned_wallet', 'VASP — Sanctioned Wallet Direct Inflow', 'vasp',
    'Incoming transfer of 2.1 BTC from a wallet labelled by at least two chain-analytics vendors as OFAC-designated.',
    'vasp_wallet_screen',
    ['sanctions_match','taint_direct','block_candidate']),

  s('vasp_mixer_inbound', 'VASP — Mixer Inbound', 'vasp',
    'Deposit 0.8 BTC from a wallet with 3-hop exposure to a coin-mixer; user claims "privacy preference".',
    'vasp_wallet_screen',
    ['mixer_exposure','high_taint','edd_trigger']),

  s('tbml_over_invoice_textile', 'TBML — Textile Over-Invoicing', 'tbml',
    'Bulk polyester invoiced at 4× fair-market band, shipped Jebel Ali → Hong Kong, paid via correspondent in third country.',
    'tbml_over_invoicing',
    ['price_anomaly','third_country_payment','ucp_doc_risk']),

  s('pep_domestic_minister', 'PEP — Domestic Minister', 'pep',
    'Prospect is the sister of a sitting cabinet minister; proposed relationship: private banking; SoW: inheritance.',
    undefined,
    ['pep_family','edd_required','senior_approval']),

  s('sanc_eu_vs_ofac_conflict', 'Sanctions — EU vs OFAC Conflict', 'sanctions',
    'Counterparty lawful under EU regime but designated by OFAC; EU blocking statute may apply.',
    'sanc_partial_match_decision',
    ['regime_conflict','legal_opinion_required']),

  s('ubo_multi_jur_cascade', 'UBO — Multi-Jurisdiction Cascade', 'ubo',
    'Five-layer chain: BVI → Cayman → Panama → UAE Free Zone → mainland LLC, with nominees at layer 3.',
    'ubo_25_threshold',
    ['layered_chain','nominee_risk','opacity_high']),

  s('npo_charity_conflict_zone', 'NPO — Charity to Conflict Zone', 'tf',
    'Registered UAE charity remits aid into a conflict region; counterparty is a local unregistered foundation.',
    undefined,
    ['tf_exposure','edd_required','aid_diversion_risk']),

  s('cb_cash_60k_arrival', 'Cash — AED 60k Arrival Declaration', 'cash',
    'Traveller declares AED 60k on arrival; stated purpose: "business reserves"; no receipts; repeated monthly pattern.',
    'cash_courier_ctn',
    ['structuring_suspect','pattern_of_life','edd_required']),

  s('corresp_nested_bank_flow', 'Correspondent — Nested Bank Flow', 'corresp',
    'Respondent bank routes USD traffic via correspondent on behalf of its own respondents (downstream nesting) without disclosure.',
    undefined,
    ['nested_correspondent','transparency_gap','wolfsberg_breach']),

  // ─── WAVE 2 ─────────────────────────────────────────────────────────
  s('tf_lc_discrep', 'TF — LC Discrepancy Chain', 'tf',
    'Documentary credit presentation with four discrepancies across BL, insurance, commercial invoice; waiver sought from applicant.',
    'tf_lc_ucp600',
    ['doc_discrepancy','waiver_pattern','ucp_breach']),

  s('tf_sblc_draw_chain', 'TF — SBLC Draw Chain', 'tf',
    'Standby drawn on counter-guarantee which itself sits on a second SBLC; underlying obligation unclear.',
    'tf_standby_lc',
    ['chain_obscurity','underlying_weakness']),

  s('re_cash_villa', 'RE — Cash Villa Purchase', 're',
    'AED 11M villa settled cash across 4 tranches via exchange houses; buyer declares inheritance.',
    're_cash_purchase',
    ['cash_intensive','sow_weak','structuring_suspect']),

  s('re_goldenvisa_invest', 'RE — Golden-Visa Property Investment', 're',
    'Investor purchases AED 2M property to qualify for residency, via a corporate vehicle with opaque UBO.',
    're_goldenvisa_invest',
    ['ubo_opacity','threshold_compliance_check']),

  s('ins_life_surrender_cash', 'Insurance — Life Surrender to Cash', 'ins',
    'Single-premium life policy surrendered at 18 months, proceeds paid to third party account in a different jurisdiction.',
    'ins_life_surrender',
    ['rapid_surrender','third_party_payout','layering_typology']),

  s('fo_pep_patriarch', 'Family Office — PEP Patriarch', 'fo',
    'Multi-branch family office ultimately controlled by a PEP patriarch; one branch runs politically-exposed mandates.',
    'fo_single_family',
    ['pep_control','related_party_risk','governance_gap']),

  s('lux_art_private_sale', 'Luxury — Art Private Sale', 'lux',
    'Old Master sold privately through a dealer in a free-port; anonymous buyer SPV; no public provenance.',
    'lux_art_dealer',
    ['anonymity','provenance_gap','free_port_risk']),

  s('pay_msb_agent_onboard', 'Payments — MSB Agent Onboarding', 'pay',
    'MSB seeks to onboard 14 new agents in rapid batch; two share directors with a previously-terminated agent.',
    'pay_msb_onboard',
    ['connected_agents','control_gap']),

  s('fund_capital_call_source', 'Fund — Capital Call LP SoW', 'fund',
    'Capital call funded from an LP SPV whose banker declines to share SoW evidence citing confidentiality.',
    'fund_capital_call',
    ['sow_refused','LP_opacity','edd_required']),

  s('market_insider_trade', 'Market — Insider Trade Window', 'market',
    'Cluster of accounts, all linked via a single lawyer, buy within 48h of a confidential M&A filing.',
    'market_insider',
    ['pre_announcement_trade','cluster_pattern','information_leak']),

  s('fraud_bec_redirect', 'Fraud — BEC Invoice Redirect', 'fraud',
    'Long-standing vendor emails a one-character-different domain instructing payment to a new IBAN mid-engagement.',
    'fraud_bec',
    ['domain_lookalike','payment_redirect','control_bypass']),

  s('ops_alert_backlog', 'Ops — Alert Backlog', 'ops',
    '2,400 open alerts, average age 41 days, SLA breach on 37%; staffing flat for 9 months.',
    'ops_alert_triage',
    ['sla_breach','backlog_risk','capacity_gap']),

  s('mlro_str_draft_review', 'MLRO — STR Draft Review', 'mlro',
    'Draft STR names party but omits typology, weights on circumstantial observations only.',
    'mlro_str_review',
    ['narrative_weak','typology_missing','rework_required']),

  s('audit_lookback_sample', 'Audit — Lookback Sample', 'audit',
    'Lookback sample of 120 high-risk files; 18 have UBO gaps, 5 missed sanctions hits under old list version.',
    'audit_lookback',
    ['systemic_ubo_gap','historical_miss','remediation_trigger']),

  s('incident_lessons', 'Incident — Lessons Learned', 'incident',
    'Post-incident review 6 weeks late; some controls adjusted informally; no tabletop since.',
    undefined,
    ['post_mortem_overdue','informal_change','exercise_gap']),
];

export const SCENARIO_BY_ID: Map<string, Scenario> = new Map(
  SCENARIOS.map((s) => [s.id, s]),
);
