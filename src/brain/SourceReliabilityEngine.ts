// Hawkeye Sterling — source credibility and reliability engine.
// Assigns reliability scores to adverse-media sources so downstream
// scoring can weight evidence appropriately. A single-source finding
// from a tabloid is weighted less than a multi-source finding from a
// regulator and two major wire agencies.
//
// Score is 0..1. Sources ≥ 0.90 are treated as authoritative.

export type SourceTier =
  | 'tier1_government'      // regulators, court records, official government
  | 'tier1_international'   // UN, FATF, World Bank, IMF
  | 'tier2_wire'            // Reuters, Bloomberg, AP, AFP
  | 'tier2_financial_press' // FT, WSJ, Economist, Bloomberg News
  | 'tier3_news'            // established national newspapers
  | 'tier4_regional'        // regional/local press
  | 'tier5_unverified'      // blogs, social media, unknown origin
  | 'tier_interpol'         // Interpol notices
  | 'tier_ngo'              // Transparency International, OCCRP, ACAMS, FATF';

export interface SourceProfile {
  id: string;
  name: string;
  domain?: string;
  tier: SourceTier;
  baseReliability: number;   // 0..1
  jurisdiction?: string;     // ISO 3166-1 alpha-2
  languages: string[];       // ISO 639-1
  isOfficial: boolean;
  isPaywalled: boolean;
  hasBylineVerification: boolean;
  specialties: string[];     // 'sanctions', 'enforcement', 'courts', etc.
}

// ── Source registry ───────────────────────────────────────────────────────────

export const SOURCE_REGISTRY: SourceProfile[] = [
  // ── Government / Regulatory (tier1_government) ───────────────────────────
  { id: 'ofac', name: 'OFAC', domain: 'ofac.treasury.gov', tier: 'tier1_government', baseReliability: 1.00, jurisdiction: 'US', languages: ['en'], isOfficial: true, isPaywalled: false, hasBylineVerification: true, specialties: ['sanctions', 'enforcement'] },
  { id: 'sec', name: 'SEC', domain: 'sec.gov', tier: 'tier1_government', baseReliability: 1.00, jurisdiction: 'US', languages: ['en'], isOfficial: true, isPaywalled: false, hasBylineVerification: true, specialties: ['enforcement', 'markets'] },
  { id: 'fca', name: 'FCA', domain: 'fca.org.uk', tier: 'tier1_government', baseReliability: 1.00, jurisdiction: 'GB', languages: ['en'], isOfficial: true, isPaywalled: false, hasBylineVerification: true, specialties: ['enforcement', 'sanctions'] },
  { id: 'cftc', name: 'CFTC', domain: 'cftc.gov', tier: 'tier1_government', baseReliability: 1.00, jurisdiction: 'US', languages: ['en'], isOfficial: true, isPaywalled: false, hasBylineVerification: true, specialties: ['enforcement', 'markets'] },
  { id: 'doj', name: 'DOJ', domain: 'justice.gov', tier: 'tier1_government', baseReliability: 1.00, jurisdiction: 'US', languages: ['en'], isOfficial: true, isPaywalled: false, hasBylineVerification: true, specialties: ['enforcement', 'courts'] },
  { id: 'cbuae', name: 'CBUAE', domain: 'centralbank.ae', tier: 'tier1_government', baseReliability: 1.00, jurisdiction: 'AE', languages: ['en', 'ar'], isOfficial: true, isPaywalled: false, hasBylineVerification: true, specialties: ['sanctions', 'enforcement'] },
  { id: 'adgm', name: 'ADGM', domain: 'adgm.com', tier: 'tier1_government', baseReliability: 1.00, jurisdiction: 'AE', languages: ['en'], isOfficial: true, isPaywalled: false, hasBylineVerification: true, specialties: ['enforcement'] },
  { id: 'dfsa', name: 'DFSA', domain: 'dfsa.ae', tier: 'tier1_government', baseReliability: 1.00, jurisdiction: 'AE', languages: ['en'], isOfficial: true, isPaywalled: false, hasBylineVerification: true, specialties: ['enforcement'] },
  { id: 'uae_cabinet', name: 'UAE Cabinet', domain: 'uaecabinet.ae', tier: 'tier1_government', baseReliability: 1.00, jurisdiction: 'AE', languages: ['en', 'ar'], isOfficial: true, isPaywalled: false, hasBylineVerification: true, specialties: ['sanctions'] },
  { id: 'bafin', name: 'BaFin', domain: 'bafin.de', tier: 'tier1_government', baseReliability: 1.00, jurisdiction: 'DE', languages: ['de', 'en'], isOfficial: true, isPaywalled: false, hasBylineVerification: true, specialties: ['enforcement'] },
  { id: 'amf', name: 'AMF France', domain: 'amf-france.org', tier: 'tier1_government', baseReliability: 1.00, jurisdiction: 'FR', languages: ['fr', 'en'], isOfficial: true, isPaywalled: false, hasBylineVerification: true, specialties: ['enforcement', 'markets'] },
  // ── International Bodies (tier1_international) ───────────────────────────
  { id: 'un_sc', name: 'UN Security Council', domain: 'un.org', tier: 'tier1_international', baseReliability: 1.00, languages: ['en', 'fr', 'ar', 'ru', 'zh', 'es'], isOfficial: true, isPaywalled: false, hasBylineVerification: true, specialties: ['sanctions'] },
  { id: 'fatf', name: 'FATF', domain: 'fatf-gafi.org', tier: 'tier1_international', baseReliability: 1.00, languages: ['en', 'fr', 'es'], isOfficial: true, isPaywalled: false, hasBylineVerification: true, specialties: ['sanctions', 'guidance'] },
  { id: 'interpol', name: 'Interpol', domain: 'interpol.int', tier: 'tier_interpol', baseReliability: 0.97, languages: ['en', 'fr', 'es', 'ar'], isOfficial: true, isPaywalled: false, hasBylineVerification: true, specialties: ['enforcement', 'notices'] },
  // ── Wire Services (tier2_wire) ────────────────────────────────────────────
  { id: 'reuters', name: 'Reuters', domain: 'reuters.com', tier: 'tier2_wire', baseReliability: 0.95, languages: ['en', 'ar', 'fr', 'es', 'zh', 'ru'], isOfficial: false, isPaywalled: false, hasBylineVerification: true, specialties: ['finance', 'markets', 'courts'] },
  { id: 'bloomberg', name: 'Bloomberg', domain: 'bloomberg.com', tier: 'tier2_wire', baseReliability: 0.95, languages: ['en'], isOfficial: false, isPaywalled: true, hasBylineVerification: true, specialties: ['finance', 'markets'] },
  { id: 'ap', name: 'Associated Press', domain: 'apnews.com', tier: 'tier2_wire', baseReliability: 0.95, languages: ['en'], isOfficial: false, isPaywalled: false, hasBylineVerification: true, specialties: ['general', 'courts'] },
  { id: 'afp', name: 'AFP', domain: 'afp.com', tier: 'tier2_wire', baseReliability: 0.93, languages: ['en', 'fr', 'ar', 'es'], isOfficial: false, isPaywalled: false, hasBylineVerification: true, specialties: ['general'] },
  // ── Financial Press (tier2_financial_press) ───────────────────────────────
  { id: 'ft', name: 'Financial Times', domain: 'ft.com', tier: 'tier2_financial_press', baseReliability: 0.94, languages: ['en'], isOfficial: false, isPaywalled: true, hasBylineVerification: true, specialties: ['finance', 'markets'] },
  { id: 'wsj', name: 'Wall Street Journal', domain: 'wsj.com', tier: 'tier2_financial_press', baseReliability: 0.93, languages: ['en'], isOfficial: false, isPaywalled: true, hasBylineVerification: true, specialties: ['finance', 'markets', 'courts'] },
  { id: 'economist', name: 'The Economist', domain: 'economist.com', tier: 'tier2_financial_press', baseReliability: 0.92, languages: ['en'], isOfficial: false, isPaywalled: true, hasBylineVerification: true, specialties: ['finance', 'policy'] },
  // ── NGOs and Investigative (tier_ngo) ────────────────────────────────────
  { id: 'occrp', name: 'OCCRP', domain: 'occrp.org', tier: 'tier_ngo', baseReliability: 0.88, languages: ['en', 'ru'], isOfficial: false, isPaywalled: false, hasBylineVerification: true, specialties: ['corruption', 'organized_crime'] },
  { id: 'transparency_intl', name: 'Transparency International', domain: 'transparency.org', tier: 'tier_ngo', baseReliability: 0.87, languages: ['en', 'fr', 'de', 'es'], isOfficial: false, isPaywalled: false, hasBylineVerification: true, specialties: ['corruption'] },
  { id: 'global_witness', name: 'Global Witness', domain: 'globalwitness.org', tier: 'tier_ngo', baseReliability: 0.85, languages: ['en'], isOfficial: false, isPaywalled: false, hasBylineVerification: true, specialties: ['corruption', 'environmental_crime'] },
];

const SOURCE_BY_DOMAIN = new Map(
  SOURCE_REGISTRY.filter((s) => s.domain).map((s) => [s.domain ?? '', s])
);

// ── Domain extraction ─────────────────────────────────────────────────────────

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// ── Reliability scoring ───────────────────────────────────────────────────────

export interface ReliabilityScore {
  sourceId: string | null;
  sourceName: string;
  tier: SourceTier | 'tier5_unverified';
  baseReliability: number;
  adjustedReliability: number;
  isOfficial: boolean;
  modifiers: string[];
  notes: string[];
}

export function scoreSourceReliability(
  sourceName: string,
  sourceUrl?: string,
  contentAge?: number,  // days since publication
): ReliabilityScore {
  // Try URL domain lookup first
  let profile: SourceProfile | undefined;
  if (sourceUrl) {
    const domain = extractDomain(sourceUrl);
    if (domain) profile = SOURCE_BY_DOMAIN.get(domain);
  }

  // Try name lookup
  if (!profile) {
    const nameLower = sourceName.toLowerCase();
    profile = SOURCE_REGISTRY.find(
      (s) => s.name.toLowerCase() === nameLower || nameLower.includes(s.name.toLowerCase())
    );
  }

  const modifiers: string[] = [];
  const notes: string[] = [];

  if (!profile) {
    // Unknown source — low reliability
    return {
      sourceId: null,
      sourceName,
      tier: 'tier5_unverified',
      baseReliability: 0.40,
      adjustedReliability: 0.40,
      isOfficial: false,
      modifiers: ['unrecognised source'],
      notes: ['Source not in registry; treat with caution and seek corroboration'],
    };
  }

  let adjusted = profile.baseReliability;

  // Age penalty: older articles are less current (but not less credible)
  if (contentAge !== undefined) {
    if (contentAge > 1825) { // > 5 years
      adjusted -= 0.05;
      modifiers.push(`Article age ${Math.floor(contentAge / 365)}y: -0.05`);
    } else if (contentAge > 730) { // > 2 years
      adjusted -= 0.02;
      modifiers.push(`Article age ${Math.floor(contentAge / 365)}y: -0.02`);
    }
  }

  // Official source bonus
  if (profile.isOfficial) {
    notes.push('Official/regulatory source — maximum evidentiary weight');
  }

  // Byline bonus
  if (profile.hasBylineVerification) {
    notes.push('Byline-verified source');
  } else {
    adjusted -= 0.05;
    modifiers.push('No byline verification: -0.05');
  }

  adjusted = Math.min(1, Math.max(0, adjusted));

  return {
    sourceId: profile.id,
    sourceName: profile.name,
    tier: profile.tier,
    baseReliability: profile.baseReliability,
    adjustedReliability: adjusted,
    isOfficial: profile.isOfficial,
    modifiers,
    notes,
  };
}

// ── Multi-source corroboration scorer ────────────────────────────────────────

export interface CorroborationResult {
  corroborated: boolean;
  sourceCount: number;
  officiallySourced: boolean;
  highReliabilityCount: number;
  averageReliability: number;
  corroborationStrength: 'strong' | 'moderate' | 'weak' | 'single_source';
  recommendation: string;
}

export function scoreCorroboration(sources: ReliabilityScore[]): CorroborationResult {
  const officiallySourced = sources.some((s) => s.isOfficial);
  const highRel = sources.filter((s) => s.adjustedReliability >= 0.85);
  const avgRel = sources.reduce((sum, s) => sum + s.adjustedReliability, 0) / (sources.length || 1);

  let strength: CorroborationResult['corroborationStrength'] = 'single_source';
  let recommendation = '';

  if (sources.length === 0) {
    strength = 'single_source';
    recommendation = 'No sources provided; cannot assess corroboration.';
  } else if (sources.length === 1) {
    strength = 'single_source';
    recommendation = sources[0]?.isOfficial
      ? 'Single official source — sufficient for sanctions hits; seek media corroboration for adverse media.'
      : 'Single non-official source — corroboration required before escalation.';
  } else if (officiallySourced && highRel.length >= 2) {
    strength = 'strong';
    recommendation = 'Strong corroboration: official source + multiple high-reliability outlets.';
  } else if (highRel.length >= 2) {
    strength = 'moderate';
    recommendation = 'Moderate corroboration: multiple high-reliability sources.';
  } else {
    strength = 'weak';
    recommendation = 'Weak corroboration: few or low-reliability sources — seek additional evidence.';
  }

  return {
    corroborated: sources.length >= 2,
    sourceCount: sources.length,
    officiallySourced,
    highReliabilityCount: highRel.length,
    averageReliability: avgRel,
    corroborationStrength: strength,
    recommendation,
  };
}
