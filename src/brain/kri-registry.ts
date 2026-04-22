// Hawkeye Sterling — Key Risk Indicator registry.
// KRIs are the forward-looking metrics a board / MLRO / senior management
// watches. Each KRI binds to a signal, a direction, a green/amber/red band,
// and the risk-appetite dimension it maps to.

export interface KriBand {
  green: [number, number];
  amber: [number, number];
  red: [number, number];
}

export type KriDirection = 'lower_better' | 'higher_better';

export interface Kri {
  id: string;
  label: string;
  signalId: string;
  direction: KriDirection;
  unit: string;
  band: KriBand;
  appetiteDimension?: string;
}

export const KRIS: Kri[] = [
  { id: 'kri_screening_freshness_hours', label: 'Screening freshness (hours)', signalId: 's_cust_screening_hours_since_last', direction: 'lower_better', unit: 'hours', band: { green: [0, 24], amber: [24, 48], red: [48, Infinity] }, appetiteDimension: 'screening_freshness_days' },
  { id: 'kri_high_risk_country_share', label: 'High-risk country exposure share', signalId: 's_cust_tax_residency_highrisk', direction: 'lower_better', unit: '%', band: { green: [0, 5], amber: [5, 10], red: [10, 100] }, appetiteDimension: 'high_risk_country_exposure' },
  { id: 'kri_pep_share', label: 'PEP share', signalId: 's_cust_is_pep', direction: 'lower_better', unit: '%', band: { green: [0, 3], amber: [3, 5], red: [5, 100] }, appetiteDimension: 'pep_exposure' },
  { id: 'kri_cash_intensity', label: 'Cash-transaction share (DPMS volume)', signalId: 's_tx_amount_aed', direction: 'lower_better', unit: '%', band: { green: [0, 15], amber: [15, 30], red: [30, 100] }, appetiteDimension: 'cash_intensity' },
  { id: 'kri_ubo_opacity_avg', label: 'Average UBO opacity', signalId: 's_cust_ubo_opacity', direction: 'lower_better', unit: 'score', band: { green: [0, 0.2], amber: [0.2, 0.4], red: [0.4, 1] }, appetiteDimension: 'ubo_opacity' },
  { id: 'kri_structuring_window_count', label: 'Near-threshold transaction clusters', signalId: 's_tx_structuring_window_count', direction: 'lower_better', unit: 'count', band: { green: [0, 1], amber: [1, 3], red: [3, Infinity] } },
  { id: 'kri_mixer_exposure_hops', label: 'Minimum mixer-hop distance', signalId: 's_wallet_mixer_hops', direction: 'higher_better', unit: 'hops', band: { green: [3, Infinity], amber: [2, 3], red: [0, 2] }, appetiteDimension: 'vasp_mixer_exposure' },
  { id: 'kri_training_overdue', label: 'Staff with overdue AML training', signalId: 's_sys_brain_version', direction: 'lower_better', unit: '%', band: { green: [0, 2], amber: [2, 5], red: [5, 100] }, appetiteDimension: 'training_overdue' },
  { id: 'kri_four_eyes_violations', label: 'Four-eyes / SoD violations', signalId: 's_sys_brain_version', direction: 'lower_better', unit: 'count/month', band: { green: [0, 0], amber: [0, 1], red: [1, Infinity] }, appetiteDimension: 'four_eyes_violation_rate' },
  { id: 'kri_str_sla_breaches', label: 'STR SLA breaches', signalId: 's_sys_brain_version', direction: 'lower_better', unit: '%', band: { green: [0, 1], amber: [1, 3], red: [3, 100] }, appetiteDimension: 'str_filing_sla_breach_rate' },
  { id: 'kri_ffr_sla_breaches', label: 'FFR SLA breaches', signalId: 's_sys_brain_version', direction: 'lower_better', unit: 'count', band: { green: [0, 0], amber: [0, 1], red: [1, Infinity] }, appetiteDimension: 'ffr_filing_sla_breach_rate' },
  { id: 'kri_data_quality', label: 'Customer-master data quality', signalId: 's_sys_brain_version', direction: 'higher_better', unit: 'score', band: { green: [95, 100], amber: [90, 95], red: [0, 90] }, appetiteDimension: 'data_quality_score' },
  { id: 'kri_alert_backlog_days', label: 'High-priority alert backlog (days)', signalId: 's_sys_brain_version', direction: 'lower_better', unit: 'days', band: { green: [0, 3], amber: [3, 7], red: [7, Infinity] } },
  { id: 'kri_cahra_without_docs', label: 'CAHRA inputs accepted without OECD docs', signalId: 's_sys_brain_version', direction: 'lower_better', unit: 'count', band: { green: [0, 0], amber: [0, 1], red: [1, Infinity] }, appetiteDimension: 'cahra_supply_chain_exposure' },
];

export const KRI_BY_ID: Map<string, Kri> = new Map(KRIS.map((k) => [k.id, k]));

export function classifyKri(kri: Kri, observed: number): 'green' | 'amber' | 'red' {
  const inBand = (v: number, band: [number, number]) => v >= band[0] && v < band[1];
  if (inBand(observed, kri.band.green)) return 'green';
  if (inBand(observed, kri.band.amber)) return 'amber';
  return 'red';
}
