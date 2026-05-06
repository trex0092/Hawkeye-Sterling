// Hawkeye Sterling — probabilistic regulatory ontology (audit follow-up #8).
//
// Replaces the string-citation pattern with a typed ontology graph that
// the brain can reason structurally over: predicate offences (FATF 40),
// triggering thresholds (UAE/EU/US), sanctions regimes, exemptions, and
// the citations that prove each. Modes can ASK the ontology questions
// like "what's the predicate offence for invoice manipulation under
// UAE?" or "below what threshold is SDD permitted in Cabinet Res
// 134/2025?" — and get back typed answers, not text matches.

export type Jurisdiction = 'UAE' | 'EU' | 'US' | 'UK' | 'GLOBAL';
export type RegulatoryFamily = 'AML' | 'CFT' | 'PF' | 'TFS' | 'TBML' | 'PRIVACY' | 'EXPORT_CONTROL';

export interface PredicateOffence {
  id: string;                    // canonical id e.g. 'predicate.tax_evasion'
  name: string;
  family: RegulatoryFamily;
  fatfTypology: string[];        // FATF designated category list
  uaeAnchor?: string;             // UAE Federal Decree-Law citation
  euAnchor?: string;              // 6AMLD reference
  usAnchor?: string;              // 18 USC §1956 etc.
}

export interface RegulatoryThreshold {
  id: string;
  name: string;
  jurisdiction: Jurisdiction;
  amount?: { value: number; currency: string };
  comparison: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  triggers: string[];             // what fires when this threshold is crossed
  citation: string;
}

export interface SanctionRegime {
  id: string;
  name: string;
  jurisdiction: Jurisdiction;
  family: 'TFS' | 'EXPORT_CONTROL' | 'COMPREHENSIVE' | 'SECTORAL';
  authority: string;              // OFAC / UN / EU / OFSI / EOCN
  appliesTo: string[];            // dnfbp / fi / vasp / individual / vessel
  citation: string;
}

export interface Exemption {
  id: string;
  appliesToThreshold?: string;
  appliesToOffence?: string;
  description: string;
  citation: string;
}

// ─── Catalogue (representative, not exhaustive) ─────────────────────────────

const PREDICATES: PredicateOffence[] = [
  {
    id: 'predicate.tax_evasion',
    name: 'Tax evasion / aggravated tax crime',
    family: 'AML',
    fatfTypology: ['tax_crimes'],
    uaeAnchor: 'UAE FDL 10/2025 Art.2 + UAE Federal Decree-Law 7/2017 (Tax Procedures)',
    euAnchor: '6AMLD Art.2(1)(s)',
    usAnchor: '26 USC §7201',
  },
  {
    id: 'predicate.bribery_corruption',
    name: 'Bribery and corruption',
    family: 'AML',
    fatfTypology: ['corruption_organised_crime'],
    uaeAnchor: 'UAE FDL 10/2025 Art.2 + UAE Federal Law 31/2021 (Penal Code) Art.234-244',
    euAnchor: '6AMLD Art.2(1)(c)',
    usAnchor: '15 USC §78dd-1 (FCPA)',
  },
  {
    id: 'predicate.terrorist_financing',
    name: 'Terrorist financing',
    family: 'CFT',
    fatfTypology: ['terrorist_financing'],
    uaeAnchor: 'UAE FDL 10/2025 Art.2 + UAE Federal Law 7/2014 (Combating Terrorism Crimes)',
    euAnchor: 'Directive 2017/541',
    usAnchor: '18 USC §2339B',
  },
  {
    id: 'predicate.proliferation_financing',
    name: 'Proliferation financing (WMD)',
    family: 'PF',
    fatfTypology: ['proliferation_financing'],
    uaeAnchor: 'UAE FDL 10/2025 + Cabinet Decision 74/2020 + Cabinet Resolution 156/2025',
    euAnchor: 'EU Reg 2021/821 (Dual-Use)',
    usAnchor: '50 USC §4811 (ECRA)',
  },
  {
    id: 'predicate.fraud_forgery',
    name: 'Fraud and forgery',
    family: 'AML',
    fatfTypology: ['ml_financial_crime'],
    uaeAnchor: 'UAE Federal Law 31/2021 (Penal Code) Art.451-470',
    euAnchor: '6AMLD Art.2(1)(p)',
    usAnchor: '18 USC §1343',
  },
  {
    id: 'predicate.drug_trafficking',
    name: 'Illicit trafficking in narcotic drugs and psychotropic substances',
    family: 'AML',
    fatfTypology: ['drug_trafficking'],
    uaeAnchor: 'UAE Federal Law 14/1995 + UAE FDL 10/2025 Art.2',
    euAnchor: '6AMLD Art.2(1)(b)',
    usAnchor: '21 USC §841',
  },
  {
    id: 'predicate.human_trafficking',
    name: 'Human trafficking and modern slavery',
    family: 'AML',
    fatfTypology: ['human_trafficking_modern_slavery'],
    uaeAnchor: 'UAE Federal Law 51/2006',
    euAnchor: 'Directive 2011/36/EU',
    usAnchor: '22 USC §7102',
  },
  {
    id: 'predicate.sanctions_evasion',
    name: 'Sanctions evasion',
    family: 'TFS',
    fatfTypology: ['sanctions_violations'],
    uaeAnchor: 'Cabinet Decision 74/2020 Art.4-7',
    euAnchor: 'EU Reg 833/2014 + 269/2014',
    usAnchor: '50 USC §1701 (IEEPA)',
  },
];

const THRESHOLDS: RegulatoryThreshold[] = [
  {
    id: 'threshold.uae.dpms.cash.55k',
    name: 'DPMS cash transaction reporting',
    jurisdiction: 'UAE',
    amount: { value: 55000, currency: 'AED' },
    comparison: 'gte',
    triggers: ['CTR (cash transaction report)', 'EDD documentation'],
    citation: 'Cabinet Res 134/2025 Art.12-14 + MoE Circular 3/2025',
  },
  {
    id: 'threshold.uae.dpms.aggregated.180d',
    name: 'DPMS aggregated transaction trigger',
    jurisdiction: 'UAE',
    amount: { value: 55000, currency: 'AED' },
    comparison: 'gte',
    triggers: ['EDD', 'STR if structuring suspected'],
    citation: 'Cabinet Res 134/2025 Art.13',
  },
  {
    id: 'threshold.eu.5amld.10k',
    name: 'EU 5AMLD anonymous prepaid card threshold',
    jurisdiction: 'EU',
    amount: { value: 10000, currency: 'EUR' },
    comparison: 'gte',
    triggers: ['EDD', 'identity verification mandatory'],
    citation: '5AMLD Art.12 (Directive 2018/843)',
  },
  {
    id: 'threshold.us.bsa.10k',
    name: 'US BSA cash transaction reporting',
    jurisdiction: 'US',
    amount: { value: 10000, currency: 'USD' },
    comparison: 'gt',
    triggers: ['CTR (FinCEN Form 112)'],
    citation: '31 USC §5313 + 31 CFR §1010.311',
  },
  {
    id: 'threshold.uae.travel_rule.aed.3500',
    name: 'UAE wire transfer travel-rule threshold',
    jurisdiction: 'UAE',
    amount: { value: 3500, currency: 'AED' },
    comparison: 'gte',
    triggers: ['originator + beneficiary information mandatory'],
    citation: 'CBUAE Wire Transfers Regulation + FATF R.16',
  },
  {
    id: 'threshold.uae.sdd.eligibility',
    name: 'UAE simplified due diligence eligibility',
    jurisdiction: 'UAE',
    comparison: 'lt',
    triggers: ['SDD permitted', 'no EDD required'],
    citation: 'MoE Circular 6/2025 (risk-based CDD/SDD)',
  },
];

const SANCTION_REGIMES: SanctionRegime[] = [
  {
    id: 'regime.un_1267',
    name: 'UN Security Council 1267 / 1988 / 2253',
    jurisdiction: 'GLOBAL',
    family: 'TFS',
    authority: 'UN Security Council',
    appliesTo: ['fi', 'dnfbp', 'individual', 'entity', 'vessel'],
    citation: 'UNSCR 1267 / 1988 / 2253',
  },
  {
    id: 'regime.uae_eocn',
    name: 'UAE Local Terrorist List (EOCN)',
    jurisdiction: 'UAE',
    family: 'TFS',
    authority: 'UAE EOCN',
    appliesTo: ['fi', 'dnfbp', 'individual', 'entity'],
    citation: 'Cabinet Decision 74/2020 + UAE FDL 10/2025',
  },
  {
    id: 'regime.ofac_sdn',
    name: 'OFAC Specially Designated Nationals',
    jurisdiction: 'US',
    family: 'COMPREHENSIVE',
    authority: 'US OFAC',
    appliesTo: ['us-person', 'usd-clearing', 'us-nexus'],
    citation: '50 USC §1701 (IEEPA) + 31 CFR Chapter V',
  },
  {
    id: 'regime.eu_consolidated',
    name: 'EU Consolidated Financial Sanctions',
    jurisdiction: 'EU',
    family: 'COMPREHENSIVE',
    authority: 'EU Council',
    appliesTo: ['eu-person', 'eu-territory'],
    citation: 'EU Reg 269/2014 + 833/2014 + Common Foreign & Security Policy decisions',
  },
  {
    id: 'regime.uk_ofsi',
    name: 'UK OFSI Consolidated List',
    jurisdiction: 'UK',
    family: 'COMPREHENSIVE',
    authority: 'UK Treasury / OFSI',
    appliesTo: ['uk-person', 'uk-territory'],
    citation: 'Sanctions and Anti-Money Laundering Act 2018',
  },
];

const EXEMPTIONS: Exemption[] = [
  {
    id: 'exemption.uae.charitable_humanitarian',
    appliesToThreshold: 'threshold.uae.dpms.cash.55k',
    description: 'Licensed humanitarian / charitable transactions (subject to MoE registration) may be eligible for proportionate documentation rather than full EDD.',
    citation: 'MoE Circular 3/2025 Annex',
  },
  {
    id: 'exemption.eu.low_risk_correspondent',
    appliesToThreshold: 'threshold.eu.5amld.10k',
    description: 'EU-headquartered correspondent FIs subject to equivalent AML supervision may invoke SDD per 5AMLD Art.16.',
    citation: '5AMLD Art.16',
  },
];

// ─── Public API ─────────────────────────────────────────────────────────────

export function predicateById(id: string): PredicateOffence | undefined {
  return PREDICATES.find((p) => p.id === id);
}

export function thresholdById(id: string): RegulatoryThreshold | undefined {
  return THRESHOLDS.find((t) => t.id === id);
}

export function regimeById(id: string): SanctionRegime | undefined {
  return SANCTION_REGIMES.find((r) => r.id === id);
}

export function predicatesByFamily(family: RegulatoryFamily): PredicateOffence[] {
  return PREDICATES.filter((p) => p.family === family);
}

export function thresholdsForJurisdiction(j: Jurisdiction): RegulatoryThreshold[] {
  return THRESHOLDS.filter((t) => t.jurisdiction === j);
}

export function regimesForJurisdiction(j: Jurisdiction): SanctionRegime[] {
  return SANCTION_REGIMES.filter((r) => r.jurisdiction === j || r.jurisdiction === 'GLOBAL');
}

export function exemptionsForThreshold(thresholdId: string): Exemption[] {
  return EXEMPTIONS.filter((e) => e.appliesToThreshold === thresholdId);
}

/** Given a transaction amount + jurisdiction, return the thresholds it
 *  triggers and the resulting regulatory obligations. */
export function evaluateAmount(amount: number, currency: string, jurisdiction: Jurisdiction): Array<{
  threshold: RegulatoryThreshold;
  triggered: boolean;
  obligations: string[];
  exemptions: Exemption[];
}> {
  const out: Array<{ threshold: RegulatoryThreshold; triggered: boolean; obligations: string[]; exemptions: Exemption[] }> = [];
  for (const t of THRESHOLDS) {
    if (t.jurisdiction !== jurisdiction) continue;
    if (!t.amount || t.amount.currency !== currency) continue;
    let triggered = false;
    switch (t.comparison) {
      case 'gt': triggered = amount > t.amount.value; break;
      case 'gte': triggered = amount >= t.amount.value; break;
      case 'lt': triggered = amount < t.amount.value; break;
      case 'lte': triggered = amount <= t.amount.value; break;
      case 'eq': triggered = amount === t.amount.value; break;
    }
    out.push({
      threshold: t,
      triggered,
      obligations: triggered ? t.triggers : [],
      exemptions: triggered ? exemptionsForThreshold(t.id) : [],
    });
  }
  return out;
}

/** Catalogue introspection — what does the ontology cover? */
export function catalogueSummary(): { predicates: number; thresholds: number; regimes: number; exemptions: number } {
  return {
    predicates: PREDICATES.length,
    thresholds: THRESHOLDS.length,
    regimes: SANCTION_REGIMES.length,
    exemptions: EXEMPTIONS.length,
  };
}

// ─── FDL Crosswalk: FDL 20/2018 → FDL 10/2025 (Item #38) ───────────────────
// Legal Counsel verified mapping. FDL 20/2018 (Federal Decree-Law No. 20 of 2018
// on Anti-Money Laundering and Combating the Financing of Terrorism and Financing
// of Illegal Organisations) was superseded by FDL 10/2025.  All citations in the
// codebase that reference FDL 20/2018 articles should resolve through this map.

export interface FdlCrosswalkEntry {
  readonly fdl20_2018_article: string;
  readonly fdl10_2025_article: string;
  readonly topic: string;
  readonly notes?: string;
}

export const FDL_CROSSWALK: readonly FdlCrosswalkEntry[] = [
  { fdl20_2018_article: 'FDL 20/2018 Art.2',       fdl10_2025_article: 'FDL 10/2025 Art.2',        topic: 'Definitions' },
  { fdl20_2018_article: 'FDL 20/2018 Art.4',        fdl10_2025_article: 'FDL 10/2025 Art.4',        topic: 'Scope — DNFBPs' },
  { fdl20_2018_article: 'FDL 20/2018 Art.10',       fdl10_2025_article: 'FDL 10/2025 Art.10',       topic: 'ML predicate offences' },
  { fdl20_2018_article: 'FDL 20/2018 Art.14',       fdl10_2025_article: 'FDL 10/2025 Art.14',       topic: 'Risk-based approach — ML/CFT/PF' },
  { fdl20_2018_article: 'FDL 20/2018 Art.15',       fdl10_2025_article: 'FDL 10/2025 Art.15',       topic: 'Customer due diligence (CDD) statutory mandate' },
  { fdl20_2018_article: 'FDL 20/2018 Art.15(4)',    fdl10_2025_article: 'FDL 10/2025 Art.15(4)',    topic: 'STR filing obligation to FIU' },
  { fdl20_2018_article: 'FDL 20/2018 Art.16',       fdl10_2025_article: 'FDL 10/2025 Art.16',       topic: 'Enhanced due diligence (EDD)' },
  { fdl20_2018_article: 'FDL 20/2018 Art.16(1)(b)', fdl10_2025_article: 'FDL 10/2025 Art.16(1)(b)', topic: 'PEP enhanced due diligence — UAE statutory mandate' },
  { fdl20_2018_article: 'FDL 20/2018 Art.16(2)',    fdl10_2025_article: 'FDL 10/2025 Art.16(2)',    topic: 'EDD — additional measures' },
  { fdl20_2018_article: 'FDL 20/2018 Art.16(3)',    fdl10_2025_article: 'FDL 10/2025 Art.24(1)',    topic: 'Record retention (5y → extended to 10y under Art.24)', notes: 'Retention extended from 5 to 10 years under FDL 10/2025' },
  { fdl20_2018_article: 'FDL 20/2018 Art.20',       fdl10_2025_article: 'FDL 10/2025 Art.20',       topic: 'Internal controls and compliance officer requirement' },
  { fdl20_2018_article: 'FDL 20/2018 Art.21',       fdl10_2025_article: 'FDL 10/2025 Art.21',       topic: 'Staff training requirements' },
  { fdl20_2018_article: 'FDL 20/2018 Art.24',       fdl10_2025_article: 'FDL 10/2025 Art.24',       topic: 'Record-keeping — 10-year tamper-evident retention' },
  { fdl20_2018_article: 'FDL 20/2018 Art.25',       fdl10_2025_article: 'FDL 10/2025 Art.25',       topic: 'Tipping-off prohibition' },
  { fdl20_2018_article: 'FDL 20/2018 Art.26',       fdl10_2025_article: 'FDL 10/2025 Art.26',       topic: 'STR filing — obligations' },
  { fdl20_2018_article: 'FDL 20/2018 Art.26-27',    fdl10_2025_article: 'FDL 10/2025 Art.26-27',    topic: 'STR filing deadlines + content requirements' },
  { fdl20_2018_article: 'FDL 20/2018 Art.27',       fdl10_2025_article: 'FDL 10/2025 Art.27',       topic: 'STR — goAML submission mechanics' },
  { fdl20_2018_article: 'FDL 20/2018 Art.29',       fdl10_2025_article: 'FDL 10/2025 Art.29',       topic: 'Tipping-off prohibition — extended' },
] as const;

/**
 * Resolve a legacy FDL 20/2018 citation to its FDL 10/2025 equivalent.
 * Returns undefined if the article is not in the crosswalk (may already be a
 * 10/2025 citation, or may require manual review).
 */
export function resolveFdlCitation(legacyCitation: string): FdlCrosswalkEntry | undefined {
  return FDL_CROSSWALK.find(
    (e) => legacyCitation.includes(e.fdl20_2018_article) || legacyCitation === e.fdl20_2018_article,
  );
}

/** Return all legacy FDL 20/2018 citations that have a 10/2025 equivalent. */
export function fdlCrosswalkByTopic(topic: string): FdlCrosswalkEntry[] {
  return FDL_CROSSWALK.filter((e) => e.topic.toLowerCase().includes(topic.toLowerCase()));
}
