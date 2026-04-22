// Hawkeye Sterling — retention-policy calculator.
// Statutory minimum: 5 years (FDL 10/2025 Art.24). Internal policy: 10 years.
// Certain record classes have longer holds (regulator investigation, STR
// filing, FFR / PNMR filings).

export type RecordClass =
  | 'cdd_customer_file'
  | 'transaction_log'
  | 'screening_evidence'
  | 'str_filing'
  | 'sar_filing'
  | 'ffr_filing'
  | 'pnmr_filing'
  | 'mlro_decision'
  | 'training_record'
  | 'audit_report'
  | 'regulator_correspondence'
  | 'adverse_media_evidence'
  | 'lbma_oecd_provenance'
  | 'incident_report';

export interface RetentionRule {
  recordClass: RecordClass;
  anchor: 'end_of_relationship' | 'filing_date' | 'creation_date' | 'incident_date';
  statutoryYears: number;
  internalYears: number;
  permanentHoldTriggers: string[];
  regulatoryAnchor: string;
}

export const RETENTION_RULES: RetentionRule[] = [
  { recordClass: 'cdd_customer_file', anchor: 'end_of_relationship', statutoryYears: 5, internalYears: 10, permanentHoldTriggers: ['regulator_investigation', 'litigation_hold'], regulatoryAnchor: 'FDL 10/2025 Art.24' },
  { recordClass: 'transaction_log', anchor: 'creation_date', statutoryYears: 5, internalYears: 10, permanentHoldTriggers: ['regulator_investigation', 'litigation_hold'], regulatoryAnchor: 'FDL 10/2025 Art.24' },
  { recordClass: 'screening_evidence', anchor: 'creation_date', statutoryYears: 5, internalYears: 10, permanentHoldTriggers: ['regulator_investigation'], regulatoryAnchor: 'FDL 10/2025 Art.24' },
  { recordClass: 'str_filing', anchor: 'filing_date', statutoryYears: 5, internalYears: 10, permanentHoldTriggers: ['regulator_investigation'], regulatoryAnchor: 'FATF R.11; FDL 10/2025 Art.24' },
  { recordClass: 'sar_filing', anchor: 'filing_date', statutoryYears: 5, internalYears: 10, permanentHoldTriggers: ['regulator_investigation'], regulatoryAnchor: 'FATF R.11; FDL 10/2025 Art.24' },
  { recordClass: 'ffr_filing', anchor: 'filing_date', statutoryYears: 10, internalYears: 10, permanentHoldTriggers: ['sanctions_still_in_force'], regulatoryAnchor: 'CR 74/2020' },
  { recordClass: 'pnmr_filing', anchor: 'filing_date', statutoryYears: 5, internalYears: 10, permanentHoldTriggers: [], regulatoryAnchor: 'CR 74/2020' },
  { recordClass: 'mlro_decision', anchor: 'creation_date', statutoryYears: 5, internalYears: 10, permanentHoldTriggers: ['regulator_investigation'], regulatoryAnchor: 'FDL 10/2025' },
  { recordClass: 'training_record', anchor: 'creation_date', statutoryYears: 3, internalYears: 5, permanentHoldTriggers: [], regulatoryAnchor: 'FATF R.18' },
  { recordClass: 'audit_report', anchor: 'creation_date', statutoryYears: 5, internalYears: 10, permanentHoldTriggers: ['regulator_investigation'], regulatoryAnchor: 'Three Lines Model' },
  { recordClass: 'regulator_correspondence', anchor: 'creation_date', statutoryYears: 5, internalYears: 10, permanentHoldTriggers: ['regulator_investigation'], regulatoryAnchor: 'FDL 10/2025' },
  { recordClass: 'adverse_media_evidence', anchor: 'creation_date', statutoryYears: 5, internalYears: 10, permanentHoldTriggers: [], regulatoryAnchor: 'FDL 10/2025' },
  { recordClass: 'lbma_oecd_provenance', anchor: 'creation_date', statutoryYears: 5, internalYears: 10, permanentHoldTriggers: [], regulatoryAnchor: 'LBMA RGG; OECD DDG' },
  { recordClass: 'incident_report', anchor: 'incident_date', statutoryYears: 5, internalYears: 10, permanentHoldTriggers: ['regulator_investigation'], regulatoryAnchor: 'FDL 10/2025' },
];

export interface RetentionDecision {
  recordClass: RecordClass;
  earliestDestroyUtc?: string | undefined;
  onHold: boolean;
  rationale: string;
}

export function retentionFor(
  recordClass: RecordClass,
  anchorDate: Date,
  holdTriggers: string[] = [],
  internalPolicyYears = 10,
): RetentionDecision {
  const rule = RETENTION_RULES.find((r) => r.recordClass === recordClass);
  if (!rule) {
    return { recordClass, earliestDestroyUtc: undefined, onHold: false, rationale: 'record class not in registry; default to 10 years' };
  }
  const hold = rule.permanentHoldTriggers.some((t) => holdTriggers.includes(t));
  if (hold) {
    return { recordClass, onHold: true, rationale: `on permanent hold due to: ${holdTriggers.join(', ')}` };
  }
  const years = Math.max(rule.statutoryYears, rule.internalYears, internalPolicyYears);
  const d = new Date(anchorDate.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return {
    recordClass,
    earliestDestroyUtc: d.toISOString(),
    onHold: false,
    rationale: `retain for ${years} years from ${rule.anchor} (${rule.regulatoryAnchor})`,
  };
}
