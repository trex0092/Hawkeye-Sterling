// Hawkeye Sterling — quantified risk-appetite registry.
// Per-dimension thresholds the firm declares as "this is the risk we are
// willing to take". Breaches surface as governance red flags. Charter P9
// requires every score to expose its inputs + weights — appetite values
// expose the LIMITS those scores are tested against.

export type AppetiteDimension =
  | 'sanctions_exposure'
  | 'pep_exposure'
  | 'high_risk_country_exposure'
  | 'cash_intensity'
  | 'cahra_supply_chain_exposure'
  | 'vasp_mixer_exposure'
  | 'ubo_opacity'
  | 'training_overdue'
  | 'screening_freshness_days'
  | 'four_eyes_violation_rate'
  | 'str_filing_sla_breach_rate'
  | 'ffr_filing_sla_breach_rate'
  | 'data_quality_score'
  | 'npo_exposure'
  | 'unregulated_vasp_exposure'
  | 'adverse_media_unresolved_rate'
  | 'edd_overdue_rate'
  | 'anonymous_transaction_rate'
  | 'cross_border_cash_exposure'
  | 'insider_access_anomaly_rate'
  | 'model_drift_score';

export type AppetiteOperator = '<=' | '>=' | '<' | '>' | '==' | 'in';

export interface AppetiteThreshold {
  dimension: AppetiteDimension;
  label: string;
  operator: AppetiteOperator;
  value: number | string | string[];
  unit?: string;
  rationale: string;
  breachAction: 'monitor' | 'escalate' | 'block' | 'board_review';
}

export const RISK_APPETITE: AppetiteThreshold[] = [
  { dimension: 'sanctions_exposure', label: 'Confirmed sanctions hit count', operator: '==', value: 0, rationale: 'Zero tolerance for confirmed sanctioned counterparties.', breachAction: 'block' },
  { dimension: 'pep_exposure', label: 'PEP customers as % of book', operator: '<=', value: 5, unit: '%', rationale: 'Capped to keep EDD workload sustainable.', breachAction: 'escalate' },
  { dimension: 'high_risk_country_exposure', label: 'High-risk country exposure as % of revenue', operator: '<=', value: 10, unit: '%', rationale: 'Limit FATF Increased-Monitoring-jurisdiction concentration.', breachAction: 'escalate' },
  { dimension: 'cash_intensity', label: 'Cash transactions as % of DPMS volume', operator: '<=', value: 30, unit: '%', rationale: 'Above this threshold, structuring risk dominates.', breachAction: 'escalate' },
  { dimension: 'cahra_supply_chain_exposure', label: 'Refinery inputs from active CAHRA without OECD docs', operator: '==', value: 0, rationale: 'Zero tolerance — LBMA RGG + OECD DDG mandate.', breachAction: 'block' },
  { dimension: 'vasp_mixer_exposure', label: 'Direct mixer-sourced inbound transactions', operator: '==', value: 0, rationale: 'Zero tolerance for direct mixer exposure.', breachAction: 'block' },
  { dimension: 'ubo_opacity', label: 'Opacity score on onboarded relationships', operator: '<=', value: 0.4, rationale: 'Beyond this, beneficial ownership is too obscure to satisfy R.24.', breachAction: 'escalate' },
  { dimension: 'training_overdue', label: 'Staff with AML training overdue', operator: '<=', value: 2, unit: '%', rationale: 'Training gaps degrade detection.', breachAction: 'escalate' },
  { dimension: 'screening_freshness_days', label: 'Screening freshness', operator: '<=', value: 1, unit: 'days', rationale: 'Charter P8 — stale data is inadmissible.', breachAction: 'escalate' },
  { dimension: 'four_eyes_violation_rate', label: 'Four-eyes / SoD violations', operator: '==', value: 0, rationale: 'Zero tolerance — CR 134/2025 Art.19.', breachAction: 'block' },
  { dimension: 'str_filing_sla_breach_rate', label: 'STR filing SLA breaches', operator: '<=', value: 1, unit: '%', rationale: 'Repeat breaches indicate process failure.', breachAction: 'board_review' },
  { dimension: 'ffr_filing_sla_breach_rate', label: 'FFR filing SLA breaches (24h freeze, 5bd file)', operator: '==', value: 0, rationale: 'Zero tolerance — CR 74/2020 Art.4-7.', breachAction: 'board_review' },
  { dimension: 'data_quality_score', label: 'Customer-master data quality', operator: '>=', value: 95, rationale: 'Below this, screening is unreliable.', breachAction: 'escalate' },
  { dimension: 'npo_exposure', label: 'NPO / charity relationships as % of book', operator: '<=', value: 3, unit: '%', rationale: 'NPOs carry elevated TF risk; FATF R.8 requires proportionate control uplift.', breachAction: 'escalate' },
  { dimension: 'unregulated_vasp_exposure', label: 'Transactions with unregulated or un-licensed VASPs', operator: '==', value: 0, rationale: 'Unregistered VASPs fall outside FATF travel-rule scope — zero tolerance.', breachAction: 'block' },
  { dimension: 'adverse_media_unresolved_rate', label: 'Open adverse-media findings unresolved > 5 business days', operator: '<=', value: 5, unit: '%', rationale: 'Unresolved hits degrade ongoing monitoring obligations.', breachAction: 'escalate' },
  { dimension: 'edd_overdue_rate', label: 'High-risk customer EDD reviews overdue > 30 days', operator: '==', value: 0, rationale: 'Any overdue EDD on a high-risk customer creates a redline exposure.', breachAction: 'board_review' },
  { dimension: 'anonymous_transaction_rate', label: 'Transactions with no identifiable originator or beneficiary', operator: '==', value: 0, rationale: 'FATF R.16 prohibits anonymous wire transfers; zero tolerance.', breachAction: 'block' },
  { dimension: 'cross_border_cash_exposure', label: 'Cross-border cash declarations missing or incomplete (DPMS)', operator: '==', value: 0, rationale: 'Cross-border cash declarations are mandatory under FDL 20/2018 Art.18.', breachAction: 'block' },
  { dimension: 'insider_access_anomaly_rate', label: 'Privileged-user access anomalies unresolved per quarter', operator: '<=', value: 0, rationale: 'Any unresolved insider-access anomaly must trigger a SIEM investigation.', breachAction: 'escalate' },
  { dimension: 'model_drift_score', label: 'AI / rules-engine model drift score (normalised 0–1)', operator: '<=', value: 0.15, rationale: 'Model drift above 0.15 degrades screening accuracy below acceptable AUC threshold.', breachAction: 'board_review' },
];

export interface AppetiteEvaluation {
  dimension: AppetiteDimension;
  observed: number | string;
  threshold: AppetiteThreshold;
  breached: boolean;
  margin?: number | undefined;
}

export function evaluateAppetite(
  dimension: AppetiteDimension,
  observed: number | string,
): AppetiteEvaluation | undefined {
  const t = RISK_APPETITE.find((a) => a.dimension === dimension);
  if (!t) return undefined;
  let breached = false;
  let margin: number | undefined;
  if (typeof observed === 'number' && typeof t.value === 'number') {
    margin = observed - t.value;
    switch (t.operator) {
      case '<=': breached = observed > t.value; break;
      case '<':  breached = observed >= t.value; break;
      case '>=': breached = observed < t.value; break;
      case '>':  breached = observed <= t.value; break;
      case '==': breached = observed !== t.value; break;
    }
  } else if (t.operator === 'in' && Array.isArray(t.value)) {
    breached = !(t.value as string[]).includes(String(observed));
  } else if (t.operator === '==') {
    breached = String(observed) !== String(t.value);
  }
  return { dimension, observed, threshold: t, breached, margin };
}
