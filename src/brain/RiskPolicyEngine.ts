// Hawkeye Sterling — configurable risk policy engine.
// Supports multi-axis risk computation:
//   - Jurisdiction risk (FATF grey/black lists, sanctioned countries)
//   - Industry/sector risk (DNFBP categories, high-risk sectors)
//   - Delivery channel risk (non-face-to-face, crypto, correspondent)
//   - Transaction risk (amount, frequency, counterparty type)
//   - Sanctions exposure risk (direct, indirect via graph)
//   - Adverse media risk (severity, recency, corroboration)
//
// Complements risk-score.ts (which handles the weighted mean of raw inputs).
// This module adds: named policy profiles, rule overrides, jurisdiction tables,
// and risk rating bands with regulatory basis.

// ── Risk bands ────────────────────────────────────────────────────────────────

export type RiskBand = 'low' | 'medium' | 'high' | 'very_high' | 'critical';

export const RISK_BAND_THRESHOLDS: Record<RiskBand, number> = {
  low:       0.25,
  medium:    0.50,
  high:      0.70,
  very_high: 0.85,
  critical:  1.00,
};

export function scoreToRiskBand(score: number): RiskBand {
  if (score < RISK_BAND_THRESHOLDS.low)       return 'low';
  if (score < RISK_BAND_THRESHOLDS.medium)    return 'medium';
  if (score < RISK_BAND_THRESHOLDS.high)      return 'high';
  if (score < RISK_BAND_THRESHOLDS.very_high) return 'very_high';
  return 'critical';
}

// ── Jurisdiction risk tables ──────────────────────────────────────────────────

export type JurisdictionRiskLevel = 'sanctioned' | 'fatf_blacklist' | 'fatf_greylist' | 'high_risk' | 'elevated' | 'standard';

export const JURISDICTION_RISK: Record<string, JurisdictionRiskLevel> = {
  // FATF blacklist / call for action
  IR: 'fatf_blacklist',   // Iran
  KP: 'fatf_blacklist',   // North Korea
  MM: 'fatf_blacklist',   // Myanmar

  // FATF greylist (increased monitoring) — as of 2025
  BD: 'fatf_greylist', BF: 'fatf_greylist', CM: 'fatf_greylist',
  CD: 'fatf_greylist', HT: 'fatf_greylist', JM: 'fatf_greylist',
  ML: 'fatf_greylist', MZ: 'fatf_greylist', NA: 'fatf_greylist',
  NG: 'fatf_greylist', PH: 'fatf_greylist', SA: 'fatf_greylist',
  SN: 'fatf_greylist', SS: 'fatf_greylist', SY: 'fatf_greylist',
  TZ: 'fatf_greylist', TR: 'fatf_greylist', UG: 'fatf_greylist',
  YE: 'fatf_greylist', ZA: 'fatf_greylist',

  // OFAC/UN sanctioned countries
  CU: 'sanctioned', VE: 'sanctioned', BY: 'sanctioned',
  RU: 'sanctioned', LY: 'sanctioned', SD: 'sanctioned', SO: 'sanctioned',

  // High-risk (offshore, secrecy jurisdictions)
  KY: 'high_risk', VG: 'high_risk', BZ: 'high_risk',
  PA: 'high_risk', LR: 'high_risk', SC: 'high_risk',
  VU: 'high_risk', WS: 'high_risk', AG: 'high_risk',

  // Elevated
  AE: 'elevated',  // UAE — primary jurisdiction; elevated due to FATF observation
  LB: 'elevated', GT: 'elevated', KH: 'elevated',
};

const JURISDICTION_RISK_SCORES: Record<JurisdictionRiskLevel, number> = {
  sanctioned:      1.00,
  fatf_blacklist:  0.95,
  fatf_greylist:   0.75,
  high_risk:       0.65,
  elevated:        0.45,
  standard:        0.10,
};

export function jurisdictionRiskScore(isoAlpha2: string): number {
  const level = JURISDICTION_RISK[isoAlpha2.toUpperCase()] ?? 'standard';
  return JURISDICTION_RISK_SCORES[level];
}

// ── Industry risk ─────────────────────────────────────────────────────────────

export type IndustrySector =
  | 'real_estate'
  | 'precious_metals_stones'
  | 'legal_services'
  | 'accounting_services'
  | 'trust_company_services'
  | 'casino_gambling'
  | 'crypto_virtual_assets'
  | 'money_services'
  | 'private_banking'
  | 'correspondent_banking'
  | 'trade_finance'
  | 'arms_defence'
  | 'oil_gas'
  | 'construction'
  | 'retail_banking'
  | 'corporate_banking'
  | 'insurance'
  | 'other';

const INDUSTRY_RISK_SCORES: Record<IndustrySector, number> = {
  real_estate:              0.80,
  precious_metals_stones:   0.85,
  legal_services:           0.75,
  accounting_services:      0.65,
  trust_company_services:   0.80,
  casino_gambling:          0.90,
  crypto_virtual_assets:    0.85,
  money_services:           0.80,
  private_banking:          0.70,
  correspondent_banking:    0.75,
  trade_finance:            0.65,
  arms_defence:             0.90,
  oil_gas:                  0.60,
  construction:             0.55,
  retail_banking:           0.30,
  corporate_banking:        0.35,
  insurance:                0.25,
  other:                    0.20,
};

export function industrySectorRisk(sector: IndustrySector): number {
  return INDUSTRY_RISK_SCORES[sector] ?? 0.20;
}

// ── Delivery channel risk ─────────────────────────────────────────────────────

export type DeliveryChannel =
  | 'face_to_face'
  | 'digital_verified'      // eKYC with biometric liveness
  | 'digital_unverified'    // online without biometric
  | 'agent_third_party'
  | 'correspondent'
  | 'crypto_self_custody'   // self-custodied wallet address
  | 'crypto_exchange'       // KYC'd exchange
  | 'phone'
  | 'mail';

const CHANNEL_RISK_SCORES: Record<DeliveryChannel, number> = {
  face_to_face:         0.10,
  digital_verified:     0.20,
  digital_unverified:   0.55,
  agent_third_party:    0.60,
  correspondent:        0.65,
  crypto_self_custody:  0.85,
  crypto_exchange:      0.40,
  phone:                0.40,
  mail:                 0.35,
};

export function deliveryChannelRisk(channel: DeliveryChannel): number {
  return CHANNEL_RISK_SCORES[channel] ?? 0.50;
}

// ── Transaction risk ──────────────────────────────────────────────────────────

export interface TransactionRiskInput {
  amountUSD: number;
  frequency?: 'one_off' | 'occasional' | 'regular' | 'high_frequency';
  counterpartyType?: 'retail' | 'corporate' | 'pep' | 'ngo' | 'financial_institution' | 'anonymous';
  crossBorder: boolean;
  jurisdictions?: string[];     // ISO alpha-2 of countries involved
  structuring?: boolean;        // multiple transactions just below thresholds
  roundAmount?: boolean;        // suspiciously round amounts
}

export function transactionRiskScore(input: TransactionRiskInput): number {
  let score = 0;

  // Amount tiers (USD)
  if (input.amountUSD >= 5_000_000)     score += 0.35;
  else if (input.amountUSD >= 1_000_000) score += 0.25;
  else if (input.amountUSD >= 100_000)   score += 0.15;
  else if (input.amountUSD >= 10_000)    score += 0.08;
  else                                    score += 0.02;

  // Frequency
  const freqRisk: Record<string, number> = {
    one_off: 0.05, occasional: 0.10, regular: 0.15, high_frequency: 0.25,
  };
  score += freqRisk[input.frequency ?? 'occasional'] ?? 0.10;

  // Counterparty
  const cpRisk: Record<string, number> = {
    retail: 0.05, corporate: 0.10, pep: 0.25, ngo: 0.20,
    financial_institution: 0.10, anonymous: 0.40,
  };
  score += cpRisk[input.counterpartyType ?? 'corporate'] ?? 0.10;

  // Cross-border + high-risk jurisdiction
  if (input.crossBorder) {
    score += 0.10;
    const maxJurisdictionRisk = Math.max(
      0,
      ...(input.jurisdictions ?? []).map((j) => jurisdictionRiskScore(j)),
    );
    score += maxJurisdictionRisk * 0.20;
  }

  // Red flags
  if (input.structuring) score += 0.25;
  if (input.roundAmount) score += 0.05;

  return Math.min(1, score);
}

// ── Sanctions exposure risk ───────────────────────────────────────────────────

export interface SanctionsExposureInput {
  directHit: boolean;
  indirectHops?: number;          // 1 = one hop from sanctioned entity
  exposureScore?: number;         // 0..1 from ExposurePathFinder
  sanctionedJurisdiction?: boolean;
  programSeverity?: 'counter_terrorism' | 'narcotics' | 'wmd' | 'general';
}

export function sanctionsExposureRisk(input: SanctionsExposureInput): number {
  if (input.directHit) return 1.0;

  let score = 0;

  // Indirect exposure
  if (input.indirectHops !== undefined) {
    if (input.indirectHops === 1) score += 0.75;
    else if (input.indirectHops === 2) score += 0.55;
    else if (input.indirectHops === 3) score += 0.35;
    else score += 0.15;
  }

  // Path-based exposure score
  if (input.exposureScore !== undefined) {
    score = Math.max(score, input.exposureScore * 0.80);
  }

  if (input.sanctionedJurisdiction) score += 0.10;

  // Program severity uplift
  const programUplift: Record<string, number> = {
    counter_terrorism: 0.15, wmd: 0.20, narcotics: 0.10, general: 0.05,
  };
  score += programUplift[input.programSeverity ?? 'general'] ?? 0.05;

  return Math.min(1, score);
}

// ── Adverse media risk ────────────────────────────────────────────────────────

export interface AdverseMediaRiskInput {
  severityLevel?: 'critical' | 'high' | 'medium' | 'low' | 'none';
  articleCount?: number;
  mostRecentDays?: number;        // days since most recent article
  corroboration?: 'strong' | 'moderate' | 'weak' | 'single_source';
  isOngoing?: boolean;            // ongoing investigation vs. resolved
}

export function adverseMediaRisk(input: AdverseMediaRiskInput): number {
  if (input.severityLevel === 'none' || !input.severityLevel) return 0;

  const sevScore: Record<string, number> = {
    critical: 0.90, high: 0.70, medium: 0.45, low: 0.20,
  };
  let score = sevScore[input.severityLevel] ?? 0.20;

  // Recency — older = lower risk
  const days = input.mostRecentDays ?? 180;
  if (days <= 30)      score *= 1.00;
  else if (days <= 180) score *= 0.90;
  else if (days <= 365) score *= 0.75;
  else                  score *= 0.55;

  // Corroboration
  const corrMult: Record<string, number> = {
    strong: 1.00, moderate: 0.85, weak: 0.65, single_source: 0.50,
  };
  score *= corrMult[input.corroboration ?? 'single_source'] ?? 0.50;

  // Article volume boost
  const count = input.articleCount ?? 1;
  if (count >= 10)     score = Math.min(1, score * 1.10);
  else if (count >= 5) score = Math.min(1, score * 1.05);

  // Ongoing boost
  if (input.isOngoing) score = Math.min(1, score * 1.15);

  return Math.min(1, score);
}

// ── PEP risk ──────────────────────────────────────────────────────────────────

export type PEPTier = 'tier1_head_of_state' | 'tier1_senior_official' | 'tier2_regional' | 'tier3_local' | 'former' | 'family_member' | 'close_associate' | 'not_pep';

const PEP_RISK_SCORES: Record<PEPTier, number> = {
  tier1_head_of_state:  0.95,
  tier1_senior_official: 0.85,
  tier2_regional:       0.65,
  tier3_local:          0.40,
  former:               0.30,
  family_member:        0.55,
  close_associate:      0.45,
  not_pep:              0.00,
};

export function pepRisk(tier: PEPTier): number {
  return PEP_RISK_SCORES[tier] ?? 0.00;
}

// ── Composite risk policy input ───────────────────────────────────────────────

export interface RiskPolicyInput {
  // Subject profile
  subjectId: string;
  subjectType: 'individual' | 'entity';
  nationalityIso?: string;      // ISO alpha-2
  residencyIso?: string;
  incorporationIso?: string;
  sector?: IndustrySector;
  channel?: DeliveryChannel;
  pepTier?: PEPTier;

  // Transaction context
  transaction?: TransactionRiskInput;

  // Screening results
  sanctionsExposure?: SanctionsExposureInput;
  adverseMedia?: AdverseMediaRiskInput;

  // Policy profile
  policyProfileId?: string;     // override default weights
}

export interface RiskAxisScore {
  axis: string;
  score: number;
  weight: number;
  weightedScore: number;
  band: RiskBand;
  basis: string;
}

export interface RiskPolicyResult {
  subjectId: string;
  compositeScore: number;
  riskBand: RiskBand;
  axisScores: RiskAxisScore[];
  dominantAxis: string;
  policyProfileId: string;
  mitigatingFactors: string[];
  aggravatingFactors: string[];
  recommendedDueDiligence: 'SDD' | 'CDD' | 'EDD' | 'BLOCKED';
  computedAt: string;
  policyVersion: string;
}

// ── Default weight profiles ───────────────────────────────────────────────────

interface PolicyWeights {
  jurisdiction: number;
  industry: number;
  channel: number;
  transaction: number;
  sanctions: number;
  adverseMedia: number;
  pep: number;
}

const POLICY_PROFILES: Record<string, PolicyWeights> = {
  default: {
    jurisdiction: 0.15,
    industry:     0.15,
    channel:      0.10,
    transaction:  0.15,
    sanctions:    0.25,
    adverseMedia: 0.15,
    pep:          0.05,
  },
  retail_banking: {
    jurisdiction: 0.10,
    industry:     0.05,
    channel:      0.15,
    transaction:  0.25,
    sanctions:    0.25,
    adverseMedia: 0.15,
    pep:          0.05,
  },
  private_banking: {
    jurisdiction: 0.15,
    industry:     0.10,
    channel:      0.05,
    transaction:  0.20,
    sanctions:    0.20,
    adverseMedia: 0.15,
    pep:          0.15,
  },
  trade_finance: {
    jurisdiction: 0.25,
    industry:     0.10,
    channel:      0.05,
    transaction:  0.25,
    sanctions:    0.25,
    adverseMedia: 0.05,
    pep:          0.05,
  },
  crypto: {
    jurisdiction: 0.10,
    industry:     0.05,
    channel:      0.25,
    transaction:  0.20,
    sanctions:    0.30,
    adverseMedia: 0.08,
    pep:          0.02,
  },
};

// ── Main policy engine ────────────────────────────────────────────────────────

export function computeRiskPolicy(input: RiskPolicyInput): RiskPolicyResult {
  const profileId = input.policyProfileId ?? 'default';
  const weights = POLICY_PROFILES[profileId] ?? POLICY_PROFILES['default'] ?? ({} as typeof POLICY_PROFILES['default']);

  // Compute per-axis scores
  const nationalityRisk = jurisdictionRiskScore(input.nationalityIso ?? 'XX');
  const residencyRisk = jurisdictionRiskScore(input.residencyIso ?? 'XX');
  const incorporationRisk = jurisdictionRiskScore(input.incorporationIso ?? 'XX');
  const jurisdictionScore = Math.max(nationalityRisk, residencyRisk, incorporationRisk);

  const industryScore = industrySectorRisk(input.sector ?? 'other');
  const channelScore = deliveryChannelRisk(input.channel ?? 'digital_unverified');
  const txScore = input.transaction ? transactionRiskScore(input.transaction) : 0;
  const sanctionsScore = input.sanctionsExposure ? sanctionsExposureRisk(input.sanctionsExposure) : 0;
  const mediaScore = input.adverseMedia ? adverseMediaRisk(input.adverseMedia) : 0;
  const pepScore = pepRisk(input.pepTier ?? 'not_pep');

  const axes: RiskAxisScore[] = [
    { axis: 'jurisdiction',  score: jurisdictionScore, weight: weights.jurisdiction,  weightedScore: jurisdictionScore * weights.jurisdiction,  band: scoreToRiskBand(jurisdictionScore), basis: 'FATF jurisdiction risk ratings' },
    { axis: 'industry',      score: industryScore,     weight: weights.industry,      weightedScore: industryScore * weights.industry,            band: scoreToRiskBand(industryScore),     basis: 'FATF DNFBP risk categories' },
    { axis: 'channel',       score: channelScore,      weight: weights.channel,       weightedScore: channelScore * weights.channel,              band: scoreToRiskBand(channelScore),      basis: 'CBUAE delivery channel risk matrix' },
    { axis: 'transaction',   score: txScore,           weight: weights.transaction,   weightedScore: txScore * weights.transaction,                band: scoreToRiskBand(txScore),           basis: 'Transaction amount, frequency, and pattern analysis' },
    { axis: 'sanctions',     score: sanctionsScore,    weight: weights.sanctions,     weightedScore: sanctionsScore * weights.sanctions,          band: scoreToRiskBand(sanctionsScore),    basis: 'OFAC/UN/EU sanctions and indirect exposure' },
    { axis: 'adverse_media', score: mediaScore,        weight: weights.adverseMedia,  weightedScore: mediaScore * weights.adverseMedia,            band: scoreToRiskBand(mediaScore),        basis: 'Adverse media classification and corroboration' },
    { axis: 'pep',           score: pepScore,          weight: weights.pep,           weightedScore: pepScore * weights.pep,                      band: scoreToRiskBand(pepScore),          basis: 'FATF R.12 PEP tier classification' },
  ];

  const compositeScore = axes.reduce((sum, a) => sum + a.weightedScore, 0);
  const riskBand = scoreToRiskBand(compositeScore);

  const dominantAxis = axes.reduce((best, a) =>
    a.weightedScore > best.weightedScore ? a : best
  ).axis;

  // Mitigating and aggravating factors
  const mitigating: string[] = [];
  const aggravating: string[] = [];

  if (jurisdictionScore < 0.20) mitigating.push('Low-risk jurisdiction');
  if (channelScore <= 0.20)     mitigating.push('Face-to-face or verified digital onboarding');
  if (mediaScore === 0)         mitigating.push('No adverse media detected');
  if (sanctionsScore === 0)     mitigating.push('No sanctions exposure identified');

  if (jurisdictionScore >= 0.75) aggravating.push(`High-risk jurisdiction (score: ${(jurisdictionScore * 100).toFixed(0)}%)`);
  if (input.sanctionsExposure?.directHit) aggravating.push('Direct sanctions match — mandatory block');
  if (input.transaction?.structuring) aggravating.push('Possible structuring detected');
  if (pepScore >= 0.80) aggravating.push('Tier 1 PEP — enhanced due diligence required');
  if (mediaScore >= 0.70) aggravating.push('High-severity adverse media with strong corroboration');

  // Due diligence recommendation
  const recommendedDueDiligence: RiskPolicyResult['recommendedDueDiligence'] =
    input.sanctionsExposure?.directHit ? 'BLOCKED' :
    compositeScore >= 0.70 ? 'EDD' :
    compositeScore >= 0.40 ? 'CDD' :
    compositeScore >= 0.15 ? 'CDD' :
    'SDD';

  return {
    subjectId: input.subjectId,
    compositeScore,
    riskBand,
    axisScores: axes,
    dominantAxis,
    policyProfileId: profileId,
    mitigatingFactors: mitigating,
    aggravatingFactors: aggravating,
    recommendedDueDiligence,
    computedAt: new Date().toISOString(),
    policyVersion: '2025.1',
  };
}

// ── Summary formatter ─────────────────────────────────────────────────────────

export function formatRiskSummary(result: RiskPolicyResult): string {
  const lines = [
    `Risk Assessment — ${result.subjectId}`,
    `Composite Score: ${(result.compositeScore * 100).toFixed(1)}% | Band: ${result.riskBand.toUpperCase()} | DD: ${result.recommendedDueDiligence}`,
    `Dominant Risk Axis: ${result.dominantAxis}`,
    ``,
    `Axis Breakdown:`,
    ...result.axisScores.map((a) =>
      `  ${a.axis.padEnd(15)} ${(a.score * 100).toFixed(0).padStart(3)}%  (weight ${(a.weight * 100).toFixed(0)}%)  → ${a.band}`
    ),
  ];

  if (result.aggravatingFactors.length > 0) {
    lines.push('', 'Aggravating Factors:');
    lines.push(...result.aggravatingFactors.map((f) => `  • ${f}`));
  }
  if (result.mitigatingFactors.length > 0) {
    lines.push('', 'Mitigating Factors:');
    lines.push(...result.mitigatingFactors.map((f) => `  • ${f}`));
  }

  return lines.join('\n');
}
