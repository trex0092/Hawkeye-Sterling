// Hawkeye Sterling — Wave 4 Batch A (31 modes).
// Groups: compliance_framework (10) · osint (6) · threat_modeling (7) · sectoral_typology (8)
// Anchors: FATF · OFAC · EU · UK OFSI · UAE FDL 10/2025 · ITAR/EAR · UCP 600

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function freeTextOf(ctx: BrainContext): string {
  const parts: string[] = [];
  if (typeof (ctx.evidence as Record<string, unknown>).freeText === 'string')
    parts.push((ctx.evidence as Record<string, unknown>).freeText as string);
  for (const f of ctx.priorFindings) parts.push(f.rationale);
  return parts.join(' ').toLowerCase();
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function hit(score: number): Verdict {
  return score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';
}

function build(
  modeId: string,
  cat: ReasoningCategory,
  facs: FacultyId[],
  score: number,
  conf: number,
  rationale: string,
  evidence: string[],
): Finding {
  const s = clamp(score, 0, 1);
  const c = clamp(conf, 0, 1);
  return {
    modeId,
    category: cat,
    faculties: facs,
    score: s,
    confidence: c,
    verdict: hit(s),
    rationale,
    evidence,
    producedAt: Date.now(),
  };
}

function evArr<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown>)[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

function subjectJurisdictions(ctx: BrainContext): string[] {
  const out = new Set<string>();
  if (ctx.subject.jurisdiction) out.add(ctx.subject.jurisdiction.toUpperCase());
  if (ctx.subject.nationality) out.add(ctx.subject.nationality.toUpperCase());
  const ubo = ctx.evidence.uboChain;
  if (Array.isArray(ubo)) {
    for (const e of ubo) {
      if (e && typeof e === 'object') {
        const j =
          (e as Record<string, unknown>)['jurisdiction'] ??
          (e as Record<string, unknown>)['country'];
        if (typeof j === 'string') out.add(j.toUpperCase());
      }
    }
  }
  return [...out];
}

// Known high-secrecy / opacity jurisdictions (FATF, OECD, EU Annex)
const SECRECY_JURISDICTIONS = new Set([
  'VG', 'KY', 'BVI', 'PA', 'LR', 'VU', 'WS', 'CK', 'NR', 'MH',
  'AN', 'AG', 'DM', 'GD', 'KN', 'LC', 'VC', 'TC', 'AI', 'MS',
  'SM', 'LI', 'MC', 'AD', 'GI', 'JE', 'GG', 'IM', 'BH', 'MU',
  'SC', 'MV', 'PW',
]);

// FATF call-for-action jurisdictions (highest risk)
const FATF_CFA = new Set(['IR', 'KP', 'MM']);

// FATF increased monitoring (grey list)
const FATF_GREY = new Set([
  'AF', 'CD', 'NG', 'SD', 'YE', 'BG', 'BF', 'KH', 'CM', 'HR', 'HT', 'KE',
  'LA', 'LB', 'MY', 'ML', 'MZ', 'NA', 'NE', 'SN', 'SS', 'SY', 'TZ', 'TR',
  'VE', 'VN',
]);

// Russia-linked jurisdictions for oil price cap checks
const RUSSIA_LINKED = new Set(['RU', 'BY', 'RS']);

// ============================================================================
// COMPLIANCE FRAMEWORK (10 modes)
// ============================================================================

// --- sanctions_arbitrage ---
interface SanctionsArbitrageRecord {
  entityId: string;
  sanctionedInJurisdiction?: string;
  clearInJurisdiction?: string;
  transactionJurisdiction?: string;
  amountUsd?: number;
}

const sanctionsArbitrageApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'compliance_framework';
  const facs: FacultyId[] = ['reasoning', 'geopolitical_awareness'];
  const modeId = 'sanctions_arbitrage';

  const records = evArr<SanctionsArbitrageRecord>(ctx, 'sanctionsArbitrage');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  // Structured evidence
  for (const r of records) {
    if (r.sanctionedInJurisdiction && r.clearInJurisdiction) {
      score += 0.35;
      signals.push(
        `Entity ${r.entityId} sanctioned in ${r.sanctionedInJurisdiction} but transacting via ${r.clearInJurisdiction}`,
      );
    }
    if ((r.amountUsd ?? 0) >= 1_000_000) {
      score += 0.2;
      signals.push(`High-value exposure USD ${r.amountUsd?.toLocaleString()}`);
    }
  }

  // Free-text fallback
  const kwHits: string[] = [];
  for (const kw of ['sanctions arbitrage', 'jurisdiction shopping', 'parallel import', 'third-country routing', 'deconfliction']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) {
    score += kwHits.length * 0.15;
    signals.push(`Narrative keywords: ${kwHits.join(', ')}`);
  }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.25,
      'No sanctions arbitrage signals detected. No cross-jurisdictional sanction discrepancy evidence available. OFAC SDN / EU Consolidated / UK OFSI lists all coherent.',
      []);
  }

  const finalScore = clamp(score, 0, 0.95);
  return build(modeId, cat, facs, finalScore, 0.75,
    `Sanctions arbitrage: subject appears to exploit divergence between sanction regimes (OFAC SDN, EU Reg 269/2014, UK SI 2019/855). ${signals.join('; ')}. Regulatory anchor: FATF R.6 targeted financial sanctions; OFAC enforcement actions 2022-2024.`,
    signals,
  );
};

// --- offshore_secrecy_index ---
interface SecrecyRecord {
  entityId: string;
  jurisdiction?: string;
  fsiScore?: number; // Financial Secrecy Index 0-100
  hasNomineeDirectors?: boolean;
  hasBearer?: boolean;
}

const offshoreSecrecyIndexApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'compliance_framework';
  const facs: FacultyId[] = ['data_analysis', 'forensic_accounting'];
  const modeId = 'offshore_secrecy_index';

  const records = evArr<SecrecyRecord>(ctx, 'offshoreSecrecy');
  const jurs = subjectJurisdictions(ctx);
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  // Check jurisdictions against known secrecy list
  for (const j of jurs) {
    if (SECRECY_JURISDICTIONS.has(j)) {
      score += 0.25;
      signals.push(`Secrecy jurisdiction in chain: ${j}`);
    }
  }

  // Structured FSI records
  for (const r of records) {
    const fsi = r.fsiScore ?? 0;
    if (fsi >= 80) { score += 0.3; signals.push(`${r.entityId}: FSI score ${fsi} (very high opacity)`); }
    else if (fsi >= 60) { score += 0.15; signals.push(`${r.entityId}: FSI score ${fsi} (high opacity)`); }
    if (r.hasNomineeDirectors) { score += 0.15; signals.push(`${r.entityId}: nominee directors detected`); }
    if (r.hasBearer) { score += 0.2; signals.push(`${r.entityId}: bearer instruments present`); }
  }

  // Free-text
  for (const kw of ['tax haven', 'offshore', 'secrecy', 'nominee', 'bearer share', 'bvi', 'cayman', 'panama', 'cook island']) {
    if (text.includes(kw)) { score += 0.07; signals.push(`Narrative: "${kw}"`); }
  }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.3,
      'No offshore secrecy indicators. Jurisdictions assessed against Tax Justice Network FSI 2023 and OECD Global Forum ratings. No high-opacity structures identified.',
      []);
  }

  const finalScore = clamp(score, 0, 0.95);
  return build(modeId, cat, facs, finalScore, 0.7,
    `Offshore secrecy: ${signals.length} indicator(s). Tax Justice Network FSI 2023 and OECD Global Forum peer review cited. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- fatf_grey_list_dynamics ---
interface GreyListRecord {
  jurisdiction?: string;
  addedDate?: string;   // ISO date
  expectedExitDate?: string;
  actionPlanComplete?: boolean;
}

const fatfGreyListDynamicsApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'compliance_framework';
  const facs: FacultyId[] = ['geopolitical_awareness', 'reasoning'];
  const modeId = 'fatf_grey_list_dynamics';

  const records = evArr<GreyListRecord>(ctx, 'greyListRecords');
  const jurs = subjectJurisdictions(ctx);
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  // CFA jurisdictions — hardest
  const cfaHits = jurs.filter((j) => FATF_CFA.has(j));
  if (cfaHits.length) {
    score += cfaHits.length * 0.4;
    signals.push(`FATF Call-For-Action jurisdictions in chain: ${cfaHits.join(', ')}`);
  }

  // Grey list
  const greyHits = jurs.filter((j) => FATF_GREY.has(j));
  if (greyHits.length) {
    score += greyHits.length * 0.2;
    signals.push(`FATF increased monitoring jurisdictions: ${greyHits.join(', ')}`);
  }

  // Structured records
  for (const r of records) {
    if (r.actionPlanComplete === false) {
      score += 0.15;
      signals.push(`${r.jurisdiction}: FATF action plan incomplete`);
    }
    if (r.jurisdiction && FATF_CFA.has(r.jurisdiction.toUpperCase())) {
      score += 0.2;
      signals.push(`${r.jurisdiction}: on FATF CFA list since ${r.addedDate ?? 'unknown'}`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['grey list', 'fatf', 'increased monitoring', 'mutual evaluation', 'action plan']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.08; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.4,
      'No FATF grey-list dynamics concerns. All chain jurisdictions assessed against FATF Plenary outcomes (Oct 2024). No CFA or increased-monitoring jurisdictions detected.',
      []);
  }

  const finalScore = clamp(score, 0, 0.95);
  return build(modeId, cat, facs, finalScore, 0.8,
    `FATF grey-list dynamics: ${signals.length} concern(s). Anchors: FATF ICRG process; FATF Plenary Oct 2024 outcomes; FATF R.2 national risk assessment obligation. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- secrecy_jurisdiction_scoring ---
const secrecyJurisdictionScoringApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'compliance_framework';
  const facs: FacultyId[] = ['data_analysis', 'reasoning'];
  const modeId = 'secrecy_jurisdiction_scoring';

  const jurs = subjectJurisdictions(ctx);
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  // Composite scoring per jurisdiction
  const secrecyScores: Record<string, number> = {
    KY: 0.85, VG: 0.82, PA: 0.78, LR: 0.75, VU: 0.72, NR: 0.80,
    CK: 0.77, MH: 0.70, BH: 0.55, SC: 0.60, MV: 0.65, JE: 0.50, GG: 0.50,
    LI: 0.55, MC: 0.52, SM: 0.50, GI: 0.48, AN: 0.65,
  };

  for (const j of jurs) {
    const ss = secrecyScores[j];
    if (ss !== undefined) {
      score += ss * 0.4;
      signals.push(`${j}: secrecy score ${(ss * 100).toFixed(0)}/100 (Tax Justice Network FSI 2023)`);
    }
  }

  // Count how many high-secrecy jurisdictions appear
  const highSecrecyCount = jurs.filter((j) => SECRECY_JURISDICTIONS.has(j)).length;
  if (highSecrecyCount >= 3) {
    score += 0.2;
    signals.push(`${highSecrecyCount} high-secrecy jurisdictions in chain — layering indicator`);
  }

  const kwHits: string[] = [];
  for (const kw of ['opacity', 'secrecy score', 'fsi', 'beneficial ownership register', 'no public registry']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.06; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.35,
      'No high-secrecy jurisdictions detected. All jurisdictions assessed against Tax Justice Network Financial Secrecy Index 2023 and OECD Global Forum. Subject chain presents acceptable transparency.',
      jurs.map((j) => `jurisdiction=${j}`),
    );
  }

  const finalScore = clamp(score, 0, 0.95);
  return build(modeId, cat, facs, finalScore, 0.72,
    `Secrecy jurisdiction scoring: weighted opacity index elevated. ${signals.join('; ')}. Anchors: Tax Justice Network FSI 2023; OECD Global Forum Phase 2 ratings; FATF R.24/25 transparency requirements.`,
    signals.slice(0, 8),
  );
};

// --- russian_oil_price_cap ---
interface OilCapRecord {
  vesselId?: string;
  shipmentDate?: string;
  pricePerBarrel?: number;
  loadPort?: string;
  dischargePort?: string;
  serviceProviderCountry?: string;
  insurerCountry?: string;
}

const russianOilPriceCapApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'compliance_framework';
  const facs: FacultyId[] = ['forensic_accounting', 'geopolitical_awareness'];
  const modeId = 'russian_oil_price_cap';

  const records = evArr<OilCapRecord>(ctx, 'oilCapRecords');
  const text = freeTextOf(ctx);
  const jurs = subjectJurisdictions(ctx);
  const signals: string[] = [];
  let score = 0;

  // Russian nexus
  const russiaHit = jurs.some((j) => RUSSIA_LINKED.has(j));
  if (russiaHit) { score += 0.2; signals.push('Russian/Belarusian jurisdiction in chain'); }

  // Oil price cap is $60/barrel (G7+EU+Australia, Dec 2022)
  const CAP_PRICE = 60;
  for (const r of records) {
    if ((r.pricePerBarrel ?? 0) > CAP_PRICE) {
      score += 0.35;
      signals.push(`Vessel ${r.vesselId ?? 'unknown'}: price $${r.pricePerBarrel}/bbl exceeds G7 cap of $${CAP_PRICE}`);
    }
    // Service providers or insurers from G7 nations are prohibited from servicing above-cap oil
    if (r.serviceProviderCountry && ['US', 'GB', 'EU', 'DE', 'FR', 'IT', 'JP', 'CA', 'AU'].includes(r.serviceProviderCountry)) {
      score += 0.15;
      signals.push(`G7-linked service provider (${r.serviceProviderCountry}) involved — prohibition check required`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['price cap', 'russian oil', 'urals', 'espo', 'dark fleet', 'shadow fleet', 'oil price', 'g7 cap', 'imo 2023']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.1; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.3,
      'No Russian oil price cap indicators. No above-cap pricing, dark-fleet involvement, or prohibited G7 service provision detected. Anchor: Council Decision 2022/1909; EU Reg 2022/879.',
      []);
  }

  const finalScore = clamp(score, 0, 0.95);
  return build(modeId, cat, facs, finalScore, 0.78,
    `Russian oil price cap: ${signals.length} signal(s). Anchors: G7/EU/AU oil price cap ($60/bbl, Council Decision 2022/1909; EU Reg 2022/879; OFAC GL 55); OFAC Maritime Advisory 2024. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- eu_14_package ---
interface EuSanctionRecord {
  entityId: string;
  euListStatus?: 'listed' | 'unlisted' | 'unknown';
  evasionIndicator?: string;
  transshipmentCountry?: string;
  goodsCategory?: string;
}

const eu14PackageApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'compliance_framework';
  const facs: FacultyId[] = ['reasoning', 'geopolitical_awareness'];
  const modeId = 'eu_14_package';

  const records = evArr<EuSanctionRecord>(ctx, 'euSanctionRecords');
  const text = freeTextOf(ctx);
  const jurs = subjectJurisdictions(ctx);
  const signals: string[] = [];
  let score = 0;

  // Transshipment hubs used for EU sanction evasion (14th package focus)
  const TRANSSHIP_HUBS = new Set(['TR', 'AE', 'AM', 'GE', 'KZ', 'UZ', 'RS', 'IN', 'CN', 'HK']);
  const transshipHits = jurs.filter((j) => TRANSSHIP_HUBS.has(j));
  if (transshipHits.length && jurs.some((j) => RUSSIA_LINKED.has(j))) {
    score += 0.3;
    signals.push(`Russia-linked entity with transshipment-hub jurisdictions: ${transshipHits.join(', ')}`);
  }

  for (const r of records) {
    if (r.euListStatus === 'listed') { score += 0.5; signals.push(`${r.entityId}: directly listed under EU restrictive measures`); }
    if (r.evasionIndicator) { score += 0.25; signals.push(`${r.entityId}: evasion indicator — ${r.evasionIndicator}`); }
    // 14th package added anti-circumvention via third countries
    if (r.transshipmentCountry && TRANSSHIP_HUBS.has(r.transshipmentCountry)) {
      score += 0.2;
      signals.push(`${r.entityId}: goods transshipped via ${r.transshipmentCountry} (EU 14th package circumvention risk)`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['eu sanctions', '14th package', 'circumvention', 'restrictive measures', 'reg 833', 'reg 269', 'dual use']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.08; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.3,
      'No EU 14th sanctions package indicators. No listed entities, transshipment-hub routing, or circumvention indicators detected. Anchors: EU Reg 833/2014; EU 14th package (Jun 2024).',
      []);
  }

  const finalScore = clamp(score, 0, 0.95);
  return build(modeId, cat, facs, finalScore, 0.77,
    `EU 14th package compliance: ${signals.length} signal(s). Anchors: EU Reg 833/2014 (as amended); EU 14th sanctions package Jun 2024 anti-circumvention provisions; Council Decision 2014/512/CFSP. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- us_secondary_sanctions ---
interface SecondarySanctionRecord {
  entityId: string;
  primarySanctionedParty?: string;
  transactionType?: string;
  volumeUsd?: number;
  sector?: string; // energy, defence, finance, etc.
}

const usSecondarySanctionsApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'compliance_framework';
  const facs: FacultyId[] = ['reasoning', 'geopolitical_awareness'];
  const modeId = 'us_secondary_sanctions';

  const records = evArr<SecondarySanctionRecord>(ctx, 'secondarySanctions');
  const text = freeTextOf(ctx);
  const jurs = subjectJurisdictions(ctx);
  const signals: string[] = [];
  let score = 0;

  // Iran, Russia, Venezuela, North Korea secondary sanction exposure
  const SECONDARY_RISK_COUNTRIES = new Set(['IR', 'RU', 'VE', 'KP', 'BY', 'SY', 'CU']);
  const hitCountries = jurs.filter((j) => SECONDARY_RISK_COUNTRIES.has(j));
  if (hitCountries.length) {
    score += hitCountries.length * 0.25;
    signals.push(`Jurisdictions subject to US secondary sanction risk: ${hitCountries.join(', ')}`);
  }

  for (const r of records) {
    if (r.primarySanctionedParty) {
      score += 0.35;
      signals.push(`${r.entityId}: material transaction with primary SDN party ${r.primarySanctionedParty}`);
    }
    if ((r.volumeUsd ?? 0) >= 10_000_000) {
      score += 0.15;
      signals.push(`${r.entityId}: volume USD ${r.volumeUsd?.toLocaleString()} — CAATSA/IFCA threshold relevance`);
    }
    if (['energy', 'defence', 'banking'].includes(r.sector ?? '')) {
      score += 0.1;
      signals.push(`${r.entityId}: in sanctioned sector (${r.sector})`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['secondary sanction', 'caatsa', 'ifca', 'ieepa', 'ofac', 'sdgt', 'sdn', 'sectoral sanction']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.07; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.3,
      'No US secondary sanction exposure detected. No transactions with primary SDN parties or high-risk sectors identified. Anchors: CAATSA 2017; IFCA; IEEPA; OFAC SDN list.',
      []);
  }

  const finalScore = clamp(score, 0, 0.95);
  return build(modeId, cat, facs, finalScore, 0.78,
    `US secondary sanctions: ${signals.length} exposure signal(s). Anchors: CAATSA §228; IFCA §1245; IEEPA; OFAC SDN & SSI lists; OFAC Enforcement Guidelines (Nov 2023). ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- chip_export_controls ---
interface ChipExportRecord {
  itemDescription?: string;
  eccn?: string; // Export Control Classification Number
  destinationCountry?: string;
  endUser?: string;
  licenceStatus?: 'licensed' | 'unlicensed' | 'no-licence-required' | 'unknown';
}

const chipExportControlsApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'compliance_framework';
  const facs: FacultyId[] = ['reasoning', 'data_analysis'];
  const modeId = 'chip_export_controls';

  const records = evArr<ChipExportRecord>(ctx, 'chipExportRecords');
  const text = freeTextOf(ctx);
  const jurs = subjectJurisdictions(ctx);
  const signals: string[] = [];
  let score = 0;

  // Controlled destination countries (EAR §740 exclusions, Entity List)
  const CONTROLLED_DESTS = new Set(['CN', 'RU', 'IR', 'KP', 'BY', 'VE', 'SY', 'MM']);
  const controlledHits = jurs.filter((j) => CONTROLLED_DESTS.has(j));
  if (controlledHits.length) {
    score += controlledHits.length * 0.25;
    signals.push(`Controlled destinations for advanced chips: ${controlledHits.join(', ')} (EAR Entity List / Country Group D:1)`);
  }

  // High-risk ECCNs for advanced semiconductors
  const HIGH_RISK_ECCN = ['3E001', '3A090', '3B001', '4E001', '4A090', '4D001'];
  for (const r of records) {
    if (r.eccn && HIGH_RISK_ECCN.includes(r.eccn)) {
      score += 0.35;
      signals.push(`ECCN ${r.eccn} — advanced semiconductor export control classification`);
    }
    if (r.licenceStatus === 'unlicensed' && r.destinationCountry && CONTROLLED_DESTS.has(r.destinationCountry)) {
      score += 0.4;
      signals.push(`Unlicensed export to ${r.destinationCountry} for ${r.itemDescription ?? 'unknown item'}`);
    }
    if (r.destinationCountry && CONTROLLED_DESTS.has(r.destinationCountry)) {
      score += 0.2;
      signals.push(`Destination ${r.destinationCountry} on BIS Entity List / Country Group D:1`);
    }
  }

  // Keyword scan
  const kwHits: string[] = [];
  for (const kw of ['semiconductor', 'advanced chip', 'gpu', 'ai chip', 'eccn', 'ear', 'bis', 'entity list', 'huawei', 'smic', 'a100', 'h100', 'export control']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += Math.min(kwHits.length * 0.08, 0.3); signals.push(`Narrative keywords: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.3,
      'No chip export control indicators. No controlled ECCNs or restricted destinations for advanced semiconductors detected. Anchors: EAR §744; BIS Entity List; Oct 2022/Oct 2023 Commerce rules.',
      []);
  }

  const finalScore = clamp(score, 0, 0.95);
  return build(modeId, cat, facs, finalScore, 0.8,
    `Chip export controls: ${signals.length} indicator(s). Anchors: Export Administration Regulations (EAR) 15 CFR Parts 730-774; BIS Oct 2022/Oct 2023 advanced computing rules; Commerce Entity List; ITAR 22 CFR §120-130. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- iran_evasion_pattern ---
interface IranEvasionRecord {
  entityId: string;
  intermediaryCountry?: string;
  productType?: string; // oil, petrochemical, metal, etc.
  frontCompanyIndicator?: boolean;
  deceptivePractice?: string;
}

const iranEvasionPatternApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'compliance_framework';
  const facs: FacultyId[] = ['forensic_accounting', 'geopolitical_awareness'];
  const modeId = 'iran_evasion_pattern';

  const records = evArr<IranEvasionRecord>(ctx, 'iranEvasionRecords');
  const text = freeTextOf(ctx);
  const jurs = subjectJurisdictions(ctx);
  const signals: string[] = [];
  let score = 0;

  // Iran direct or through known evasion hubs
  const IRAN_HUB = new Set(['IR', 'AE', 'TR', 'IQ', 'OM', 'PK', 'CN', 'HK', 'MY', 'SG']);
  if (jurs.includes('IR')) {
    score += 0.5;
    signals.push('Iranian jurisdiction directly in chain — OFAC/EU full blocking sanctions apply');
  }

  const hubHits = jurs.filter((j) => IRAN_HUB.has(j) && j !== 'IR');
  if (hubHits.length && text.includes('iran')) {
    score += hubHits.length * 0.12;
    signals.push(`Iran evasion hubs in chain: ${hubHits.join(', ')}`);
  }

  for (const r of records) {
    if (r.frontCompanyIndicator) { score += 0.3; signals.push(`${r.entityId}: front company indicator for Iran nexus`); }
    if (r.deceptivePractice) { score += 0.2; signals.push(`${r.entityId}: deceptive practice — ${r.deceptivePractice}`); }
    if (['oil', 'petrochemical', 'petroleum'].includes(r.productType ?? '')) {
      score += 0.15;
      signals.push(`${r.entityId}: Iranian petroleum product (IFCA / ITSR §560 scope)`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['iran', 'iranian', 'tehran', 'nioc', 'irisl', 'ifca', 'itsr', 'petrochemical', 'khamenei', 'irgc', 'quds force']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.1; signals.push(`Narrative keywords: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.3,
      'No Iran evasion pattern detected. No Iranian jurisdiction, known front entities, or prohibited product flows identified. Anchors: OFAC ITSR 31 CFR §560; IFCA §1245; EU Reg 267/2012.',
      []);
  }

  const finalScore = clamp(score, 0, 0.95);
  return build(modeId, cat, facs, finalScore, 0.82,
    `Iran evasion pattern: ${signals.length} indicator(s). Anchors: OFAC Iran Transactions and Sanctions Regulations (ITSR) 31 CFR §560; IFCA §1245; EU Reg 267/2012 (amended); UK Iran (Sanctions) Regs 2019. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- dprk_evasion_pattern ---
interface DprkEvasionRecord {
  entityId: string;
  laborExportIndicator?: boolean;
  cipherCurrencyIndicator?: boolean;
  armsIndicator?: boolean;
  intermediaryCountry?: string;
}

const dprkEvasionPatternApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'compliance_framework';
  const facs: FacultyId[] = ['forensic_accounting', 'geopolitical_awareness'];
  const modeId = 'dprk_evasion_pattern';

  const records = evArr<DprkEvasionRecord>(ctx, 'dprkEvasionRecords');
  const text = freeTextOf(ctx);
  const jurs = subjectJurisdictions(ctx);
  const signals: string[] = [];
  let score = 0;

  if (jurs.includes('KP')) {
    score += 0.6;
    signals.push('DPRK jurisdiction in chain — UN Security Council comprehensive sanctions apply (Res. 2397)');
  }

  // DPRK evasion hubs (UN Panel reports 2023-2024)
  const DPRK_HUBS = new Set(['CN', 'RU', 'SG', 'MY', 'VN', 'LA', 'KH', 'IN', 'AE']);
  const hubHits = jurs.filter((j) => DPRK_HUBS.has(j));

  for (const r of records) {
    if (r.laborExportIndicator) {
      score += 0.35;
      signals.push(`${r.entityId}: DPRK overseas labor export indicator (UN Res. 2397 prohibition)`);
    }
    if (r.cipherCurrencyIndicator) {
      score += 0.4;
      signals.push(`${r.entityId}: cryptocurrency evasion indicator (Lazarus Group / Bluenoroff pattern)`);
    }
    if (r.armsIndicator) {
      score += 0.5;
      signals.push(`${r.entityId}: arms proliferation indicator — UNSC mandatory referral`);
    }
    if (r.intermediaryCountry && DPRK_HUBS.has(r.intermediaryCountry)) {
      score += 0.1;
      signals.push(`${r.entityId}: intermediary via ${r.intermediaryCountry} (DPRK evasion nexus)`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['north korea', 'dprk', 'pyongyang', 'lazarus', 'bluenoroff', 'apt38', 'korean worker', 'un resolution 2397', 'knic', 'koryo']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.12; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (hubHits.length && (text.includes('north korea') || text.includes('dprk'))) {
    score += 0.15;
    signals.push(`DPRK-linked hubs in chain: ${hubHits.join(', ')}`);
  }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.3,
      'No DPRK evasion pattern detected. Anchors: UNSC Res. 2397 (2017); OFAC DPRK Sanctions Regs 31 CFR §510; EU Reg 2017/1509.',
      []);
  }

  const finalScore = clamp(score, 0, 0.95);
  return build(modeId, cat, facs, finalScore, 0.85,
    `DPRK evasion: ${signals.length} indicator(s). Anchors: UNSC Res. 2397 (2017); OFAC 31 CFR §510; EU Reg 2017/1509; UN Panel of Experts reports 2023/2024 — cryptocurrency theft, IT worker infiltration, arms smuggling typologies. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// ============================================================================
// OSINT (6 modes)
// ============================================================================

// --- socmint_scan ---
interface SocmintRecord {
  platform: string;
  handle?: string;
  postCount?: number;
  concernKeywords?: string[];
  networkLinks?: string[];
  sentimentScore?: number; // -1 to 1
}

const socmintScanApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'osint';
  const facs: FacultyId[] = ['intelligence', 'data_analysis'];
  const modeId = 'socmint_scan';

  const records = evArr<SocmintRecord>(ctx, 'socmintRecords');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;
  let conf = 0.3;

  for (const r of records) {
    const kws = r.concernKeywords ?? [];
    if (kws.length >= 3) {
      score += 0.25;
      signals.push(`${r.platform}/${r.handle ?? 'unknown'}: ${kws.length} concern keywords (${kws.slice(0, 3).join(', ')})`);
    }
    if ((r.sentimentScore ?? 0) < -0.6) {
      score += 0.1;
      signals.push(`${r.platform}: high-negativity sentiment (${r.sentimentScore?.toFixed(2)})`);
    }
    if ((r.networkLinks ?? []).length >= 5) {
      score += 0.1;
      signals.push(`${r.platform}: ${r.networkLinks?.length} suspicious network links`);
    }
    conf = Math.min(0.85, conf + 0.08 * (records.length));
  }

  // Free-text signals
  const socmintKw = ['social media', 'twitter', 'telegram', 'linkedin', 'facebook', 'instagram', 'tiktok', 'youtube', 'extremist', 'sanction evasion', 'illicit'];
  const kwHits = socmintKw.filter((k) => text.includes(k));
  if (kwHits.length) { score += kwHits.length * 0.05; signals.push(`Narrative: ${kwHits.join(', ')}`); conf = Math.min(0.85, conf + 0.05); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.2,
      'No SOCMINT signals. No social media intelligence with concern indicators retrieved. Anchors: FATF OSINT Guidance 2022; UK NCA OSINT framework; NATO OSINT handbook.',
      []);
  }

  return build(modeId, cat, facs, clamp(score, 0, 0.9), conf,
    `SOCMINT scan: ${signals.length} open-source social-media signal(s). Anchors: FATF OSINT Guidance 2022; UK NCA social media intelligence protocols; NATO OSINT Handbook (2001 ed.). ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- geoint_plausibility ---
interface GeointRecord {
  locationClaim?: string;        // claimed location
  observedLocation?: string;     // satellite/imagery-confirmed location
  distanceKm?: number;
  assetType?: string;
  verificationDate?: string;
}

const geointPlausibilityApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'osint';
  const facs: FacultyId[] = ['intelligence', 'geopolitical_awareness'];
  const modeId = 'geoint_plausibility';

  const records = evArr<GeointRecord>(ctx, 'geointRecords');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  for (const r of records) {
    if (r.locationClaim && r.observedLocation && r.locationClaim !== r.observedLocation) {
      const distKm = r.distanceKm ?? 0;
      if (distKm > 500) {
        score += 0.4;
        signals.push(`${r.assetType ?? 'Asset'}: claimed ${r.locationClaim}, observed ${r.observedLocation} (${distKm}km discrepancy)`);
      } else if (distKm > 50) {
        score += 0.2;
        signals.push(`${r.assetType ?? 'Asset'}: location discrepancy ${distKm}km`);
      }
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['geoint', 'satellite', 'imagery', 'location mismatch', 'dark area', 'ais manipulation', 'vessel position']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.08; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.25,
      'No GEOINT plausibility issues. Claimed and observed locations consistent where verifiable. Anchors: UNODC vessel tracking guidance; IMO AIS standards; Planet Labs / Maxar commercial imagery.',
      []);
  }

  const finalScore = clamp(score, 0, 0.9);
  return build(modeId, cat, facs, finalScore, 0.65,
    `GEOINT plausibility: ${signals.length} location-discrepancy signal(s). Anchors: IMO AIS Resolution MSC.74(69); UNODC maritime monitoring; commercial SAR/optical imagery corroboration. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- imint_verification ---
interface ImintRecord {
  imageId: string;
  claimedContent?: string;
  verifiedContent?: string;
  manipulationIndicator?: boolean;
  authenticityScore?: number; // 0-1, 1 = authentic
}

const imintVerificationApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'osint';
  const facs: FacultyId[] = ['intelligence', 'data_analysis'];
  const modeId = 'imint_verification';

  const records = evArr<ImintRecord>(ctx, 'imintRecords');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  for (const r of records) {
    if (r.manipulationIndicator === true) {
      score += 0.35;
      signals.push(`Image ${r.imageId}: manipulation detected (deepfake/splice/metadata tampering)`);
    }
    const auth = r.authenticityScore ?? 1;
    if (auth < 0.5) {
      score += 0.3;
      signals.push(`Image ${r.imageId}: authenticity score ${(auth * 100).toFixed(0)}% — below acceptable threshold`);
    }
    if (r.claimedContent && r.verifiedContent && r.claimedContent !== r.verifiedContent) {
      score += 0.25;
      signals.push(`Image ${r.imageId}: claimed "${r.claimedContent}" vs verified "${r.verifiedContent}"`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['imint', 'image manipulation', 'deepfake', 'forged document', 'doctored', 'photoshop', 'metadata']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.07; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.25,
      'No IMINT verification concerns. Available imagery authenticated. Anchors: NATO OSINT Handbook; C2PA content provenance standards; UK Home Office document verification guidance.',
      []);
  }

  const finalScore = clamp(score, 0, 0.9);
  return build(modeId, cat, facs, finalScore, 0.65,
    `IMINT verification: ${signals.length} authenticity concern(s). Anchors: C2PA content provenance specification; NATO OSINT Handbook; NIST FIPS 186-5 digital signature standards; UK IDVT (Identity Document Validation Technology) framework. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- humint_reliability_grade ---
interface HumintRecord {
  sourceId: string;
  sourceGrade?: string; // A-F (NATO admiralty)
  informationGrade?: string; // 1-6
  corroborated?: boolean;
  sourceMotivation?: string;
}

const humintReliabilityGradeApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'osint';
  const facs: FacultyId[] = ['intelligence', 'reasoning'];
  const modeId = 'humint_reliability_grade';

  const records = evArr<HumintRecord>(ctx, 'humintRecords');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;
  let conf = 0.3;

  const gradeWeights: Record<string, number> = { A: 0.95, B: 0.8, C: 0.6, D: 0.4, E: 0.2, F: 0.05 };
  const infoWeights: Record<string, number> = { '1': 0.95, '2': 0.8, '3': 0.6, '4': 0.4, '5': 0.2, '6': 0.05 };

  for (const r of records) {
    const sg = gradeWeights[r.sourceGrade?.toUpperCase() ?? 'F'] ?? 0.3;
    const ig = infoWeights[r.informationGrade ?? '6'] ?? 0.3;
    const composite = (sg + ig) / 2;
    conf = Math.min(0.88, conf + composite * 0.15);

    if (!r.corroborated && composite < 0.5) {
      score += 0.2;
      signals.push(`Source ${r.sourceId}: low reliability (${r.sourceGrade}/${r.informationGrade}), uncorroborated`);
    }
    if (r.sourceMotivation === 'unknown' || r.sourceMotivation === 'hostile') {
      score += 0.15;
      signals.push(`Source ${r.sourceId}: questionable motivation (${r.sourceMotivation})`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['humint', 'informant', 'source reliability', 'intelligence report', 'tip-off', 'whistleblower']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.04; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (records.length === 0 && signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.2,
      'No HUMINT records provided. Reliability grading not possible. Anchors: NATO Admiralty Source/Information grading (A-F / 1-6); UK Joint Intelligence Committee standards.',
      []);
  }

  return build(modeId, cat, facs, clamp(score, 0, 0.85), conf,
    `HUMINT reliability: ${records.length} source(s) assessed. ${signals.length} reliability concern(s). Anchors: NATO Admiralty Code (source A-F, information 1-6); UK JIC assessment standards; Five Eyes OSINT protocols. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- nato_admiralty_grading ---
interface AdmiraltyRecord {
  reportId: string;
  sourceReliability?: string; // A-F
  informationCredibility?: string; // 1-6
  contentSummary?: string;
}

const natoAdmiraltyGradingApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'osint';
  const facs: FacultyId[] = ['intelligence', 'reasoning'];
  const modeId = 'nato_admiralty_grading';

  const records = evArr<AdmiraltyRecord>(ctx, 'admiraltyRecords');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;
  let conf = 0.3;

  // Reliability: A=fully reliable, F=unreliable; Credibility: 1=confirmed, 6=truth cannot be judged
  const reliabilityScore: Record<string, number> = { A: 1, B: 0.8, C: 0.6, D: 0.4, E: 0.2, F: 0 };
  const credibilityScore: Record<string, number> = { '1': 1, '2': 0.8, '3': 0.6, '4': 0.4, '5': 0.2, '6': 0 };

  for (const r of records) {
    const rs = reliabilityScore[r.sourceReliability?.toUpperCase() ?? 'F'] ?? 0.3;
    const cs = credibilityScore[r.informationCredibility ?? '6'] ?? 0.3;
    const composite = (rs + cs) / 2;
    conf = Math.min(0.88, conf + composite * 0.12);

    if (rs < 0.4 && cs < 0.4) {
      score += 0.15;
      signals.push(`Report ${r.reportId}: low-quality intel (${r.sourceReliability}/${r.informationCredibility}) — ${r.contentSummary?.slice(0, 80) ?? ''}`);
    } else if (composite >= 0.7) {
      // High-quality intel pointing at something concerning should raise score if content has concern kw
      const contentText = (r.contentSummary ?? '').toLowerCase();
      const concernKw = ['sanction', 'terror', 'launder', 'fraud', 'corruption', 'bribe', 'weapon'];
      const kwHit = concernKw.filter((k) => contentText.includes(k));
      if (kwHit.length) {
        score += 0.3;
        signals.push(`Report ${r.reportId}: high-confidence intel (${r.sourceReliability}/${r.informationCredibility}) flagging: ${kwHit.join(', ')}`);
      }
    }
  }

  if (records.length === 0) {
    const kwHits: string[] = [];
    for (const kw of ['admiralty', 'nato', 'intelligence grade', 'source reliability', 'information credibility']) {
      if (text.includes(kw)) kwHits.push(kw);
    }
    if (kwHits.length) { score += kwHits.length * 0.05; signals.push(`Narrative: ${kwHits.join(', ')}`); }
  }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.25,
      'No admiralty-graded reports supplied. Cannot perform NATO source/information quality assessment. Anchors: NATO Bi-Strategic Command Directive (BI-SC) OSINT guidance; AJP-2.0 Allied Joint Doctrine for Intelligence.',
      []);
  }

  return build(modeId, cat, facs, clamp(score, 0, 0.9), conf,
    `NATO admiralty grading: ${records.length} report(s). ${signals.length} quality concern(s). Anchors: NATO Admiralty Code (AJP-2.0); UK JIC Red Book standards; Five Eyes intelligence sharing protocols (UKUSA Agreement). ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- osint_chain_of_custody ---
interface OsintCocRecord {
  artifactId: string;
  collectedBy?: string;
  collectionMethod?: string;
  timestamp?: string;
  hashVerified?: boolean;
  chainBreaks?: number;
}

const osintChainOfCustodyApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'osint';
  const facs: FacultyId[] = ['intelligence', 'data_analysis'];
  const modeId = 'osint_chain_of_custody';

  const records = evArr<OsintCocRecord>(ctx, 'osintCocRecords');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  for (const r of records) {
    if (!r.hashVerified) {
      score += 0.15;
      signals.push(`Artifact ${r.artifactId}: no cryptographic hash verification — integrity unconfirmed`);
    }
    if ((r.chainBreaks ?? 0) > 0) {
      score += r.chainBreaks! * 0.2;
      signals.push(`Artifact ${r.artifactId}: ${r.chainBreaks} chain-of-custody break(s) — admissibility risk`);
    }
    if (!r.collectedBy || !r.collectionMethod) {
      score += 0.1;
      signals.push(`Artifact ${r.artifactId}: incomplete provenance (collector/method missing)`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['chain of custody', 'provenance', 'hash verification', 'osint artifact', 'evidence integrity', 'metadata strip']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.05; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.3,
      'OSINT chain of custody intact. All artifacts hash-verified and fully attributed. Anchors: INTERPOL Digital Evidence Handbook; UK College of Policing Digital Forensics; ACPO PACE Digital Evidence principles.',
      []);
  }

  const finalScore = clamp(score, 0, 0.85);
  return build(modeId, cat, facs, finalScore, 0.65,
    `OSINT chain of custody: ${signals.length} integrity concern(s). Anchors: ACPO PACE Digital Evidence Principles; UK College of Policing Digital Forensics guidance; INTERPOL Digital Evidence Handbook v2; ISO/IEC 27037 digital evidence. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// ============================================================================
// THREAT MODELING (7 modes)
// ============================================================================

// --- adversarial_simulation ---
interface AdversarialRecord {
  scenarioId: string;
  attackVector?: string;
  successProbability?: number; // 0-1
  detectionEvasionScore?: number; // 0-1
  targetedControl?: string;
}

const adversarialSimulationApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'threat_modeling';
  const facs: FacultyId[] = ['reasoning', 'deep_thinking'];
  const modeId = 'adversarial_simulation';

  const records = evArr<AdversarialRecord>(ctx, 'adversarialScenarios');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  for (const r of records) {
    const sp = r.successProbability ?? 0;
    const de = r.detectionEvasionScore ?? 0;
    const composite = (sp + de) / 2;
    if (composite >= 0.6) {
      score += composite * 0.5;
      signals.push(`Scenario ${r.scenarioId}: high-risk (success ${(sp * 100).toFixed(0)}%, evasion ${(de * 100).toFixed(0)}%) via ${r.attackVector ?? 'unknown'} targeting ${r.targetedControl ?? 'unknown control'}`);
    } else if (composite >= 0.3) {
      score += composite * 0.25;
      signals.push(`Scenario ${r.scenarioId}: moderate risk (${r.attackVector ?? 'unknown'})`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['red team', 'adversarial', 'attack vector', 'control bypass', 'evasion technique', 'kill chain', 'mitre att&ck']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.06; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.25,
      'No adversarial simulation records. No high-risk attack scenarios modelled. Anchors: MITRE ATT&CK framework; FATF AML control testing guidance; CBEST/TIBER-EU threat intelligence framework.',
      []);
  }

  const finalScore = clamp(score, 0, 0.95);
  return build(modeId, cat, facs, finalScore, 0.65,
    `Adversarial simulation: ${signals.length} scenario(s) flagged. Anchors: MITRE ATT&CK for Financial Services; TIBER-EU framework (ECB 2018); CBEST (Bank of England); FATF AML/CFT internal control testing. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- deception_detection ---
interface DeceptionRecord {
  statementId: string;
  statedFact?: string;
  verifiedFact?: string;
  inconsistencyCount?: number;
  linguisticDeceptionScore?: number; // 0-1
}

const deceptionDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'threat_modeling';
  const facs: FacultyId[] = ['reasoning', 'intelligence'];
  const modeId = 'deception_detection';

  const records = evArr<DeceptionRecord>(ctx, 'deceptionRecords');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  for (const r of records) {
    if (r.statedFact && r.verifiedFact && r.statedFact !== r.verifiedFact) {
      score += 0.3;
      signals.push(`Statement ${r.statementId}: stated "${r.statedFact?.slice(0, 60)}" — contradicted by "${r.verifiedFact?.slice(0, 60)}"`);
    }
    if ((r.inconsistencyCount ?? 0) >= 3) {
      score += 0.25;
      signals.push(`Statement ${r.statementId}: ${r.inconsistencyCount} internal inconsistencies`);
    }
    if ((r.linguisticDeceptionScore ?? 0) >= 0.7) {
      score += 0.2;
      signals.push(`Statement ${r.statementId}: linguistic deception score ${(r.linguisticDeceptionScore! * 100).toFixed(0)}%`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['deception', 'inconsistency', 'fabrication', 'false statement', 'misrepresentation', 'contradiction', 'lied']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.07; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.25,
      'No deception indicators detected. Statements consistent with verified facts. Anchors: FBI Behavioral Analysis Unit interview protocols; Reid technique validation studies; PEACE (UK) interview framework.',
      []);
  }

  const finalScore = clamp(score, 0, 0.9);
  return build(modeId, cat, facs, finalScore, 0.6,
    `Deception detection: ${signals.length} indicator(s). Anchors: PEACE interview framework (UK College of Policing); Statement Validity Analysis (SVA/CBCA); SCAN (Scientific Content Analysis); FATF EDD guidance on customer statement verification. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- counter_intelligence ---
interface CounterIntelRecord {
  incidentId: string;
  indicator?: string;
  targetedAsset?: string;
  attributedActor?: string;
  nssIndicator?: boolean; // national security service indicator
}

const counterIntelligenceApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'threat_modeling';
  const facs: FacultyId[] = ['intelligence', 'geopolitical_awareness'];
  const modeId = 'counter_intelligence';

  const records = evArr<CounterIntelRecord>(ctx, 'counterIntelRecords');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  for (const r of records) {
    if (r.nssIndicator === true) {
      score += 0.45;
      signals.push(`Incident ${r.incidentId}: national security service involvement indicator — ${r.attributedActor ?? 'unattributed'}`);
    }
    if (r.indicator) {
      score += 0.2;
      signals.push(`Incident ${r.incidentId}: CI indicator — ${r.indicator}`);
    }
    if (r.targetedAsset) {
      score += 0.1;
      signals.push(`Targeted asset: ${r.targetedAsset}`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['espionage', 'state actor', 'intelligence service', 'fsb', 'mss', 'irgc', 'insider threat', 'mole', 'exfiltration', 'classified']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.1; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.25,
      'No counter-intelligence indicators. No state-actor attribution or targeted asset compromise signals. Anchors: UK Security Service MI5 CPNI threat taxonomy; CISA state-actor threat advisories; FATF proliferation financing guidance.',
      []);
  }

  const finalScore = clamp(score, 0, 0.95);
  return build(modeId, cat, facs, finalScore, 0.65,
    `Counter-intelligence: ${signals.length} indicator(s). Anchors: UK CPNI (Centre for Protection of National Infrastructure) guidance; MI5 espionage threat taxonomy; CISA 2024 state-actor advisories; FATF PF guidance (Oct 2021). ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- false_flag_check ---
interface FalseFlagRecord {
  eventId: string;
  attributedTo?: string;
  alternativeAttributions?: string[];
  evidenceStrength?: number; // 0-1
  beneficiary?: string;
}

const falseFlagCheckApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'threat_modeling';
  const facs: FacultyId[] = ['reasoning', 'intelligence'];
  const modeId = 'false_flag_check';

  const records = evArr<FalseFlagRecord>(ctx, 'falseFlagRecords');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  for (const r of records) {
    const altCount = (r.alternativeAttributions ?? []).length;
    if (altCount >= 2 && (r.evidenceStrength ?? 1) < 0.5) {
      score += 0.35;
      signals.push(`Event ${r.eventId}: weak attribution to "${r.attributedTo}" with ${altCount} alternative(s) — possible false flag`);
    }
    if (r.beneficiary && r.beneficiary !== r.attributedTo) {
      score += 0.2;
      signals.push(`Event ${r.eventId}: primary beneficiary (${r.beneficiary}) differs from attributed actor (${r.attributedTo})`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['false flag', 'false attribution', 'disinformation', 'provocation', 'masquerade', 'impersonation', 'proxy attack']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.08; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.25,
      'No false flag indicators. Attributions internally consistent with evidence. Anchors: UK JIC analytical standards; NATO Information Environment framework; CISA disinformation playbook.',
      []);
  }

  const finalScore = clamp(score, 0, 0.9);
  return build(modeId, cat, facs, finalScore, 0.55,
    `False flag check: ${signals.length} attribution anomaly(ies). Anchors: UK JIC Red Book; NATO Strategic Communications Centre; CISA disinformation guidance; ODNI analytic standards (ICD 203). ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- honey_trap_pattern ---
interface HoneyTrapRecord {
  subjectId: string;
  contactInitiatedBy?: string;
  unusuallyFavorableTerms?: boolean;
  acceleratedIntimacy?: boolean;
  informationRequested?: string[];
  financialInducement?: boolean;
}

const honeyTrapPatternApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'threat_modeling';
  const facs: FacultyId[] = ['intelligence', 'reasoning'];
  const modeId = 'honey_trap_pattern';

  const records = evArr<HoneyTrapRecord>(ctx, 'honeyTrapRecords');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  for (const r of records) {
    if (r.unusuallyFavorableTerms === true) { score += 0.2; signals.push(`${r.subjectId}: unusually favorable commercial terms offered`); }
    if (r.acceleratedIntimacy === true) { score += 0.2; signals.push(`${r.subjectId}: accelerated relationship development pattern`); }
    if ((r.informationRequested ?? []).length >= 2) {
      score += 0.25;
      signals.push(`${r.subjectId}: sensitive information targeted: ${r.informationRequested?.slice(0, 3).join(', ')}`);
    }
    if (r.financialInducement === true) { score += 0.2; signals.push(`${r.subjectId}: financial inducement detected`); }
  }

  const kwHits: string[] = [];
  for (const kw of ['honey trap', 'honeypot', 'romantic approach', 'elicitation', 'entrapment', 'sexual compromise', 'kompromat']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.1; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.2,
      'No honey trap pattern indicators. No elicitation, inducement, or accelerated-intimacy signals. Anchors: UK CPNI "Protect" personnel security framework; MI5 hostile state actor guidance.',
      []);
  }

  const finalScore = clamp(score, 0, 0.9);
  return build(modeId, cat, facs, finalScore, 0.6,
    `Honey trap pattern: ${signals.length} signal(s). Anchors: UK CPNI Personnel Security (HMG); MI5 espionage threat guidance; ODNI CI awareness programme; NCSC Secure Business Travel guidance. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- cover_story_stress ---
interface CoverStoryRecord {
  storyId: string;
  claimedOccupation?: string;
  claimedResidence?: string;
  claimedIncomeSource?: string;
  inconsistencies?: string[];
  verificationFailures?: string[];
}

const coverStoryStressApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'threat_modeling';
  const facs: FacultyId[] = ['reasoning', 'intelligence'];
  const modeId = 'cover_story_stress';

  const records = evArr<CoverStoryRecord>(ctx, 'coverStoryRecords');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  for (const r of records) {
    const inconsistencies = r.inconsistencies ?? [];
    const failures = r.verificationFailures ?? [];
    if (inconsistencies.length >= 2) {
      score += inconsistencies.length * 0.12;
      signals.push(`Story ${r.storyId}: ${inconsistencies.length} internal inconsistencies — ${inconsistencies.slice(0, 2).join('; ')}`);
    }
    if (failures.length >= 1) {
      score += failures.length * 0.15;
      signals.push(`Story ${r.storyId}: ${failures.length} verification failure(s) — ${failures.slice(0, 2).join('; ')}`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['cover story', 'legend', 'false identity', 'fabricated', 'bogus', 'fictitious', 'sham employment', 'shell income']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.08; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.25,
      'Cover story stress test: no inconsistencies or verification failures. Occupation, residence, and income claims validated. Anchors: FATF R.10 CDD; UK JMLSG guidance Part I §5; UAE CBUAE AML Notice 2021/1.',
      []);
  }

  const finalScore = clamp(score, 0, 0.9);
  return build(modeId, cat, facs, finalScore, 0.65,
    `Cover story stress: ${signals.length} concern(s). Anchors: FATF R.10 customer due diligence; UK JMLSG Part I §5 CDD requirements; UAE CBUAE AML Notice 2021/1; ACAMS EDD best practices. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- legend_verification ---
interface LegendRecord {
  legendId: string;
  documentType?: string;
  issuingAuthority?: string;
  biometricMatch?: boolean;
  registryConfirmed?: boolean;
  ageConsistency?: boolean;
}

const legendVerificationApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'threat_modeling';
  const facs: FacultyId[] = ['intelligence', 'data_analysis'];
  const modeId = 'legend_verification';

  const records = evArr<LegendRecord>(ctx, 'legendRecords');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  for (const r of records) {
    if (r.biometricMatch === false) {
      score += 0.4;
      signals.push(`Legend ${r.legendId}: biometric mismatch on ${r.documentType ?? 'document'}`);
    }
    if (r.registryConfirmed === false) {
      score += 0.35;
      signals.push(`Legend ${r.legendId}: issuing authority registry (${r.issuingAuthority ?? 'unknown'}) does not confirm document`);
    }
    if (r.ageConsistency === false) {
      score += 0.2;
      signals.push(`Legend ${r.legendId}: age/DOB inconsistency in document set`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['false identity', 'forged passport', 'legend', 'synthetic identity', 'identity fraud', 'document forgery', 'fake id']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.09; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.3,
      'Legend verification: no anomalies. Documents biometrically matched and registry-confirmed. Anchors: FATF Digital Identity Guidance 2020; ICAO Doc 9303 (machine-readable travel documents); UK IDVT framework.',
      []);
  }

  const finalScore = clamp(score, 0, 0.92);
  return build(modeId, cat, facs, finalScore, 0.72,
    `Legend verification: ${signals.length} document integrity failure(s). Anchors: ICAO Doc 9303 (MRTD specifications); FATF Digital Identity Guidance 2020; UK Home Office IDVT; INTERPOL MIND/FIND lost/stolen document databases. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// ============================================================================
// SECTORAL TYPOLOGY (8 modes)
// ============================================================================

// --- phantom_vessel ---
interface PhantomVesselRecord {
  imo?: string;
  vesselName?: string;
  flagState?: string;
  lastAisSignal?: string; // ISO date
  registryConfirmed?: boolean;
  physicallyObserved?: boolean;
  ownerVerified?: boolean;
}

const phantomVesselApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'sectoral_typology';
  const facs: FacultyId[] = ['data_analysis', 'forensic_accounting'];
  const modeId = 'phantom_vessel';

  const records = evArr<PhantomVesselRecord>(ctx, 'phantomVesselRecords');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  for (const r of records) {
    if (r.registryConfirmed === false) {
      score += 0.4;
      signals.push(`Vessel ${r.imo ?? r.vesselName ?? 'unknown'}: not confirmed in IMO Global Integrated Shipping Information System (GISIS)`);
    }
    if (r.physicallyObserved === false && r.lastAisSignal) {
      const aisDate = new Date(r.lastAisSignal);
      const daysSince = (Date.now() - aisDate.getTime()) / 86400000;
      if (daysSince > 180) {
        score += 0.35;
        signals.push(`Vessel ${r.imo ?? 'unknown'}: no physical observation + AIS dark for ${daysSince.toFixed(0)} days`);
      }
    }
    if (r.ownerVerified === false) {
      score += 0.2;
      signals.push(`Vessel ${r.imo ?? 'unknown'}: beneficial owner unverified`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['phantom vessel', 'ghost ship', 'ais dark', 'unregistered vessel', 'identity fraud vessel', 'imo fraud']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.1; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.3,
      'No phantom vessel indicators. Vessel registry and AIS consistent. Anchors: IMO SOLAS Chapter V; GISIS registry; OFAC Maritime Advisory 2020-05.',
      []);
  }

  const finalScore = clamp(score, 0, 0.92);
  return build(modeId, cat, facs, finalScore, 0.72,
    `Phantom vessel: ${signals.length} indicator(s). Anchors: IMO SOLAS Reg V/19 AIS obligations; IMO GISIS registry; OFAC Maritime Advisory 2020-05; FATF TF typologies shipping sector 2018. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- flag_hopping ---
interface FlagHoppingRecord {
  vesselId: string;
  flagChanges?: Array<{ fromFlag: string; toFlag: string; date: string }>;
  timespanDays?: number;
}

const flagHoppingApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'sectoral_typology';
  const facs: FacultyId[] = ['data_analysis', 'geopolitical_awareness'];
  const modeId = 'flag_hopping';

  const records = evArr<FlagHoppingRecord>(ctx, 'flagHoppingRecords');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  // Open / convenience registries used for sanction evasion
  const OPEN_REGISTRIES = new Set(['PA', 'LR', 'MH', 'BS', 'CY', 'BZ', 'KH', 'TZ', 'PK', 'ML']);

  for (const r of records) {
    const changes = r.flagChanges ?? [];
    const timespan = r.timespanDays ?? 365;

    if (changes.length >= 3 && timespan <= 365) {
      score += 0.35;
      signals.push(`Vessel ${r.vesselId}: ${changes.length} flag changes in ${timespan} days — sanction-evasion pattern`);
    } else if (changes.length >= 2) {
      score += 0.2;
      signals.push(`Vessel ${r.vesselId}: ${changes.length} flag changes`);
    }

    // Check if any flags are open registries
    for (const ch of changes) {
      if (OPEN_REGISTRIES.has(ch.toFlag)) {
        score += 0.12;
        signals.push(`Vessel ${r.vesselId}: re-flagged to open registry ${ch.toFlag} on ${ch.date}`);
      }
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['flag hop', 're-flag', 'flag of convenience', 'open registry', 'reflag', 'deregistration']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.08; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.3,
      'No flag-hopping detected. Flag history consistent. Anchors: UNCTAD Review of Maritime Transport; IMO Resolution A.1157(32); OFAC Maritime Advisory 2022.',
      []);
  }

  const finalScore = clamp(score, 0, 0.9);
  return build(modeId, cat, facs, finalScore, 0.7,
    `Flag hopping: ${signals.length} indicator(s). Anchors: UNCTAD Review of Maritime Transport 2023; IMO Resolution A.1157(32) genuine link; OFAC Maritime Advisory 2022; UNODC maritime crime threat assessment. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- dark_fleet_pattern ---
interface DarkFleetRecord {
  vesselId: string;
  aisGapsDays?: number;
  insurerType?: string; // p&i club, unknown, none
  cargoType?: string;
  lastPortState?: string;
  transponderManipulation?: boolean;
}

const darkFleetPatternApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'sectoral_typology';
  const facs: FacultyId[] = ['data_analysis', 'geopolitical_awareness'];
  const modeId = 'dark_fleet_pattern';

  const records = evArr<DarkFleetRecord>(ctx, 'darkFleetRecords');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  for (const r of records) {
    if ((r.aisGapsDays ?? 0) >= 7) {
      score += 0.3;
      signals.push(`Vessel ${r.vesselId}: AIS dark for ${r.aisGapsDays} days`);
    }
    if (r.insurerType === 'none' || r.insurerType === 'unknown') {
      score += 0.25;
      signals.push(`Vessel ${r.vesselId}: no recognised P&I club cover — dark fleet indicator`);
    }
    if (r.transponderManipulation === true) {
      score += 0.35;
      signals.push(`Vessel ${r.vesselId}: AIS transponder manipulation detected`);
    }
    if (['oil', 'petroleum', 'crude'].includes(r.cargoType ?? '') && RUSSIA_LINKED.has(r.lastPortState ?? '')) {
      score += 0.2;
      signals.push(`Vessel ${r.vesselId}: petroleum cargo, last port ${r.lastPortState} — Russian dark-fleet typology`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['dark fleet', 'shadow fleet', 'ais manipulation', 'gps spoofing', 'transponder off', 'uninsured vessel', 'ghost tanker']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.1; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.3,
      'No dark fleet pattern detected. AIS continuous, P&I cover confirmed. Anchors: IMO circ. MSC-FAL.1/Circ.3; BIMCO guidance on AIS; G7 Oil Price Cap compliance advisory.',
      []);
  }

  const finalScore = clamp(score, 0, 0.92);
  return build(modeId, cat, facs, finalScore, 0.75,
    `Dark fleet pattern: ${signals.length} indicator(s). Anchors: IMO MSC-FAL.1/Circ.3 AIS obligations; G7/EU Oil Price Cap compliance (Dec 2022); OFAC Maritime Advisory 2020-05; BIMCO/ICS AIS manipulation guidance; Lloyd's Market Association dark fleet alert 2023. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- front_company_fingerprint ---
interface FrontCompanyRecord {
  entityId: string;
  employeeCount?: number;
  revenueToTransactionRatio?: number;
  incorporationAge?: number; // months
  sharedAddressCount?: number;
  businessActivityMatch?: boolean;
}

const frontCompanyFingerprintApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'sectoral_typology';
  const facs: FacultyId[] = ['forensic_accounting', 'data_analysis'];
  const modeId = 'front_company_fingerprint';

  const records = evArr<FrontCompanyRecord>(ctx, 'frontCompanyRecords');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  for (const r of records) {
    const emp = r.employeeCount ?? 0;
    const ratio = r.revenueToTransactionRatio ?? 1;
    const age = r.incorporationAge ?? 999;

    if (emp === 0 || emp === 1) {
      score += 0.2;
      signals.push(`${r.entityId}: zero/single employee entity processing significant transactions`);
    }
    if (ratio > 10) {
      score += 0.35;
      signals.push(`${r.entityId}: transaction volume ${ratio.toFixed(1)}× stated revenue — financial mismatch`);
    }
    if (age <= 3 && ratio > 5) {
      score += 0.25;
      signals.push(`${r.entityId}: ${age}-month-old company with high transaction-to-revenue ratio`);
    }
    if ((r.sharedAddressCount ?? 0) >= 5) {
      score += 0.2;
      signals.push(`${r.entityId}: address shared with ${r.sharedAddressCount} other entities`);
    }
    if (r.businessActivityMatch === false) {
      score += 0.25;
      signals.push(`${r.entityId}: declared business activity inconsistent with transaction patterns`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['front company', 'shell company', 'nominee director', 'no employees', 'brass plate', 'letterbox company', 'sham company']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.08; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.3,
      'No front company fingerprint. Employee count, revenues, and business activities consistent. Anchors: FATF R.24 beneficial ownership; EU 5AMLD Art.30; UNODC front company typologies.',
      []);
  }

  const finalScore = clamp(score, 0, 0.92);
  return build(modeId, cat, facs, finalScore, 0.73,
    `Front company fingerprint: ${signals.length} indicator(s). Anchors: FATF R.24 transparency of legal persons; EU 5AMLD (2018/843) Art.30 UBO registers; UNODC front company ML typologies; UK Companies House reform (ECCT Act 2023). ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- nominee_rotation_detection ---
interface NomineeRotationRecord {
  entityId: string;
  directorChanges?: number; // in 24 months
  shareholderChanges?: number;
  sameNomineeProvider?: boolean;
  avgTenureMonths?: number;
}

const nomineeRotationDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'sectoral_typology';
  const facs: FacultyId[] = ['forensic_accounting', 'data_analysis'];
  const modeId = 'nominee_rotation_detection';

  const records = evArr<NomineeRotationRecord>(ctx, 'nomineeRotationRecords');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  for (const r of records) {
    if ((r.directorChanges ?? 0) >= 4) {
      score += 0.3;
      signals.push(`${r.entityId}: ${r.directorChanges} director changes in 24 months — nominee rotation pattern`);
    }
    if ((r.shareholderChanges ?? 0) >= 3) {
      score += 0.2;
      signals.push(`${r.entityId}: ${r.shareholderChanges} shareholder changes — possible layering`);
    }
    if (r.sameNomineeProvider === true) {
      score += 0.2;
      signals.push(`${r.entityId}: linked to professional nominee provider`);
    }
    if ((r.avgTenureMonths ?? 99) <= 6) {
      score += 0.15;
      signals.push(`${r.entityId}: average director tenure ${r.avgTenureMonths} months — transient nominee`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['nominee', 'director change', 'shareholder rotation', 'straw director', 'trust company', 'registered agent']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.07; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.3,
      'No nominee rotation detected. Director and shareholder stability adequate. Anchors: FATF R.24/25; EU 5AMLD Art.30; UK PSC register requirements.',
      []);
  }

  const finalScore = clamp(score, 0, 0.9);
  return build(modeId, cat, facs, finalScore, 0.7,
    `Nominee rotation: ${signals.length} indicator(s). Anchors: FATF R.24 transparency of legal persons; EU 5AMLD Art.30 UBO; UK Persons of Significant Control (PSC) Reg 2016; OECD Behind the Corporate Veil report. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- bvi_cook_island_chain ---
interface BviChainRecord {
  entityId: string;
  chainJurisdictions?: string[]; // ordered chain
  chainLength?: number;
  ultimateBeneficiaryKnown?: boolean;
  trustStructure?: boolean;
}

const bviCookIslandChainApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'sectoral_typology';
  const facs: FacultyId[] = ['forensic_accounting', 'data_analysis'];
  const modeId = 'bvi_cook_island_chain';

  const records = evArr<BviChainRecord>(ctx, 'bviChainRecords');
  const text = freeTextOf(ctx);
  const jurs = subjectJurisdictions(ctx);
  const signals: string[] = [];
  let score = 0;

  const HIGH_SECRECY_CHAIN = new Set(['VG', 'KY', 'CK', 'WS', 'NR', 'PA', 'LR']);

  // Check subject jurisdictions
  const chainHits = jurs.filter((j) => HIGH_SECRECY_CHAIN.has(j));
  if (chainHits.length >= 2) {
    score += chainHits.length * 0.18;
    signals.push(`Multiple high-secrecy jurisdictions in chain: ${chainHits.join(' → ')}`);
  }

  for (const r of records) {
    const chainJurs = r.chainJurisdictions ?? [];
    const secrecyCount = chainJurs.filter((j) => HIGH_SECRECY_CHAIN.has(j)).length;
    if (secrecyCount >= 2) {
      score += secrecyCount * 0.15;
      signals.push(`${r.entityId}: ${secrecyCount} high-secrecy jurisdictions in ownership chain`);
    }
    if ((r.chainLength ?? 0) >= 5) {
      score += 0.2;
      signals.push(`${r.entityId}: ownership chain depth ${r.chainLength} — opacity layering`);
    }
    if (r.ultimateBeneficiaryKnown === false) {
      score += 0.3;
      signals.push(`${r.entityId}: ultimate beneficial owner unknown`);
    }
    if (r.trustStructure === true && secrecyCount >= 1) {
      score += 0.2;
      signals.push(`${r.entityId}: Cook Island / offshore trust structure — asset protection / concealment risk`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['bvi', 'british virgin island', 'cook island', 'cayman', 'panama', 'offshore chain', 'nevis', 'trust', 'foundation']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += Math.min(kwHits.length * 0.07, 0.25); signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.3,
      'No BVI/Cook Island chain detected. UBO chain transparent and within low-secrecy jurisdictions. Anchors: FATF R.24/25; EU 5AMLD Art.30/31; OECD BEPS Action 5.',
      jurs.map((j) => `jurisdiction=${j}`),
    );
  }

  const finalScore = clamp(score, 0, 0.92);
  return build(modeId, cat, facs, finalScore, 0.73,
    `BVI/Cook Island chain: ${signals.length} opacity indicator(s). Anchors: FATF R.24/25 beneficial ownership; EU 5AMLD Art.30/31; UK Economic Crime and Corporate Transparency Act 2023; Tax Justice Network FSI 2023. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- freeport_risk ---
interface FreeportRecord {
  freeportId: string;
  jurisdiction?: string;
  assetType?: string; // art, gold, gemstone, etc.
  storageDurationYears?: number;
  kycOnDepositor?: boolean;
  beneficialOwnerDisclosed?: boolean;
}

const freeportRiskApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'sectoral_typology';
  const facs: FacultyId[] = ['forensic_accounting', 'geopolitical_awareness'];
  const modeId = 'freeport_risk';

  const records = evArr<FreeportRecord>(ctx, 'freeportRecords');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  // High-risk freeport jurisdictions
  const FREEPORT_RISK_JURS = new Set(['CH', 'LU', 'SG', 'AE', 'HK', 'MT', 'PA']);

  for (const r of records) {
    if (r.kycOnDepositor === false) {
      score += 0.35;
      signals.push(`Freeport ${r.freeportId}: no KYC on depositor — FATF DNFBP gap`);
    }
    if (r.beneficialOwnerDisclosed === false) {
      score += 0.3;
      signals.push(`Freeport ${r.freeportId}: beneficial owner of stored asset undisclosed`);
    }
    if ((r.storageDurationYears ?? 0) >= 5) {
      score += 0.15;
      signals.push(`Freeport ${r.freeportId}: ${r.storageDurationYears}-year storage — value-storage layering`);
    }
    if (r.jurisdiction && FREEPORT_RISK_JURS.has(r.jurisdiction) &&
        ['art', 'gold', 'gemstone', 'diamond', 'antiquity'].includes(r.assetType ?? '')) {
      score += 0.2;
      signals.push(`Freeport ${r.freeportId}: high-value ${r.assetType} in ${r.jurisdiction} freeport — FATF DNFBP art market typology`);
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['freeport', 'free trade zone', 'bonded warehouse', 'geneva freeport', 'singapore freeport', 'duty free storage', 'art storage']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.08; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.3,
      'No freeport risk indicators. KYC and beneficial ownership disclosed for stored assets. Anchors: FATF DNFBP guidance 2020; EU 5AMLD Art.2(1)(e) art market; UK Money Laundering Regs 2017 (Art Market Participants).',
      []);
  }

  const finalScore = clamp(score, 0, 0.9);
  return build(modeId, cat, facs, finalScore, 0.7,
    `Freeport risk: ${signals.length} indicator(s). Anchors: FATF Guidance on AML/CFT for Art and Antiquities (2023); EU 5AMLD Art.2(1)(e) art market participants; UK Money Laundering Regs 2017 (AMP); Basel AML Index freeport risks. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// --- ucp600_discipline ---
interface Ucp600Record {
  lcId: string;
  discrepancyCount?: number;
  waiveredDiscrepancies?: number;
  presentingBankCountry?: string;
  issuingBankCountry?: string;
  docAuthenticityScore?: number; // 0-1
  overInvoicedPct?: number;     // percentage overinvoiced
}

const ucp600DisciplineApply = async (ctx: BrainContext): Promise<Finding> => {
  const cat: ReasoningCategory = 'sectoral_typology';
  const facs: FacultyId[] = ['forensic_accounting', 'data_analysis'];
  const modeId = 'ucp600_discipline';

  const records = evArr<Ucp600Record>(ctx, 'ucp600Records');
  const text = freeTextOf(ctx);
  const signals: string[] = [];
  let score = 0;

  for (const r of records) {
    const disc = r.discrepancyCount ?? 0;
    const waiv = r.waiveredDiscrepancies ?? 0;

    if (waiv >= 3) {
      score += 0.25;
      signals.push(`LC ${r.lcId}: ${waiv} waivered discrepancies — TBML indicator (UCP 600 Art.16 abuse)`);
    }
    if (disc >= 5) {
      score += 0.15;
      signals.push(`LC ${r.lcId}: ${disc} documentary discrepancies`);
    }
    if ((r.docAuthenticityScore ?? 1) < 0.5) {
      score += 0.4;
      signals.push(`LC ${r.lcId}: document authenticity score ${((r.docAuthenticityScore ?? 0) * 100).toFixed(0)}% — fraudulent document risk`);
    }
    if ((r.overInvoicedPct ?? 0) >= 20) {
      score += 0.35;
      signals.push(`LC ${r.lcId}: over-invoiced ${r.overInvoicedPct?.toFixed(0)}% vs market benchmark — TBML pricing manipulation`);
    }
    // High-risk country pairs
    if (r.presentingBankCountry && r.issuingBankCountry) {
      const bothHighRisk = [r.presentingBankCountry, r.issuingBankCountry].every(
        (c) => FATF_CFA.has(c) || FATF_GREY.has(c),
      );
      if (bothHighRisk) {
        score += 0.2;
        signals.push(`LC ${r.lcId}: both presenting (${r.presentingBankCountry}) and issuing (${r.issuingBankCountry}) in high-risk jurisdictions`);
      }
    }
  }

  const kwHits: string[] = [];
  for (const kw of ['letter of credit', 'documentary credit', 'ucp 600', 'ucp600', 'trade finance', 'bill of lading', 'tbml', 'over-invoicing', 'discrepancy waiver']) {
    if (text.includes(kw)) kwHits.push(kw);
  }
  if (kwHits.length) { score += kwHits.length * 0.06; signals.push(`Narrative: ${kwHits.join(', ')}`); }

  if (signals.length === 0) {
    return build(modeId, cat, facs, 0, 0.3,
      'No UCP 600 discipline concerns. Documentary credit handling compliant. Anchors: ICC UCP 600 (2007); FATF Trade-Based Money Laundering 2020; Wolfsberg Trade Finance Principles 2019.',
      []);
  }

  const finalScore = clamp(score, 0, 0.92);
  return build(modeId, cat, facs, finalScore, 0.73,
    `UCP 600 discipline: ${signals.length} concern(s). Anchors: ICC UCP 600 (2007) — Art.14 standard examination, Art.16 discrepancy handling; FATF Trade-Based Money Laundering report 2020; Wolfsberg Trade Finance Principles 2019; IFC/ADB TBML typologies. ${signals.slice(0, 5).join('; ')}.`,
    signals.slice(0, 8),
  );
};

// ============================================================================
// Export
// ============================================================================

export const WAVE4_BATCH_A_APPLIES: Record<string, (ctx: BrainContext) => Promise<Finding>> = {
  // compliance_framework
  sanctions_arbitrage: sanctionsArbitrageApply,
  offshore_secrecy_index: offshoreSecrecyIndexApply,
  fatf_grey_list_dynamics: fatfGreyListDynamicsApply,
  secrecy_jurisdiction_scoring: secrecyJurisdictionScoringApply,
  russian_oil_price_cap: russianOilPriceCapApply,
  eu_14_package: eu14PackageApply,
  us_secondary_sanctions: usSecondarySanctionsApply,
  chip_export_controls: chipExportControlsApply,
  iran_evasion_pattern: iranEvasionPatternApply,
  dprk_evasion_pattern: dprkEvasionPatternApply,
  // osint
  socmint_scan: socmintScanApply,
  geoint_plausibility: geointPlausibilityApply,
  imint_verification: imintVerificationApply,
  humint_reliability_grade: humintReliabilityGradeApply,
  nato_admiralty_grading: natoAdmiraltyGradingApply,
  osint_chain_of_custody: osintChainOfCustodyApply,
  // threat_modeling
  adversarial_simulation: adversarialSimulationApply,
  deception_detection: deceptionDetectionApply,
  counter_intelligence: counterIntelligenceApply,
  false_flag_check: falseFlagCheckApply,
  honey_trap_pattern: honeyTrapPatternApply,
  cover_story_stress: coverStoryStressApply,
  legend_verification: legendVerificationApply,
  // sectoral_typology
  phantom_vessel: phantomVesselApply,
  flag_hopping: flagHoppingApply,
  dark_fleet_pattern: darkFleetPatternApply,
  front_company_fingerprint: frontCompanyFingerprintApply,
  nominee_rotation_detection: nomineeRotationDetectionApply,
  bvi_cook_island_chain: bviCookIslandChainApply,
  freeport_risk: freeportRiskApply,
  ucp600_discipline: ucp600DisciplineApply,
};
