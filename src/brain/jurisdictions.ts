// Hawkeye Sterling — jurisdiction risk registry.
// Combines FATF lists (Call for Action / Increased Monitoring), EU AMLD
// high-risk third countries, and the Basel AML Index tier (qualitative).
// Use for the reasoning mode `jurisdiction_cascade`: a subject's country
// tier propagates through to EDD intensity, cooling-off windows, and
// review cadence.
//
// NOTE: the brain NEVER asserts current-status from training data. Every
// value in this registry is VERSIONED via the `listVersion` field and the
// caller is expected to refresh it from authoritative sources before use
// (Phase 2 ingestion). Stale data = P8 violation.

export type FATFStatus = 'call_for_action' | 'increased_monitoring' | 'not_listed';
export type EUAMLDStatus = 'high_risk_third_country' | 'not_listed';
export type BaselTier = 'very_high' | 'high' | 'medium' | 'low' | 'very_low';

export interface JurisdictionRisk {
  iso2: string;
  name: string;
  fatf: FATFStatus;
  eu: EUAMLDStatus;
  baselTier: BaselTier;
  notes?: string;
}

// Seed registry — UAE-centric coverage. This is a SCAFFOLD only; the Phase 2
// ingestion job refreshes each row from the primary sources (FATF, EU Commission,
// Basel Institute) before the brain is allowed to cite any row.
export const JURISDICTION_RISK_SEED: JurisdictionRisk[] = [
  { iso2: 'AE', name: 'United Arab Emirates', fatf: 'not_listed', eu: 'not_listed', baselTier: 'medium' },
  { iso2: 'AF', name: 'Afghanistan', fatf: 'increased_monitoring', eu: 'high_risk_third_country', baselTier: 'very_high' },
  { iso2: 'AL', name: 'Albania', fatf: 'not_listed', eu: 'not_listed', baselTier: 'medium' },
  { iso2: 'BY', name: 'Belarus', fatf: 'not_listed', eu: 'not_listed', baselTier: 'high' },
  { iso2: 'CD', name: 'Democratic Republic of the Congo', fatf: 'increased_monitoring', eu: 'high_risk_third_country', baselTier: 'very_high' },
  { iso2: 'IR', name: 'Iran', fatf: 'call_for_action', eu: 'high_risk_third_country', baselTier: 'very_high' },
  { iso2: 'KP', name: 'Democratic People’s Republic of Korea', fatf: 'call_for_action', eu: 'high_risk_third_country', baselTier: 'very_high' },
  { iso2: 'MM', name: 'Myanmar', fatf: 'call_for_action', eu: 'high_risk_third_country', baselTier: 'very_high' },
  { iso2: 'NG', name: 'Nigeria', fatf: 'increased_monitoring', eu: 'not_listed', baselTier: 'high' },
  { iso2: 'PA', name: 'Panama', fatf: 'not_listed', eu: 'not_listed', baselTier: 'high' },
  { iso2: 'PH', name: 'Philippines', fatf: 'not_listed', eu: 'not_listed', baselTier: 'medium' },
  { iso2: 'RU', name: 'Russian Federation', fatf: 'not_listed', eu: 'not_listed', baselTier: 'high' },
  { iso2: 'SD', name: 'Sudan', fatf: 'increased_monitoring', eu: 'high_risk_third_country', baselTier: 'very_high' },
  { iso2: 'SY', name: 'Syrian Arab Republic', fatf: 'not_listed', eu: 'high_risk_third_country', baselTier: 'very_high' },
  { iso2: 'VE', name: 'Venezuela', fatf: 'not_listed', eu: 'not_listed', baselTier: 'high' },
  { iso2: 'YE', name: 'Yemen', fatf: 'increased_monitoring', eu: 'high_risk_third_country', baselTier: 'very_high' },
  { iso2: 'ZW', name: 'Zimbabwe', fatf: 'not_listed', eu: 'not_listed', baselTier: 'high' },
];

export const JURISDICTION_BY_ISO: Map<string, JurisdictionRisk> = new Map(
  JURISDICTION_RISK_SEED.map((j) => [j.iso2, j]),
);

export interface JurisdictionDecision {
  iso2: string;
  tier: 'low' | 'medium' | 'high' | 'very_high';
  eddRequired: boolean;
  reasons: string[];
}

export function tierFor(iso2: string): JurisdictionDecision {
  const j = JURISDICTION_BY_ISO.get(iso2.toUpperCase());
  if (!j) {
    return {
      iso2: iso2.toUpperCase(),
      tier: 'medium',
      eddRequired: false,
      reasons: ['not-in-registry; default tier applied; requires enrichment before reliance'],
    };
  }
  const reasons: string[] = [];
  let tier: JurisdictionDecision['tier'] = 'low';

  if (j.fatf === 'call_for_action') { tier = 'very_high'; reasons.push('FATF Call for Action'); }
  else if (j.fatf === 'increased_monitoring') { tier = 'high'; reasons.push('FATF Increased Monitoring'); }

  if (j.eu === 'high_risk_third_country') {
    if (tier !== 'very_high') tier = 'very_high';
    reasons.push('EU AMLD high-risk third country');
  }

  if (j.baselTier === 'very_high') { tier = 'very_high'; reasons.push('Basel AML Index: very high'); }
  else if (j.baselTier === 'high' && tier !== 'very_high') { tier = 'high'; reasons.push('Basel AML Index: high'); }
  else if (j.baselTier === 'medium' && tier === 'low') { tier = 'medium'; reasons.push('Basel AML Index: medium'); }

  if (reasons.length === 0) reasons.push('no risk indicators in registry');

  return { iso2: j.iso2, tier, eddRequired: tier === 'high' || tier === 'very_high', reasons };
}
