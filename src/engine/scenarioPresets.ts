export type ScenarioWave = 1 | 2;

export interface ScenarioPreset {
  id: string;
  wave: ScenarioWave;
}

export const SCENARIO_PRESETS_WAVE_1 = [
  'dpms_retail_micro_structure', 'dpms_retail_expatriate_cash',
  'bullion_wholesale_loco_split', 'bullion_dore_drc_asm',
  'vasp_sanctioned_wallet', 'vasp_mixer_inbound',
  'tbml_over_invoice_textile', 'pep_domestic_minister',
  'sanc_eu_vs_ofac_conflict', 'ubo_multi_jur_cascade',
  'npo_charity_conflict_zone', 'cb_cash_60k_arrival',
  'corresp_nested_bank_flow',
] as const;

export const SCENARIO_PRESETS_WAVE_2 = [
  'tf_lc_discrep', 'tf_sblc_draw_chain', 're_cash_villa',
  're_goldenvisa_invest', 'ins_life_surrender_cash', 'fo_pep_patriarch',
  'lux_art_private_sale', 'pay_msb_agent_onboard', 'fund_capital_call_source',
  'market_insider_trade', 'fraud_bec_redirect', 'ops_alert_backlog',
  'mlro_str_draft_review', 'audit_lookback_sample', 'incident_lessons',
] as const;

export type ScenarioPresetIdWave1 = typeof SCENARIO_PRESETS_WAVE_1[number];
export type ScenarioPresetIdWave2 = typeof SCENARIO_PRESETS_WAVE_2[number];
export type ScenarioPresetId = ScenarioPresetIdWave1 | ScenarioPresetIdWave2;

export const SCENARIO_PRESETS: readonly ScenarioPreset[] = [
  ...SCENARIO_PRESETS_WAVE_1.map((id) => ({ id, wave: 1 as const })),
  ...SCENARIO_PRESETS_WAVE_2.map((id) => ({ id, wave: 2 as const })),
];

export const SCENARIO_PRESET_IDS: readonly ScenarioPresetId[] = SCENARIO_PRESETS.map((s) => s.id);

export function isScenarioPresetId(id: string): id is ScenarioPresetId {
  return (SCENARIO_PRESET_IDS as readonly string[]).includes(id);
}
