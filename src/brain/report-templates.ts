// Hawkeye Sterling — governance report templates.
// Typed shapes for the recurring governance reports. Templates are
// declarative; assembly lives with the narrative composer.

export interface BoardMiReport {
  period: string;          // e.g. '2026-Q1'
  metrics: {
    customersOnboarded: number;
    customersExited: number;
    highRiskShare: number;
    pepShare: number;
    strFiled: number;
    sarFiled: number;
    ffrFiled: number;
    pnmrFiled: number;
    openHighPriorityAlerts: number;
    alertBacklogAgingDays: number;
    trainingOverdueShare: number;
    screeningFreshnessHours: number;
    dataQualityScore: number;
    fourEyesViolations: number;
    sanctionsRegimeChanges: number;
    openAuditFindings: number;
    openIncidents: number;
  };
  appetiteBreaches: Array<{ dimension: string; observed: number | string; breached: boolean }>;
  attestation: {
    mlro: string;
    seniorMgmt: string;
    generatedAt: string;
    charterIntegrityHash: string;
  };
}

export interface FiuQuarterlyReport {
  period: string;
  filings: {
    str: number;
    sar: number;
    ffr: number;
    pnmr: number;
  };
  frozenAssetsAed: number;
  openInvestigations: number;
  commentary: string[];
  attestation: { mlro: string; generatedAt: string; charterIntegrityHash: string };
}

export interface MlroAnnualReport {
  year: number;
  programmeMaturity: 'initial' | 'developing' | 'defined' | 'managed' | 'optimising';
  topRisks: string[];
  topControls: string[];
  keyIncidents: Array<{ incidentId: string; severity: string; lessonsLearned: string }>;
  trainingCoverage: number;
  auditFindings: { opened: number; closed: number; carried: number };
  boardPresentationDates: string[];
  attestation: { mlro: string; senior: string; generatedAt: string; charterIntegrityHash: string };
}

export interface SanctionsLookbackReport {
  windowStart: string;
  windowEnd: string;
  entitiesReviewed: number;
  missesFound: Array<{ entityId: string; missedList: string; daysUndetected: number; remediation: string }>;
  controlChanges: string[];
  attestation: { mlro: string; generatedAt: string; charterIntegrityHash: string };
}

export const REPORT_TEMPLATE_IDS = [
  'board_mi_quarterly',
  'fiu_quarterly',
  'mlro_annual',
  'sanctions_lookback',
] as const;
export type ReportTemplateId = typeof REPORT_TEMPLATE_IDS[number];
