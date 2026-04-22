// Hawkeye Sterling — jurisdiction risk library.
// FATF high-risk + monitored jurisdictions, secrecy-jurisdiction scoring,
// conflict zones, sanctioned-regime proxies. Point-in-time snapshot: consumers
// MUST refresh `asOf` on each FATF plenary (three per year: Feb, Jun, Oct).

export type JurisdictionTier =
  | 'fatf_black'          // Call for Action
  | 'fatf_grey'           // Increased Monitoring
  | 'secrecy_high'        // Top-tier secrecy / tax-haven
  | 'secrecy_moderate'    // Moderate secrecy
  | 'conflict'            // Active conflict / fragile state
  | 'sanctioned_regime'   // Comprehensively sanctioned or proxy-sanctioned
  | 'elevated'            // Other elevated risk (e.g. EU high-risk third country)
  | 'standard';

export interface JurisdictionProfile {
  code: string;              // ISO-3166 alpha-2 (upper-case)
  name: string;
  tiers: JurisdictionTier[];
  riskScore: number;         // 0..1 composite
  notes: string[];
}

export const JURISDICTION_DATA_AS_OF = '2026-01-01';

// FATF Black (Call for Action) — stable through recent plenaries.
const FATF_BLACK: Record<string, string> = {
  KP: 'DPRK (North Korea)',
  IR: 'Iran',
  MM: 'Myanmar',
};

// FATF Grey (Increased Monitoring) — snapshot of recent plenaries. Must be
// refreshed per plenary; the mode using this table flags stale reads.
const FATF_GREY: Record<string, string> = {
  DZ: 'Algeria', AO: 'Angola', BG: 'Bulgaria', BF: 'Burkina Faso',
  CM: 'Cameroon', CI: "Côte d'Ivoire", HR: 'Croatia', CD: 'DRC',
  HT: 'Haiti', KE: 'Kenya', LA: 'Lao PDR', LB: 'Lebanon', ML: 'Mali',
  MC: 'Monaco', MZ: 'Mozambique', NA: 'Namibia', NP: 'Nepal', NG: 'Nigeria',
  PH: 'Philippines', SN: 'Senegal', ZA: 'South Africa', SS: 'South Sudan',
  SY: 'Syria', TZ: 'Tanzania', VE: 'Venezuela', VN: 'Vietnam',
  VG: 'British Virgin Islands', YE: 'Yemen',
};

// High-secrecy / tax-haven jurisdictions — Tax Justice Network FSI top tier +
// classical corporate-secrecy venues. Used by secrecy_jurisdiction_scoring.
const SECRECY_HIGH: Record<string, string> = {
  KY: 'Cayman Islands', VG: 'British Virgin Islands', BM: 'Bermuda',
  BS: 'Bahamas', PA: 'Panama', LI: 'Liechtenstein', SC: 'Seychelles',
  MH: 'Marshall Islands', JE: 'Jersey', GG: 'Guernsey', IM: 'Isle of Man',
  VC: 'Saint Vincent & the Grenadines', AI: 'Anguilla', TC: 'Turks & Caicos',
  CK: 'Cook Islands', NR: 'Nauru', VU: 'Vanuatu', AG: 'Antigua & Barbuda',
  KN: 'Saint Kitts & Nevis', BZ: 'Belize', MU: 'Mauritius', LC: 'Saint Lucia',
  DM: 'Dominica', GI: 'Gibraltar',
};

// Partial-secrecy (significant opacity in specific vehicles) — flagged but
// not treated as top-tier. Includes US state-level vehicles (Delaware LLCs etc).
const SECRECY_MODERATE: Record<string, string> = {
  LU: 'Luxembourg', CH: 'Switzerland', SG: 'Singapore', HK: 'Hong Kong SAR',
  AE: 'United Arab Emirates', MT: 'Malta', CY: 'Cyprus', IE: 'Ireland',
  NL: 'Netherlands', BH: 'Bahrain', LB: 'Lebanon',
  US_DE: 'Delaware (US)', US_NV: 'Nevada (US)', US_WY: 'Wyoming (US)',
};

// Active-conflict / fragile-state set — influences KYC intensity.
const CONFLICT: Record<string, string> = {
  SY: 'Syria', YE: 'Yemen', SO: 'Somalia', AF: 'Afghanistan',
  SS: 'South Sudan', LY: 'Libya', CF: 'Central African Republic',
  SD: 'Sudan', HT: 'Haiti', MM: 'Myanmar',
};

// Comprehensive / sectoral sanctions regimes.
const SANCTIONED_REGIMES: Record<string, string> = {
  KP: 'DPRK comprehensive', IR: 'Iran comprehensive',
  SY: 'Syria comprehensive', CU: 'Cuba comprehensive',
  RU: 'Russia sectoral + EU 14th package', BY: 'Belarus sectoral',
  VE: 'Venezuela sectoral', AF: 'Afghanistan (Taliban)',
  MM: 'Myanmar sectoral', ZW: 'Zimbabwe (limited)',
};

// EU high-risk third countries (Commission Delegated Regulation, running list).
const EU_HIGH_RISK: Record<string, true> = {
  AF:true, BB:true, BF:true, KH:true, KY:true, CD:true, GI:true, HT:true,
  IR:true, JM:true, JO:true, ML:true, MZ:true, MM:true, NI:true, PA:true,
  PH:true, SN:true, SS:true, SY:true, TZ:true, TT:true, UG:true, AE:true,
  VU:true, YE:true, ZW:true,
};

const NAME_MAP: Record<string, string> = {
  ...FATF_BLACK, ...FATF_GREY, ...SECRECY_HIGH, ...SECRECY_MODERATE,
  ...CONFLICT, ...SANCTIONED_REGIMES,
};

export function jurisdictionProfile(rawCode: string): JurisdictionProfile {
  const code = rawCode.trim().toUpperCase();
  const tiers: JurisdictionTier[] = [];
  const notes: string[] = [];
  if (FATF_BLACK[code]) { tiers.push('fatf_black'); notes.push('FATF Call for Action (black list)'); }
  if (FATF_GREY[code]) { tiers.push('fatf_grey'); notes.push('FATF Increased Monitoring (grey list)'); }
  if (SECRECY_HIGH[code]) { tiers.push('secrecy_high'); notes.push('High-secrecy jurisdiction (FSI top tier)'); }
  if (SECRECY_MODERATE[code]) { tiers.push('secrecy_moderate'); notes.push('Moderate secrecy / opacity in specific vehicles'); }
  if (CONFLICT[code]) { tiers.push('conflict'); notes.push('Active conflict / fragile state'); }
  if (SANCTIONED_REGIMES[code]) { tiers.push('sanctioned_regime'); notes.push(`Sanctions exposure: ${SANCTIONED_REGIMES[code]}`); }
  if (EU_HIGH_RISK[code] && !tiers.includes('fatf_black') && !tiers.includes('fatf_grey')) {
    tiers.push('elevated'); notes.push('EU high-risk third country');
  }
  if (tiers.length === 0) tiers.push('standard');

  const weights: Record<JurisdictionTier, number> = {
    fatf_black: 1.0, sanctioned_regime: 0.95, fatf_grey: 0.7,
    conflict: 0.65, secrecy_high: 0.55, elevated: 0.45,
    secrecy_moderate: 0.3, standard: 0.05,
  };
  const riskScore = tiers.reduce((m, t) => Math.max(m, weights[t]), 0);

  return {
    code,
    name: NAME_MAP[code] ?? code,
    tiers,
    riskScore,
    notes,
  };
}

// Walk an ownership / jurisdiction cascade (nationality → residency →
// incorporation → operation → beneficiaries). Returns worst tier reached.
export function jurisdictionCascadeRisk(codes: ReadonlyArray<string | undefined>): {
  worst: JurisdictionProfile;
  chain: JurisdictionProfile[];
  compositeScore: number;
} {
  const chain = codes
    .filter((c): c is string => typeof c === 'string' && c.length > 0)
    .map((c) => jurisdictionProfile(c));
  if (chain.length === 0) {
    const none: JurisdictionProfile = { code: '?', name: 'unknown', tiers: ['standard'], riskScore: 0, notes: ['no jurisdictions supplied'] };
    return { worst: none, chain: [], compositeScore: 0 };
  }
  const worst = chain.reduce((best, p) => (p.riskScore > best.riskScore ? p : best), chain[0]!);
  // Composite: worst wins, but chain length of secrecy hops compounds.
  const secrecyHops = chain.filter((p) => p.tiers.includes('secrecy_high') || p.tiers.includes('secrecy_moderate')).length;
  const composite = Math.min(1, worst.riskScore + 0.05 * Math.max(0, secrecyHops - 1));
  return { worst, chain, compositeScore: composite };
}

export function allFatfBlack(): string[] { return Object.keys(FATF_BLACK); }
export function allFatfGrey(): string[] { return Object.keys(FATF_GREY); }
export function allSecrecyHigh(): string[] { return Object.keys(SECRECY_HIGH); }
export function allSanctionedRegimes(): string[] { return Object.keys(SANCTIONED_REGIMES); }
