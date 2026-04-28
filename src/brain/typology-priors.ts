// Hawkeye Sterling — typology-prior catalogue.
//
// Calibrated baseline probabilities for each typology, expressed as P(H_t) —
// the prior probability that a randomly sampled subject in scope is engaged
// in the typology absent any evidence. These priors feed `bayesUpdate()`
// (./bayesian-update.ts) as the starting point before likelihood-ratio
// updates from observed evidence.
//
// Charter P9: priors are explicit, named, and citable. They are NOT secret
// model weights — they reflect open-source typology-base-rate research from
// FATF, Wolfsberg, regional FIU statistics, and Chainalysis / Elliptic
// crypto-crime reports.
//
// Calibration notes
//   - Most typologies sit in the 0.5–3 % range: the brain is screening
//     subjects already filtered by prior intake risk-scoring, so true
//     positives are rare but non-trivial.
//   - PEP and sanctions-evasion priors are higher because subjects in those
//     queues are already pre-flagged.
//   - AI-governance and AI-synthetic-media-fraud priors are conservative
//     pending more public-domain incident data.
//
// Engineering note: the priors are EXPLICIT here rather than embedded in
// `bayesian-update.ts` so they can be audited, A/B tuned, and cited in the
// methodology line of any verdict that consumes them. Override at call site
// via `priorFor(id, override)`; never mutate this map at runtime.

import type { TypologyId } from './typologies.js';

const DEFAULT_PRIOR = 0.01;

export const TYPOLOGY_PRIORS: Readonly<Partial<Record<TypologyId, number>>> = Object.freeze({
  // — Retail / cash-channel base rates
  structuring: 0.030,
  smurfing: 0.015,
  cash_courier: 0.010,
  cash_intensive_business: 0.020,
  funnel_account: 0.022,

  // — Trade / TBML
  tbml: 0.018,
  tbml_phantom_shipment: 0.008,
  invoice_fraud: 0.012,
  invoice_discounting_fraud: 0.010,
  customs_fraud: 0.014,
  daigou_parallel_import: 0.006,
  construction_ml: 0.012,

  // — Sanctions / proliferation (pre-filtered queue: higher base rate)
  sanctions_evasion: 0.060,
  proliferation: 0.020,
  maritime_stss: 0.012,
  arms_trafficking: 0.008,

  // — PEP / kleptocracy (pre-filtered queue)
  pep: 0.080,
  pep_rca: 0.040,
  kleptocracy: 0.012,

  // — Corporate opacity
  shell_company_chain: 0.030,
  nominee_directors: 0.020,
  bearer_share_fz_loophole: 0.020,
  correspondent_banking: 0.008,
  correspondent_shell: 0.006,
  legal_services_ml: 0.010,
  professional_money_laundering: 0.012,

  // — DPMS & precious metals (UAE focus)
  dpms_retail: 0.025,
  dpms_refinery: 0.015,
  bullion_wholesale: 0.012,
  precious_stones: 0.010,

  // — Crypto / VASP
  vasp: 0.045,
  mixer_usage: 0.015,
  privacy_coin_laundering: 0.010,
  nft_wash_trade: 0.020,
  defi_exploit: 0.005,
  crypto_ransomware: 0.008,
  crypto_p2p_exchange: 0.020,
  crypto_onramp_obfuscation: 0.018,
  virtual_iban_abuse: 0.012,

  // — Predicate offences
  human_trafficking: 0.004,
  wildlife_trafficking: 0.003,
  narcotics_trafficking: 0.012,
  environmental_crime: 0.008,
  carbon_market_fraud: 0.005,
  tax_evasion_offshore: 0.025,
  npo_diversion: 0.006,
  hawala_network: 0.020,

  // — Fraud variants
  market_manipulation: 0.008,
  insider_trading: 0.005,
  advance_fee_fraud: 0.010,
  bec_fraud: 0.018,
  ponzi_pyramid: 0.006,
  phoenix_company: 0.008,
  romance_fraud: 0.009,
  social_media_investment_fraud: 0.012,
  loan_stacking: 0.014,
  bust_out_fraud: 0.009,
  payroll_fraud: 0.007,
  healthcare_billing_fraud: 0.008,

  // — High-value goods / lifestyle
  real_estate_cash: 0.015,
  real_estate_over_valuation: 0.008,
  art_dealer: 0.005,
  yacht_jet: 0.004,
  family_office: 0.010,
  insurance_wrap: 0.006,
  fund_capital_call: 0.008,
  luxury_goods_ml: 0.010,
  gambling_ml: 0.010,

  // — Identity & synthetic
  synthetic_identity: 0.012,

  // — AI / governance (sparse base-rate data)
  ai_governance_breach: 0.025,
  ai_synthetic_media_fraud: 0.008,
  insider_threat: 0.006,

  // — Adverse-media surface (used only for adverse-media-derived findings)
  cyber_extortion: 0.008,
});

/** Resolve the prior for a typology with an optional override.
 *  Falls back to DEFAULT_PRIOR (1 %) if the id is not registered, so callers
 *  never crash on new typology ids and the absence of a calibrated prior is
 *  surfaced as a small, conservative number rather than zero. */
export function priorFor(id: TypologyId, override?: number): number {
  if (typeof override === 'number' && override >= 0 && override <= 1) return override;
  const p = TYPOLOGY_PRIORS[id];
  return typeof p === 'number' ? p : DEFAULT_PRIOR;
}

/** Returns true iff the typology has an explicit calibrated prior. Useful
 *  for the audit chain to flag verdicts that fell through to the default. */
export function hasCalibratedPrior(id: TypologyId): boolean {
  return typeof TYPOLOGY_PRIORS[id] === 'number';
}
