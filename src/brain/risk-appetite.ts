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
  | 'data_quality_score';

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
