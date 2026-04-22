// Hawkeye Sterling — UAE-DPMS threshold registry.
// Named, versioned thresholds. Every threshold carries its regulatory anchor
// so the brain can cite the source when a limit fires.

export type Currency = 'AED' | 'USD' | 'EUR' | 'XAU_OZ';

export interface Threshold {
  id: string;
  label: string;
  amount: number;
  currency: Currency;
  scope: string;
  action: string;
  regulatoryAnchor: string;
  effectiveFrom?: string;
  notes?: string;
}

export const THRESHOLDS: Threshold[] = [
  {
    id: 'dpms_cash_transaction',
    label: 'DPMS cash transaction threshold',
    amount: 55_000,
    currency: 'AED',
    scope: 'Single cash transaction or multiple linked cash transactions with a DPMS.',
    action: 'Report to FIU via goAML; mandatory KYC and retention.',
    regulatoryAnchor: 'MoE DNFBP circulars; FATF R.22',
  },
  {
    id: 'ctn_incoming_passenger',
    label: 'Cross-border currency / NI declaration (inbound passenger)',
    amount: 60_000,
    currency: 'AED',
    scope: 'Currency + negotiable instruments entering UAE via passenger.',
    action: 'CDCC declaration mandatory; undeclared → seizure + penalty.',
    regulatoryAnchor: 'UAE Customs CDCC regulation',
  },
  {
    id: 'ubo_beneficial_ownership',
    label: 'Beneficial-ownership disclosure threshold',
    amount: 25,
    currency: 'AED',
    scope: 'Any natural person holding ≥25% equity / voting in an entity must be identified as UBO.',
    action: 'Identify + verify UBO; document rationale for effective-control-only UBOs.',
    regulatoryAnchor: 'FATF R.24; UAE Cabinet Resolution on UBO',
    notes: 'Percentage threshold, not a currency amount.',
  },
  {
    id: 'str_reporting_obligation',
    label: 'STR reporting obligation',
    amount: 0,
    currency: 'AED',
    scope: 'Any suspicion regardless of amount.',
    action: 'File STR via goAML within statutory deadline; no tipping-off.',
    regulatoryAnchor: 'FDL 20/2018 Art.15 / FDL 10/2025',
  },
  {
    id: 'ffr_freeze_window',
    label: 'Funds Freeze Report window',
    amount: 24,
    currency: 'AED',
    scope: 'Hours between confirmed EOCN / UN / UAE Local sanctions match and freeze.',
    action: 'Freeze without delay; complete FFR submission within 5 business days.',
    regulatoryAnchor: 'Cabinet Decision 74/2020 Art.4-7',
    notes: 'Expressed in hours for parity; currency field unused.',
  },
  {
    id: 'edd_threshold_pep',
    label: 'PEP EDD trigger',
    amount: 0,
    currency: 'AED',
    scope: 'Any prospect or customer identified as PEP or RCA.',
    action: 'Senior management approval + source-of-wealth + enhanced monitoring.',
    regulatoryAnchor: 'FATF R.12; Wolfsberg FAQ',
  },
  {
    id: 'high_risk_country_edd',
    label: 'High-risk country EDD trigger',
    amount: 0,
    currency: 'AED',
    scope: 'Customer / transaction nexus with FATF Call for Action / Increased Monitoring country.',
    action: 'Mandatory EDD; board-level approval for onboarding; transaction monitoring uplift.',
    regulatoryAnchor: 'FATF R.19',
  },
  {
    id: 'retention_minimum',
    label: 'Minimum record retention',
    amount: 5,
    currency: 'AED',
    scope: 'Years of retention after end of customer relationship or transaction.',
    action: 'Retain; do not destroy before minimum elapsed.',
    regulatoryAnchor: 'FDL 10/2025 Art.24',
    notes: 'Years; currency field unused. Internal policy: 10 years.',
  },
  {
    id: 'retention_internal',
    label: 'Internal policy retention',
    amount: 10,
    currency: 'AED',
    scope: 'Years of retention under internal DPMS policy.',
    action: 'Retain; ranked above the statutory 5-year minimum.',
    regulatoryAnchor: 'Internal policy',
  },
];

export const THRESHOLD_BY_ID: Map<string, Threshold> = new Map(
  THRESHOLDS.map((t) => [t.id, t]),
);
