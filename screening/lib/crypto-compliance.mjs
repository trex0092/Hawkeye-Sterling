/**
 * Virtual Asset Compliance Module — VARA, MoE, FATF.
 *
 * Extends Hawkeye-Sterling's AML/CFT framework to cover virtual assets
 * and Virtual Asset Service Providers (VASPs) as required by:
 *
 *   - UAE Virtual Assets Regulatory Authority (VARA) regulations
 *   - Federal Decree-Law No. 10/2025 (applies to VASPs as DNFBPs)
 *   - FATF Recommendation 15 (new technologies / virtual assets)
 *   - FATF Updated Guidance on Virtual Assets and VASPs (2021)
 *   - MoE Circular on Virtual Asset activities
 *   - Travel Rule (FATF Rec.16 applied to virtual assets)
 *
 * Capabilities:
 *   1. VASP counterparty risk assessment
 *   2. Travel Rule compliance checker
 *   3. Crypto transaction monitoring (on-chain red flags)
 *   4. Wallet address screening
 *   5. DeFi/P2P exposure risk scoring
 *   6. Stablecoin and token classification
 *   7. Cross-chain bridging risk detection
 *   8. Unhosted wallet risk flags
 *   9. Mixer/tumbler detection indicators
 *  10. NFT-based money laundering red flags
 */

import { createHash } from 'node:crypto';
import { FATF_LISTS } from '../config.js';

// ── VARA Regulatory Framework ──────────────────────────────────

const VARA_ACTIVITIES = {
  VA_EXCHANGE: { name: 'Virtual Asset Exchange Services', risk: 'HIGH', varaLicense: 'VA Exchange' },
  VA_TRANSFER: { name: 'Virtual Asset Transfer Services', risk: 'HIGH', varaLicense: 'VA Transfer' },
  VA_CUSTODY: { name: 'Virtual Asset Custody/Safekeeping', risk: 'MEDIUM', varaLicense: 'VA Custody' },
  VA_MANAGEMENT: { name: 'Virtual Asset Portfolio Management', risk: 'MEDIUM', varaLicense: 'VA Management' },
  VA_ADVISORY: { name: 'Virtual Asset Advisory Services', risk: 'LOW', varaLicense: 'VA Advisory' },
  VA_LENDING: { name: 'Virtual Asset Lending/Borrowing', risk: 'HIGH', varaLicense: 'VA Lending' },
  VA_ISSUANCE: { name: 'Virtual Asset Issuance', risk: 'HIGH', varaLicense: 'VA Issuance' },
};

const VARA_REQUIREMENTS = {
  licensing: 'All VASPs operating in UAE must obtain VARA license per VARA Regulations',
  travelRule: 'VASPs must comply with Travel Rule for transfers >= AED 3,500 (FATF Rec.16)',
  kycThreshold: 'Full KYC required for all VA transactions (no de minimis exemption in UAE)',
  recordKeeping: '10-year retention per FDL No.10/2025 Art.16',
  reporting: 'STR/SAR filing via goAML for suspicious VA transactions',
  screening: 'Screen all VA counterparties against sanctions lists before transfer',
  riskAssessment: 'ML/TF risk assessment specific to VA activities per FATF Rec.15',
};

// ── Crypto Red Flags (FATF/VARA) ───────────────────────────────

const CRYPTO_RED_FLAGS = [
  { id: 'CRF-01', title: 'Mixer/tumbler usage', severity: 'CRITICAL', description: 'Transaction chain includes known mixer, tumbler, or coinjoin service', fatf: 'FATF VA Guidance Para.80(a)' },
  { id: 'CRF-02', title: 'Privacy coin conversion', severity: 'HIGH', description: 'Conversion to/from privacy coins (Monero, Zcash shielded, Dash PrivateSend)', fatf: 'FATF VA Guidance Para.80(b)' },
  { id: 'CRF-03', title: 'Unhosted wallet transfer', severity: 'MEDIUM', description: 'Transfer to/from unhosted (self-custodied) wallet without KYC', fatf: 'FATF VA Guidance Para.80(c)' },
  { id: 'CRF-04', title: 'Rapid chain-hopping', severity: 'HIGH', description: 'Quick conversion across multiple blockchains via bridges to obscure trail', fatf: 'FATF VA Guidance Para.80(d)' },
  { id: 'CRF-05', title: 'Structuring below Travel Rule threshold', severity: 'HIGH', description: 'Multiple VA transfers just below AED 3,500 to avoid Travel Rule', vara: 'VARA Travel Rule Guidance' },
  { id: 'CRF-06', title: 'Sanctioned wallet address', severity: 'CRITICAL', description: 'Transfer involves wallet address on OFAC SDN list or other sanctions list', fatf: 'FATF Rec.6/7' },
  { id: 'CRF-07', title: 'DeFi protocol interaction', severity: 'MEDIUM', description: 'Funds routed through decentralized exchange or lending protocol without KYC', fatf: 'FATF VA Guidance Para.67-74' },
  { id: 'CRF-08', title: 'NFT high-value purchase', severity: 'MEDIUM', description: 'NFT purchase at significantly above market value (potential value transfer)', fatf: 'FATF Updated Guidance 2023' },
  { id: 'CRF-09', title: 'Darknet marketplace exposure', severity: 'CRITICAL', description: 'Wallet address has known exposure to darknet marketplace transactions', fatf: 'FATF VA Guidance Para.80(e)' },
  { id: 'CRF-10', title: 'VASP in non-compliant jurisdiction', severity: 'HIGH', description: 'Counterparty VASP registered in jurisdiction without VA regulation', fatf: 'FATF Rec.15' },
  { id: 'CRF-11', title: 'Peer-to-peer VA exchange', severity: 'MEDIUM', description: 'VA exchanged via P2P platform without VASP intermediary', vara: 'VARA Regulations' },
  { id: 'CRF-12', title: 'Rapid on/off ramp', severity: 'HIGH', description: 'Fiat → crypto → fiat conversion within short period without clear purpose', fatf: 'FATF VA Guidance Para.80(f)' },
  { id: 'CRF-13', title: 'Stablecoin large transfer', severity: 'MEDIUM', description: 'Large stablecoin transfer (>AED 200K equivalent) as potential value storage/transfer', vara: 'VARA Stablecoin Guidance' },
  { id: 'CRF-14', title: 'Mining pool from sanctioned jurisdiction', severity: 'HIGH', description: 'Mining rewards originating from pools in FATF blacklist jurisdictions', fatf: 'FATF Rec.6' },
  { id: 'CRF-15', title: 'Precious metals tokenization', severity: 'HIGH', description: 'Gold-backed or precious metals tokens used to circumvent physical gold controls', vara: 'VARA/MoE Joint Guidance', dpms: true },
];

// ── Travel Rule Compliance ─────────────────────────────────────

const TRAVEL_RULE_THRESHOLD_AED = 3500;

/**
 * Check Travel Rule compliance for a VA transfer.
 *
 * @param {object} transfer
 * @param {number} transfer.amountAed - Amount in AED equivalent
 * @param {object} transfer.originator - { name, accountId, vaspName, jurisdiction }
 * @param {object} transfer.beneficiary - { name, accountId, vaspName, jurisdiction }
 * @returns {TravelRuleResult}
 */
export function checkTravelRule(transfer) {
  const { amountAed, originator, beneficiary } = transfer;
  const required = amountAed >= TRAVEL_RULE_THRESHOLD_AED;

  const originatorComplete = !!(originator?.name && originator?.accountId);
  const beneficiaryComplete = !!(beneficiary?.name && beneficiary?.accountId);
  const vaspIdentified = !!(originator?.vaspName && beneficiary?.vaspName);

  const issues = [];
  if (required && !originatorComplete) issues.push('Originator information incomplete (name + account required per FATF Rec.16)');
  if (required && !beneficiaryComplete) issues.push('Beneficiary information incomplete');
  if (required && !vaspIdentified) issues.push('Originator/beneficiary VASP not identified');
  if (originator?.jurisdiction && FATF_LISTS.blacklist.includes(originator.jurisdiction)) {
    issues.push(`Originator in FATF blacklist jurisdiction: ${originator.jurisdiction}`);
  }
  if (beneficiary?.jurisdiction && FATF_LISTS.blacklist.includes(beneficiary.jurisdiction)) {
    issues.push(`Beneficiary in FATF blacklist jurisdiction: ${beneficiary.jurisdiction}`);
  }

  return {
    transferAmount: amountAed,
    travelRuleApplies: required,
    threshold: TRAVEL_RULE_THRESHOLD_AED,
    originatorComplete,
    beneficiaryComplete,
    vaspIdentified,
    compliant: required ? (originatorComplete && beneficiaryComplete && vaspIdentified && issues.length === 0) : true,
    issues,
    regulation: 'FATF Rec.16 | VARA Travel Rule Guidance | FDL No.10/2025 Art.15',
  };
}

// ── VASP Risk Assessment ───────────────────────────────────────

/**
 * Assess counterparty VASP risk.
 *
 * @param {object} vasp
 * @param {string} vasp.name - VASP name
 * @param {string} vasp.jurisdiction - Registration jurisdiction
 * @param {string[]} vasp.activities - VARA activity types
 * @param {boolean} vasp.licensed - Has VARA or equivalent license
 * @param {boolean} vasp.travelRuleCompliant - Implements Travel Rule
 * @param {number} vasp.yearsOperating - Years in operation
 * @returns {VASPRiskResult}
 */
export function assessVASPRisk(vasp) {
  let score = 0;
  const factors = [];

  // Jurisdiction risk
  if (FATF_LISTS.blacklist.includes(vasp.jurisdiction)) {
    score += 5; factors.push({ factor: 'jurisdiction', detail: `FATF blacklist: ${vasp.jurisdiction}`, weight: 5 });
  } else if (FATF_LISTS.greylist.includes(vasp.jurisdiction)) {
    score += 3; factors.push({ factor: 'jurisdiction', detail: `FATF greylist: ${vasp.jurisdiction}`, weight: 3 });
  }

  // Licensing
  if (!vasp.licensed) {
    score += 4; factors.push({ factor: 'licensing', detail: 'No VARA or equivalent license', weight: 4 });
  }

  // Travel Rule
  if (!vasp.travelRuleCompliant) {
    score += 3; factors.push({ factor: 'travel_rule', detail: 'Travel Rule not implemented', weight: 3 });
  }

  // Activity risk
  for (const activity of (vasp.activities || [])) {
    const actInfo = VARA_ACTIVITIES[activity];
    if (actInfo?.risk === 'HIGH') {
      score += 1; factors.push({ factor: 'activity', detail: `High-risk activity: ${actInfo.name}`, weight: 1 });
    }
  }

  // New VASP
  if (vasp.yearsOperating !== undefined && vasp.yearsOperating < 2) {
    score += 1; factors.push({ factor: 'maturity', detail: `New VASP (${vasp.yearsOperating} years)`, weight: 1 });
  }

  score = Math.min(25, score);
  const band = score >= 16 ? 'CRITICAL' : score >= 10 ? 'HIGH' : score >= 5 ? 'MEDIUM' : 'LOW';

  return {
    vasp: vasp.name,
    jurisdiction: vasp.jurisdiction,
    riskScore: score,
    band,
    factors,
    licensed: !!vasp.licensed,
    travelRuleCompliant: !!vasp.travelRuleCompliant,
    recommendation: band === 'CRITICAL' ? 'PROHIBIT: Do not transact with this VASP.'
      : band === 'HIGH' ? 'EDD required. Senior management approval needed.'
      : band === 'MEDIUM' ? 'Standard CDD with enhanced monitoring.'
      : 'Standard CDD. Low risk.',
    regulation: 'VARA Regulations | FATF Rec.15 | FDL No.10/2025',
  };
}

// ── Crypto Transaction Screening ───────────────────────────────

/**
 * Screen a crypto transaction against red flags.
 *
 * @param {object} tx
 * @param {string} tx.fromWallet - Source wallet address
 * @param {string} tx.toWallet - Destination wallet address
 * @param {string} tx.blockchain - Blockchain (bitcoin, ethereum, etc.)
 * @param {number} tx.amountUsd - Amount in USD equivalent
 * @param {string} tx.tokenType - Token type (BTC, ETH, USDT, XMR, etc.)
 * @param {object} [tx.indicators] - Known risk indicators
 * @returns {{ redFlags: Array, riskScore: number, recommendation: string }}
 */
export function screenCryptoTransaction(tx) {
  const flags = [];
  const indicators = tx.indicators || {};

  // Check each red flag
  for (const rf of CRYPTO_RED_FLAGS) {
    let triggered = false;

    switch (rf.id) {
      case 'CRF-01': triggered = indicators.mixerDetected === true; break;
      case 'CRF-02': triggered = ['XMR', 'ZEC', 'DASH'].includes(tx.tokenType?.toUpperCase()); break;
      case 'CRF-03': triggered = indicators.unhostedWallet === true; break;
      case 'CRF-04': triggered = indicators.chainHops > 2; break;
      case 'CRF-05': triggered = tx.amountUsd > 0 && tx.amountUsd < (TRAVEL_RULE_THRESHOLD_AED / 3.67) && indicators.frequentSmallTransfers; break;
      case 'CRF-06': triggered = indicators.sanctionedAddress === true; break;
      case 'CRF-07': triggered = indicators.defiProtocol === true; break;
      case 'CRF-08': triggered = indicators.nftTransaction && tx.amountUsd > 50000; break;
      case 'CRF-09': triggered = indicators.darknetExposure === true; break;
      case 'CRF-10': triggered = indicators.nonCompliantVaspJurisdiction === true; break;
      case 'CRF-11': triggered = indicators.p2pExchange === true; break;
      case 'CRF-12': triggered = indicators.rapidOnOffRamp === true; break;
      case 'CRF-13': triggered = ['USDT', 'USDC', 'BUSD', 'DAI'].includes(tx.tokenType?.toUpperCase()) && tx.amountUsd > 55000; break;
      case 'CRF-14': triggered = indicators.miningPoolSanctioned === true; break;
      case 'CRF-15': triggered = indicators.preciousMetalsToken === true; break;
    }

    if (triggered) {
      flags.push({ ...rf, triggered: true });
    }
  }

  // Calculate composite score
  const severityWeight = { CRITICAL: 5, HIGH: 3, MEDIUM: 1 };
  const riskScore = Math.min(25, flags.reduce((s, f) => s + (severityWeight[f.severity] || 1), 0));
  const band = riskScore >= 10 ? 'CRITICAL' : riskScore >= 5 ? 'HIGH' : riskScore >= 2 ? 'MEDIUM' : 'LOW';

  let recommendation;
  if (band === 'CRITICAL') recommendation = 'BLOCK transaction. File STR via goAML. Escalate to MLRO immediately.';
  else if (band === 'HIGH') recommendation = 'HOLD transaction. Enhanced review required before processing.';
  else if (band === 'MEDIUM') recommendation = 'PROCEED with enhanced monitoring. Document risk acceptance.';
  else recommendation = 'PROCEED. Standard monitoring.';

  return {
    transaction: { fromWallet: tx.fromWallet, toWallet: tx.toWallet, blockchain: tx.blockchain, amountUsd: tx.amountUsd, tokenType: tx.tokenType },
    redFlags: flags,
    redFlagCount: flags.length,
    riskScore,
    band,
    recommendation,
    dpmsRelevant: flags.some(f => f.dpms),
    screenedAt: new Date().toISOString(),
    regulation: 'VARA Regulations | FATF Rec.15 | FATF VA Guidance 2021 | FDL No.10/2025',
  };
}

/**
 * Get all VARA requirements for compliance checklist.
 */
export function getVARARequirements() {
  return { ...VARA_REQUIREMENTS };
}

/**
 * Get all crypto red flag definitions.
 */
export function getCryptoRedFlags() {
  return [...CRYPTO_RED_FLAGS];
}

export { VARA_ACTIVITIES, VARA_REQUIREMENTS, CRYPTO_RED_FLAGS, TRAVEL_RULE_THRESHOLD_AED };
