// Hawkeye Sterling — Multi-Jurisdiction STR Obligation Matrix (Wave 14 Feature 10).
// Static regulatory data: per-jurisdiction STR/SAR filing obligations.
// Updated when regulations change. No LLM required — pure regulatory knowledge.

export type ObligationType = 'mandatory' | 'discretionary' | 'prohibited' | 'not_applicable';
export type TippingOffScope = 'broad' | 'narrow' | 'none';

export interface JurisdictionObligation {
  jurisdiction: string;
  obligationType: ObligationType;
  filingDeadlineHours: number | null;
  competentAuthority: string;
  filingSystem: string;
  goAmlEntityIdFormat: string | null;
  legalBasis: string[];
  tippingOffProhibitionScope: TippingOffScope;
  confidentialityRegime: string;
  amountThresholdUsd: number | null;
}

export type ConflictType =
  | 'simultaneous_filing_required'
  | 'one_requires_other_prohibits'
  | 'deadline_mismatch'
  | 'tipping_off_scope_conflict';

export interface ObligationConflict {
  conflictType: ConflictType;
  jurisdictions: [string, string];
  resolution: string;
  regulatoryGuidance: string;
  articleCitations: string[];
}

export const STR_OBLIGATION_MATRIX: Record<string, JurisdictionObligation> = {
  UAE: {
    jurisdiction: 'UAE',
    obligationType: 'mandatory',
    filingDeadlineHours: 48,  // 2 business days
    competentAuthority: 'UAE AMLSCU (Anti-Money Laundering and Counter-Terrorism Financing Supervisory Authority)',
    filingSystem: 'goAML UAE',
    goAmlEntityIdFormat: 'FSRA/CBUAE 8-digit licence number or TRN (Tax Registration Number)',
    legalBasis: [
      'UAE FDL 10/2025 Art.17 (STR obligation)',
      'UAE FDL 10/2025 Art.25 (tipping-off prohibition)',
      'Cabinet Resolution 134/2025 Art.22',
      'CBUAE AML/CFT Standards §6.2',
    ],
    tippingOffProhibitionScope: 'broad',
    confidentialityRegime: 'Criminal liability for disclosure of STR filing (FDL 10/2025 Art.25)',
    amountThresholdUsd: null,  // Suspicion-based, no monetary threshold
  },
  FATF: {
    jurisdiction: 'FATF',
    obligationType: 'mandatory',
    filingDeadlineHours: null,  // "promptly" — no fixed deadline
    competentAuthority: 'National FIU (Financial Intelligence Unit)',
    filingSystem: 'goAML (UNODC reference implementation)',
    goAmlEntityIdFormat: 'National business registration number per jurisdiction',
    legalBasis: [
      'FATF Recommendation 20 (suspicious transaction reporting)',
      'FATF Recommendation 21 (tipping-off and confidentiality)',
    ],
    tippingOffProhibitionScope: 'narrow',
    confidentialityRegime: 'Confidentiality of STR filing. No disclosure to subject.',
    amountThresholdUsd: null,
  },
  EU: {
    jurisdiction: 'EU',
    obligationType: 'mandatory',
    filingDeadlineHours: 72,
    competentAuthority: 'National FIU (varies by member state)',
    filingSystem: 'goAML EU (harmonised under 6AMLD)',
    goAmlEntityIdFormat: 'EU Business Registration Number or LEI (Legal Entity Identifier)',
    legalBasis: [
      'EU 6AMLD Art.36 (suspicious transaction reporting)',
      'EU 6AMLD Art.38 (tipping-off prohibition)',
      'EU 6AMLD Art.40 (confidentiality)',
      'EU AMLD4 Art.33 (transposed in member state law)',
    ],
    tippingOffProhibitionScope: 'narrow',
    confidentialityRegime: 'Professional privilege and legal professional privilege carve-outs per national law.',
    amountThresholdUsd: null,
  },
  UK: {
    jurisdiction: 'UK',
    obligationType: 'mandatory',
    filingDeadlineHours: 168,  // "as soon as practicable" — 7 days practical standard
    competentAuthority: 'National Crime Agency (NCA) Financial Intelligence Unit',
    filingSystem: 'SARS Online (UK SAR system)',
    goAmlEntityIdFormat: 'Companies House Registration Number (CRN) or FCA Firm Reference Number (FRN)',
    legalBasis: [
      'UK Proceeds of Crime Act 2002 (POCA) s.330 (failure to disclose)',
      'UK POCA 2002 s.333A (tipping-off)',
      'UK POCA 2002 s.337 (authorised disclosures — defence)',
      'UK Terrorism Act 2000 s.19',
    ],
    tippingOffProhibitionScope: 'broad',
    confidentialityRegime: 'Legal professional privilege under POCA 2002 s.330(6). Strict no-disclosure otherwise.',
    amountThresholdUsd: null,
  },
  US: {
    jurisdiction: 'US',
    obligationType: 'mandatory',
    filingDeadlineHours: 720,  // 30 calendar days (60 if no subject identified)
    competentAuthority: 'FinCEN (Financial Crimes Enforcement Network)',
    filingSystem: 'FinCEN SAR (BSA E-Filing System)',
    goAmlEntityIdFormat: 'EIN (Employer Identification Number) or SSN for individuals',
    legalBasis: [
      '31 USC §5318(g) (suspicious activity reporting)',
      '31 CFR 1020.320 (SAR filing rules for banks)',
      'FinCEN SAR Activity Review 2023',
    ],
    tippingOffProhibitionScope: 'narrow',
    confidentialityRegime: 'Safe harbour protection for good-faith SAR filers (31 USC §5318(g)(3)).',
    amountThresholdUsd: 5000,  // Transactions involving $5,000 or more
  },
};

export function applicableJurisdictions(
  subjectJurisdiction?: string,
  transactionJurisdictions: string[] = [],
): string[] {
  const jurisdictions = new Set<string>();
  const all = [subjectJurisdiction, ...transactionJurisdictions].filter(Boolean) as string[];

  for (const j of all) {
    const upper = j.toUpperCase();
    // Map country codes to obligation matrix keys
    if (['AE', 'UAE', 'DUBAI', 'ABU DHABI'].includes(upper)) jurisdictions.add('UAE');
    if (upper === 'GB' || upper === 'UK' || upper === 'UNITED KINGDOM') jurisdictions.add('UK');
    if (upper === 'US' || upper === 'USA' || upper === 'UNITED STATES') jurisdictions.add('US');
    // EU member states
    const EU_MEMBERS = new Set(['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'PL', 'SE', 'AT', 'DK',
      'FI', 'PT', 'GR', 'CZ', 'HU', 'RO', 'SK', 'BG', 'HR', 'SI', 'LT', 'LV', 'EE', 'LU', 'MT', 'CY', 'IE']);
    if (EU_MEMBERS.has(upper)) jurisdictions.add('EU');
  }

  // Always include FATF (it's the baseline)
  jurisdictions.add('FATF');
  return Array.from(jurisdictions);
}
