export type QuestionWave = 1 | 2;

export interface QuestionTemplate {
  id: string;
  wave: QuestionWave;
}

export const QUESTION_TEMPLATES_WAVE_1 = [
  'cdd_prospect_individual', 'cdd_prospect_entity', 'edd_sow_scope',
  'sanc_partial_match_decision', 'ubo_25_threshold', 'ubo_effective_control',
  'ubo_nominee_directors', 'ubo_bearer_shares', 'dpms_retail_threshold',
  'dpms_refiner_cahra', 'vasp_wallet_screen', 'vasp_travel_rule',
  'tbml_over_invoicing', 'tbml_phantom_shipment', 'gov_policy_gap',
  'filing_str_narrative', 'incident_24h_freeze', 'pf_dual_use_controls',
  'cash_courier_ctn',
] as const;

export const QUESTION_TEMPLATES_WAVE_2 = [
  'tf_lc_ucp600', 'tf_standby_lc', 're_cash_purchase', 're_goldenvisa_invest',
  'ins_life_surrender', 'ins_pep_life', 'fo_single_family', 'fo_ptc',
  'lux_art_dealer', 'pay_msb_onboard', 'fund_capital_call', 'market_insider',
  'fraud_bec', 'ops_alert_triage', 'mlro_str_review', 'audit_lookback',
] as const;

export type QuestionTemplateIdWave1 = typeof QUESTION_TEMPLATES_WAVE_1[number];
export type QuestionTemplateIdWave2 = typeof QUESTION_TEMPLATES_WAVE_2[number];
export type QuestionTemplateId = QuestionTemplateIdWave1 | QuestionTemplateIdWave2;

export const QUESTION_TEMPLATES: readonly QuestionTemplate[] = [
  ...QUESTION_TEMPLATES_WAVE_1.map((id) => ({ id, wave: 1 as const })),
  ...QUESTION_TEMPLATES_WAVE_2.map((id) => ({ id, wave: 2 as const })),
];

export const QUESTION_TEMPLATE_IDS: readonly QuestionTemplateId[] = QUESTION_TEMPLATES.map((q) => q.id);

export function isQuestionTemplateId(id: string): id is QuestionTemplateId {
  return (QUESTION_TEMPLATE_IDS as readonly string[]).includes(id);
}
