// Hawkeye Sterling — STR / SAR narrative skeletons per typology.
// Every skeleton is observable-facts only (charter P3). Placeholders use
// {{braces}}. The MLRO replaces placeholders + edits for context; the
// observable-facts linter scans the output before submission.

export interface StrSkeleton {
  typology: string;
  title: string;
  bullets: string[];      // observable-fact bullets (ordered)
  requiredCitations: string[]; // reasoning-mode ids / red-flag ids that must be cited
}

export const STR_SKELETONS: StrSkeleton[] = [
  {
    typology: 'structuring',
    title: 'Cash deposits below reporting threshold — structuring indicator',
    bullets: [
      'Subject {{NAME}} deposited cash on {{N}} occasions within a {{WINDOW_DAYS}}-day window.',
      'Each deposit was below the DPMS / banking reporting threshold ({{THRESHOLD}}).',
      'Deposits were made at {{BRANCH_COUNT}} branches across {{CITY_COUNT}} cities.',
      'No commercial rationale for the pattern was provided when queried on {{QUERY_DATE}}.',
    ],
    requiredCitations: ['velocity_analysis', 'spike_detection', 'rf_structuring_threshold'],
  },
  {
    typology: 'tbml',
    title: 'Over-invoicing indicator in trade-finance transaction',
    bullets: [
      'Invoice {{INVOICE_ID}} records a unit price of {{UNIT_PRICE}} for HS code {{HS_CODE}}.',
      'Global trade benchmark for same HS code in {{PERIOD}} ranged {{BENCH_LOW}}–{{BENCH_HIGH}}.',
      'Delta is {{DELTA_PCT}}%; outside the benchmark band.',
      'Vessel AIS shows {{AIS_GAP_HOURS}} hours of signal loss during declared route.',
    ],
    requiredCitations: ['tbml_over_invoicing', 'commodity_price_anomaly', 'vessel_ais_gap_analysis', 'rfx_tf_unit_price_outlier'],
  },
  {
    typology: 'sanctions_evasion',
    title: 'Indicators of sanctions evasion via nominee-shell structure',
    bullets: [
      'Counterparty {{ENTITY}} was registered {{DAYS_OLD}} days prior to the transaction.',
      'Declared directors are listed as nominees in {{NOMINEE_REGISTRY}}.',
      'Beneficial ownership is not disclosed; ownership chain terminates in {{OPAQUE_JURISDICTION}}.',
      'Transaction routing includes {{HOP_COUNT}} intermediaries in differing jurisdictions.',
    ],
    requiredCitations: ['ubo_nominee_directors', 'jurisdiction_cascade', 'entity_resolution', 'rfx_sanc_shell_chain' as string],
  },
  {
    typology: 'vasp',
    title: 'Inbound crypto from mixer / privacy protocol',
    bullets: [
      'Inbound transaction {{TX_HASH}} received {{AMOUNT}} {{ASSET}} on {{TIMESTAMP}}.',
      'Source wallet cluster has {{HOP_COUNT}}-hop exposure to a known mixer protocol.',
      'Travel-rule originator data was missing / partial ({{TR_FIELDS_MISSING}}).',
      'Subject account onboarded {{DAYS_ACTIVE}} days ago; prior activity {{PRIOR_VOLUME}}.',
    ],
    requiredCitations: ['mixer_forensics', 'vasp_travel_rule', 'rfx_vasp_mixer'],
  },
  {
    typology: 'pep',
    title: 'PEP wealth inconsistent with declared source',
    bullets: [
      'Subject {{NAME}} holds the public role {{ROLE}} since {{ROLE_START}}.',
      'Declared source of wealth: {{SOW_DECLARED}}.',
      'Public-salary benchmark for the role + tenure: {{SALARY_BENCHMARK}}.',
      'Observed wealth indicators: {{OBSERVED_ASSETS}} — materially above benchmark by {{MULTIPLE}}x.',
    ],
    requiredCitations: ['pep_domestic_minister', 'narrative_coherence', 'source_triangulation', 'rfx_pep_wealth_mismatch' as string],
  },
  {
    typology: 'bec_fraud',
    title: 'Business Email Compromise — bank-details redirect',
    bullets: [
      'Invoice {{INVOICE_ID}} was received from email {{DOMAIN}} resembling supplier {{KNOWN_SUPPLIER}}.',
      'Domain was registered {{DOMAIN_AGE_DAYS}} days prior to the invoice.',
      'Bank details changed from {{OLD_IBAN}} to {{NEW_IBAN}} in the invoice.',
      'Payment release was requested {{HOURS_FROM_ISSUANCE}} hours after invoice receipt.',
    ],
    requiredCitations: ['typosquat_domain_detection', 'invoice_redirection_trace', 'rfx_bec_typosquat_invoice'],
  },
  {
    typology: 'real_estate',
    title: 'Real-estate cash purchase via opaque buyer',
    bullets: [
      'Property at {{ADDRESS}} purchased on {{DATE}} for {{PRICE}} {{CURRENCY}}.',
      'Buyer is entity {{ENTITY}} incorporated in {{JURISDICTION}} with no market nexus.',
      'Payment was settled in cash / cash-equivalent.',
      'Beneficial ownership of buyer is not disclosed; declared directors are nominees.',
    ],
    requiredCitations: ['re_cash_purchase_check', 're_shell_owner_check', 'rfx_re_cash_closure', 'rfx_re_opaque_buyer'],
  },
  {
    typology: 'dpms_refinery',
    title: 'CAHRA-sourced doré without OECD documentation',
    bullets: [
      'Refinery accepted doré lot {{LOT_ID}} declared origin {{COUNTRY}} (CAHRA).',
      'OECD DDG Annex II evidence was not attached at acceptance.',
      'Assay comparison {{ASSAY_VS_REFINERY_DELTA}} vs. certificate.',
      'Chain-of-custody documents show gap between {{GAP_FROM}} and {{GAP_TO}}.',
    ],
    requiredCitations: ['oecd_annex_ii_discipline', 'provenance_trace', 'chain_of_custody_break', 'rfx_bullion_cahra_undocumented'],
  },
];
