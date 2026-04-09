/**
 * Quantitative Risk Scoring Algorithm.
 *
 * Implements a structured likelihood x impact risk matrix as required
 * by UAE AML/CFT supervisory guidance for DNFBPs.
 *
 * Risk score = Likelihood (1-5) x Impact (1-5) = 1-25
 *
 * Likelihood factors:
 *   - Jurisdiction risk (FATF black/greylist)
 *   - PEP status
 *   - Sanctions screening result
 *   - Transaction patterns (structuring, layering, etc.)
 *   - Adverse media signals
 *   - Source of wealth / funds transparency
 *
 * Impact factors:
 *   - Transaction volume (AED)
 *   - Product type (fine gold = highest)
 *   - Delivery channel (cash = highest)
 *   - Business relationship duration
 *   - Regulatory exposure (reporting obligations triggered)
 *
 * Risk bands:
 *   1-4:   LOW    -> Simplified Due Diligence (SDD), 12-month review
 *   5-9:   MEDIUM -> Standard CDD, 6-month review
 *   10-15: HIGH   -> Enhanced Due Diligence (EDD), 3-month review
 *   16-25: CRITICAL -> EDD + Senior Management approval, monthly review
 *
 * References:
 *   - Federal Decree-Law No. 10/2025, Art. 13-14
 *   - Cabinet Resolution 134/2025, Art. 7-10
 *   - FATF Recommendation 1 (Risk-Based Approach)
 */

import { FATF_LISTS } from '../config.js';

const RISK_BANDS = [
  { min: 1,  max: 4,  band: 'LOW',      cdd: 'SDD', review: '12 months', color: '#28a745' },
  { min: 5,  max: 9,  band: 'MEDIUM',   cdd: 'CDD', review: '6 months',  color: '#ffc107' },
  { min: 10, max: 15, band: 'HIGH',     cdd: 'EDD', review: '3 months',  color: '#fd7e14' },
  { min: 16, max: 25, band: 'CRITICAL', cdd: 'EDD', review: '1 month',   color: '#dc3545' },
];

const PRODUCT_RISK = {
  fine_gold:        { weight: 5, label: 'Fine gold bars/coins (highest inherent risk)' },
  gold_jewellery:   { weight: 3, label: 'Gold jewellery (moderate inherent risk)' },
  precious_stones:  { weight: 4, label: 'Precious stones (high portability risk)' },
  mixed:            { weight: 3, label: 'Mixed precious metals and stones' },
  other:            { weight: 2, label: 'Other products' },
};

const CHANNEL_RISK = {
  cash:     { weight: 5, label: 'Cash transaction (highest risk)' },
  cheque:   { weight: 3, label: 'Cheque/bank draft' },
  wire:     { weight: 2, label: 'Wire transfer (traceable)' },
  crypto:   { weight: 4, label: 'Cryptocurrency (pseudonymous)' },
  card:     { weight: 1, label: 'Card payment (low risk)' },
};

/**
 * Calculate a quantitative risk score for an entity.
 *
 * @param {object} params
 * @param {string} params.name - Entity name
 * @param {string} params.country - ISO 2-letter country code
 * @param {boolean} [params.isPep] - PEP status
 * @param {number} [params.sanctionsScore] - Screening match score (0-1)
 * @param {string} [params.sanctionsBand] - Screening result band
 * @param {number} [params.annualVolumeAed] - Expected annual volume
 * @param {string} [params.productType] - Product type key
 * @param {string} [params.channel] - Delivery channel key
 * @param {number} [params.adverseMediaCount] - Number of adverse media hits
 * @param {number} [params.transactionAlertCount] - Number of pattern alerts
 * @param {boolean} [params.sowVerified] - Source of wealth verified
 * @param {number} [params.relationshipMonths] - Relationship duration in months
 * @returns {RiskAssessment}
 */
export function calculateRisk(params) {
  const likelihood = calculateLikelihood(params);
  const impact = calculateImpact(params);
  const score = likelihood.total * impact.total;
  const bandInfo = RISK_BANDS.find(b => score >= b.min && score <= b.max) || RISK_BANDS[3];

  return {
    entity: params.name,
    country: params.country,
    score,
    likelihood: likelihood.total,
    impact: impact.total,
    band: bandInfo.band,
    cddLevel: bandInfo.cdd,
    reviewCycle: bandInfo.review,
    color: bandInfo.color,
    requiresSeniorApproval: score >= 16 || params.isPep,
    likelihoodFactors: likelihood.factors,
    impactFactors: impact.factors,
    recommendations: generateRecommendations(score, bandInfo, params),
    methodology: {
      formula: 'Risk Score = Likelihood (1-5) x Impact (1-5)',
      likelihoodWeights: 'Jurisdiction + PEP + Sanctions + Patterns + Media + SoW',
      impactWeights: 'Volume + Product + Channel + Duration + Regulatory',
      reference: 'FDL No.10/2025 Art.13-14 | Cabinet Res 134/2025 Art.7-10 | FATF Rec.1',
    },
    assessedAt: new Date().toISOString(),
  };
}

function calculateLikelihood(params) {
  const factors = [];
  let total = 1; // Base: low likelihood

  // Jurisdiction risk (0-2 points)
  if (FATF_LISTS.blacklist.includes(params.country)) {
    total += 2;
    factors.push({ factor: 'jurisdiction', weight: 2, detail: `FATF blacklist: ${params.country}` });
  } else if (FATF_LISTS.greylist.includes(params.country)) {
    total += 1;
    factors.push({ factor: 'jurisdiction', weight: 1, detail: `FATF greylist: ${params.country}` });
  } else {
    factors.push({ factor: 'jurisdiction', weight: 0, detail: `No FATF listing: ${params.country}` });
  }

  // PEP status (0-1 point)
  if (params.isPep) {
    total += 1;
    factors.push({ factor: 'pep', weight: 1, detail: 'Politically Exposed Person confirmed' });
  }

  // Sanctions screening result (0-2 points)
  if (params.sanctionsBand === 'high' || params.sanctionsBand === 'exact') {
    total += 2;
    factors.push({ factor: 'sanctions', weight: 2, detail: `Sanctions match: ${params.sanctionsBand} (score: ${params.sanctionsScore})` });
  } else if (params.sanctionsBand === 'medium') {
    total += 1;
    factors.push({ factor: 'sanctions', weight: 1, detail: `Sanctions match: medium (score: ${params.sanctionsScore})` });
  }

  // Transaction patterns (0-1 point)
  if (params.transactionAlertCount > 0) {
    total += Math.min(1, params.transactionAlertCount > 2 ? 1 : 0.5);
    factors.push({ factor: 'patterns', weight: params.transactionAlertCount > 2 ? 1 : 0.5, detail: `${params.transactionAlertCount} transaction pattern alerts` });
  }

  // Adverse media (0-1 point)
  if (params.adverseMediaCount > 0) {
    total += params.adverseMediaCount >= 3 ? 1 : 0.5;
    factors.push({ factor: 'adverse_media', weight: params.adverseMediaCount >= 3 ? 1 : 0.5, detail: `${params.adverseMediaCount} adverse media articles` });
  }

  // Source of wealth (0-0.5 reduction)
  if (params.sowVerified) {
    total = Math.max(1, total - 0.5);
    factors.push({ factor: 'sow_verified', weight: -0.5, detail: 'Source of wealth verified (risk reduction)' });
  }

  total = Math.min(5, Math.max(1, Math.round(total)));

  return { total, factors };
}

function calculateImpact(params) {
  const factors = [];
  let total = 2; // Base: moderate impact (DPMS inherently higher risk)

  // Transaction volume (0-2 points)
  const vol = params.annualVolumeAed || 0;
  if (vol >= 10000000) {
    total += 2;
    factors.push({ factor: 'volume', weight: 2, detail: `Annual volume AED ${vol.toLocaleString()} (>10M)` });
  } else if (vol >= 5000000) {
    total += 1;
    factors.push({ factor: 'volume', weight: 1, detail: `Annual volume AED ${vol.toLocaleString()} (>5M)` });
  } else if (vol >= 1000000) {
    total += 0.5;
    factors.push({ factor: 'volume', weight: 0.5, detail: `Annual volume AED ${vol.toLocaleString()} (>1M)` });
  }

  // Product risk (0-1 point)
  const product = PRODUCT_RISK[params.productType] || PRODUCT_RISK.other;
  if (product.weight >= 4) {
    total += 1;
    factors.push({ factor: 'product', weight: 1, detail: product.label });
  } else if (product.weight >= 3) {
    total += 0.5;
    factors.push({ factor: 'product', weight: 0.5, detail: product.label });
  }

  // Channel risk (0-1 point)
  const channel = CHANNEL_RISK[params.channel] || CHANNEL_RISK.wire;
  if (channel.weight >= 4) {
    total += 1;
    factors.push({ factor: 'channel', weight: 1, detail: channel.label });
  }

  // Relationship duration (newer = higher risk)
  if (params.relationshipMonths !== undefined && params.relationshipMonths < 6) {
    total += 0.5;
    factors.push({ factor: 'duration', weight: 0.5, detail: `New relationship (${params.relationshipMonths} months)` });
  }

  total = Math.min(5, Math.max(1, Math.round(total)));

  return { total, factors };
}

function generateRecommendations(score, band, params) {
  const recs = [];

  if (band.band === 'CRITICAL') {
    recs.push('Escalate to Senior Management for EDD approval per FDL Art.14');
    recs.push('Obtain Senior Management approval before proceeding with business relationship');
    recs.push('File STR via goAML if suspicious activity confirmed');
  }

  if (band.band === 'HIGH' || band.band === 'CRITICAL') {
    recs.push(`Apply Enhanced Due Diligence (${band.cdd})`);
    recs.push(`Set review cycle to ${band.review}`);
    recs.push('Verify source of wealth and source of funds');
    recs.push('Conduct enhanced ongoing monitoring');
  }

  if (band.band === 'MEDIUM') {
    recs.push(`Apply standard Customer Due Diligence (${band.cdd})`);
    recs.push(`Set review cycle to ${band.review}`);
  }

  if (band.band === 'LOW') {
    recs.push(`Simplified Due Diligence (${band.cdd}) may be applied`);
    recs.push(`Next review in ${band.review}`);
  }

  if (params.isPep) {
    recs.push('PEP: Obtain Senior Management approval for business relationship');
    recs.push('PEP: Establish source of wealth and source of funds');
    recs.push('PEP: Conduct enhanced ongoing monitoring');
  }

  return recs;
}

export { RISK_BANDS, PRODUCT_RISK, CHANNEL_RISK };
