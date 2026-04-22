// Hawkeye Sterling — data-quality rule registry.
// Rules the brain runs against ingested records (customers, transactions,
// lists, evidence) before they are allowed to influence disposition. Each
// rule has a dimension (completeness / validity / consistency / timeliness
// / uniqueness / accuracy), a severity, and the reasoning mode that cites
// it in narratives.

export type DqDimension = 'completeness' | 'validity' | 'consistency' | 'timeliness' | 'uniqueness' | 'accuracy';

export interface DqRule {
  id: string;
  dimension: DqDimension;
  target: string;          // dot-path into the record
  test: 'required' | 'format' | 'range' | 'crossfield' | 'fresher_than' | 'unique' | 'enum';
  parameters: Record<string, string | number | string[]>;
  severity: 'low' | 'medium' | 'high';
  reasoningModes: string[];
}

export const DQ_RULES: DqRule[] = [
  { id: 'dq_cust_name', dimension: 'completeness', target: 'customer.legalName', test: 'required', parameters: {}, severity: 'high', reasoningModes: ['completeness_audit'] },
  { id: 'dq_cust_dob', dimension: 'completeness', target: 'customer.dateOfBirth', test: 'required', parameters: {}, severity: 'medium', reasoningModes: ['completeness_audit'] },
  { id: 'dq_cust_nat', dimension: 'validity', target: 'customer.nationality', test: 'format', parameters: { pattern: '^[A-Z]{2}$' }, severity: 'medium', reasoningModes: ['schema_drift_detection'] },
  { id: 'dq_cust_tax_res', dimension: 'validity', target: 'customer.taxResidency', test: 'format', parameters: { pattern: '^[A-Z]{2}$' }, severity: 'low', reasoningModes: ['schema_drift_detection'] },
  { id: 'dq_trx_amount_positive', dimension: 'validity', target: 'transaction.amount', test: 'range', parameters: { min: 0 }, severity: 'high', reasoningModes: ['reconciliation'] },
  { id: 'dq_trx_currency_enum', dimension: 'validity', target: 'transaction.currency', test: 'enum', parameters: { values: ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'QAR', 'OMR', 'BHD', 'KWD'] }, severity: 'medium', reasoningModes: ['schema_drift_detection'] },
  { id: 'dq_trx_freshness', dimension: 'timeliness', target: 'transaction.ingestedAt', test: 'fresher_than', parameters: { maxAgeHours: 24 }, severity: 'high', reasoningModes: ['freshness_sla_breach'] },
  { id: 'dq_list_version_date', dimension: 'timeliness', target: 'list.versionDate', test: 'fresher_than', parameters: { maxAgeHours: 24 }, severity: 'high', reasoningModes: ['freshness_sla_breach'] },
  { id: 'dq_cust_unique_id', dimension: 'uniqueness', target: 'customer.primaryId', test: 'unique', parameters: { scope: 'global' }, severity: 'high', reasoningModes: ['entity_resolution', 'reconciliation'] },
  { id: 'dq_evidence_sha256', dimension: 'accuracy', target: 'evidence.sha256', test: 'required', parameters: {}, severity: 'medium', reasoningModes: ['tamper_detection'] },
  { id: 'dq_cross_customer_tx', dimension: 'consistency', target: 'transaction.customerId', test: 'crossfield', parameters: { mustExistIn: 'customer.primaryId' }, severity: 'high', reasoningModes: ['reconciliation'] },
  { id: 'dq_list_source_hash', dimension: 'accuracy', target: 'list.rawHash', test: 'required', parameters: {}, severity: 'high', reasoningModes: ['tamper_detection'] },
  { id: 'dq_cust_email_fmt', dimension: 'validity', target: 'customer.email', test: 'format', parameters: { pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' }, severity: 'low', reasoningModes: ['schema_drift_detection'] },
  { id: 'dq_cust_phone_fmt', dimension: 'validity', target: 'customer.phone', test: 'format', parameters: { pattern: '^\\+?[0-9\\-\\s]{6,20}$' }, severity: 'low', reasoningModes: ['schema_drift_detection'] },
  { id: 'dq_ubo_sum', dimension: 'consistency', target: 'entity.ubo.sharePercent', test: 'crossfield', parameters: { constraint: 'sum_less_than_or_equal_100' }, severity: 'medium', reasoningModes: ['ubo_tree_walk'] },
];

export const DQ_RULE_BY_ID: Map<string, DqRule> = new Map(DQ_RULES.map((r) => [r.id, r]));
