/**
 * Proliferation Financing (PF) Risk Assessment Engine.
 *
 * Cabinet Resolution 156/2025 mandates PF risk assessment for all
 * reporting entities. This module implements:
 *
 *   1. PF country risk scoring (DPRK, Iran + UNSCR-designated)
 *   2. Dual-use goods screening (strategic goods, nuclear/bio/chem)
 *   3. End-use verification for precious metals
 *   4. PF red flag detection specific to gold/DPMS sector
 *   5. PF risk assessment report generation
 *
 * Gold is explicitly listed as a proliferation concern because:
 *   - Precious metals can be used to evade financial sanctions
 *   - Gold is a store of value for sanctioned state actors
 *   - DPMS may unknowingly facilitate PF through gold trade
 *
 * Regulatory basis:
 *   - Cabinet Resolution 156/2025 (PF & Dual-Use Controls)
 *   - FATF Recommendation 1, 2, 7 (PF risk assessment)
 *   - UNSCR 1718 (DPRK), UNSCR 2231 (Iran)
 *   - FDL No.10/2025 Art.35 (TFS obligations)
 */

/** Countries with UNSCR PF-related sanctions. */
const PF_HIGH_RISK_COUNTRIES = ['KP', 'IR'];

/** Countries requiring enhanced PF vigilance. */
const PF_ELEVATED_COUNTRIES = ['SY', 'MM', 'LY', 'YE', 'SO', 'SS', 'CD'];

/** Dual-use indicators in precious metals context. */
const DUAL_USE_INDICATORS = [
  'industrial gold', 'gold powder', 'gold wire', 'gold foil',
  'platinum group metals', 'palladium', 'rhodium', 'iridium',
  'osmium', 'ruthenium', 'rhenium', 'tungsten carbide',
  'high-purity gold', 'gold alloy', 'gold compound',
  'precious metal catalyst', 'gold nanoparticles',
];

/** PF red flags specific to gold/DPMS sector. */
const PF_RED_FLAGS = [
  {
    id: 'PF-01',
    flag: 'Transaction involves entity or individual in DPRK or Iran',
    weight: 10,
    regulation: 'UNSCR 1718/2231 | Cabinet Res 156/2025 | FDL Art.35',
    detect: (data) => PF_HIGH_RISK_COUNTRIES.includes(data.country) ||
      PF_HIGH_RISK_COUNTRIES.includes(data.originCountry) ||
      PF_HIGH_RISK_COUNTRIES.includes(data.destinationCountry),
  },
  {
    id: 'PF-02',
    flag: 'Gold shipment to entity with known connections to state weapons programme',
    weight: 10,
    regulation: 'UNSCR 1718/2231 | FATF Rec 7',
    detect: (data) => data.weaponsProgrammeLink === true,
  },
  {
    id: 'PF-03',
    flag: 'End-use declared as industrial but quantity/purity inconsistent with stated purpose',
    weight: 8,
    regulation: 'Cabinet Res 156/2025 | FATF PF Guidance',
    detect: (data) => data.endUse === 'industrial' && data.purity > 0.995 && data.weight > 1,
  },
  {
    id: 'PF-04',
    flag: 'Transaction routed through known PF transhipment points',
    weight: 8,
    regulation: 'FATF Typology: PF through precious metals',
    detect: (data) => data.transitCountries?.some(c => PF_ELEVATED_COUNTRIES.includes(c)),
  },
  {
    id: 'PF-05',
    flag: 'Customer is a front company or entity with opaque ownership in PF-risk jurisdiction',
    weight: 9,
    regulation: 'Cabinet Res 156/2025 | FATF Rec 7',
    detect: (data) => data.opaqueOwnership && (PF_HIGH_RISK_COUNTRIES.includes(data.country) || PF_ELEVATED_COUNTRIES.includes(data.country)),
  },
  {
    id: 'PF-06',
    flag: 'Gold described with dual-use terminology (powder, wire, foil, catalyst, nanoparticles)',
    weight: 7,
    regulation: 'Cabinet Res 156/2025 | Strategic Goods Controls',
    detect: (data) => {
      const desc = (data.description || data.productDescription || '').toLowerCase();
      return DUAL_USE_INDICATORS.some(term => desc.includes(term));
    },
  },
  {
    id: 'PF-07',
    flag: 'Payment received from or routed through entity in PF-sanctioned country',
    weight: 9,
    regulation: 'UNSCR 1718/2231 | FDL Art.35',
    detect: (data) => PF_HIGH_RISK_COUNTRIES.includes(data.paymentOriginCountry),
  },
  {
    id: 'PF-08',
    flag: 'Precious metals shipped to known free trade zones used for PF evasion',
    weight: 7,
    regulation: 'FATF PF Guidance | Cabinet Res 156/2025',
    detect: (data) => data.destinationFTZ && PF_ELEVATED_COUNTRIES.includes(data.destinationCountry),
  },
  {
    id: 'PF-09',
    flag: 'Customer declines to provide end-use certificate or end-user statement',
    weight: 8,
    regulation: 'Cabinet Res 156/2025 | Strategic Goods Order',
    detect: (data) => data.endUseCertificateRefused === true,
  },
  {
    id: 'PF-10',
    flag: 'Rapid accumulation of gold by entity with no prior precious metals activity',
    weight: 7,
    regulation: 'FATF Typology: Store of Value for PF | FDL Art.26',
    detect: (data) => data.newToGold && data.accumulationVolume > 100000,
  },
];

/**
 * Run PF risk assessment on a transaction or entity.
 *
 * @param {object} data - Transaction/entity data.
 * @returns {{ pfScore, pfLevel, flags, countryRisk, actions }}
 */
export function assessPFRisk(data) {
  const matchedFlags = [];

  for (const rf of PF_RED_FLAGS) {
    try {
      if (rf.detect(data)) {
        matchedFlags.push({
          id: rf.id,
          flag: rf.flag,
          weight: rf.weight,
          regulation: rf.regulation,
        });
      }
    } catch { /* skip */ }
  }

  const rawScore = matchedFlags.reduce((s, f) => s + f.weight, 0);
  const pfScore = Math.min(100, rawScore);

  const pfLevel = pfScore >= 20 ? 'CRITICAL'
    : pfScore >= 10 ? 'HIGH'
    : pfScore >= 5 ? 'MEDIUM'
    : pfScore > 0 ? 'LOW' : 'CLEAR';

  // Country risk
  const countries = [data.country, data.originCountry, data.destinationCountry].filter(Boolean);
  const countryRisk = countries.map(c => ({
    country: c,
    pfRisk: PF_HIGH_RISK_COUNTRIES.includes(c) ? 'PROHIBITED'
      : PF_ELEVATED_COUNTRIES.includes(c) ? 'ELEVATED' : 'STANDARD',
  }));

  const actions = [];
  if (pfLevel === 'CRITICAL' || pfLevel === 'HIGH') {
    actions.push('REJECT transaction — PF risk indicators detected');
    actions.push('File STR via goAML citing PF indicators');
    actions.push('Escalate to MLRO and Senior Management immediately');
    actions.push('Report to EOCN if sanctions match confirmed');
  } else if (pfLevel === 'MEDIUM') {
    actions.push('Apply enhanced due diligence for PF risk');
    actions.push('Request end-use certificate from counterparty');
    actions.push('Verify no UNSCR-designated connections');
  }

  return {
    pfScore,
    pfLevel,
    flags: matchedFlags,
    flagCount: matchedFlags.length,
    countryRisk,
    actions,
    regulation: 'Cabinet Resolution 156/2025 | FATF Rec 1, 2, 7 | UNSCR 1718/2231',
  };
}

/**
 * Generate a PF risk assessment report for the entity.
 */
export function generatePFReport(entityName, data, assessment) {
  const today = new Date().toISOString().split('T')[0];

  return [
    'PROLIFERATION FINANCING RISK ASSESSMENT',
    `Entity: ${entityName}`,
    `Date: ${today}`,
    `Classification: CONFIDENTIAL`,
    '',
    `PF Risk Level: ${assessment.pfLevel} (Score: ${assessment.pfScore}/100)`,
    '',
    '1. COUNTRY RISK',
    ...assessment.countryRisk.map(c => `   ${c.country}: ${c.pfRisk}`),
    '',
    assessment.flags.length > 0 ? '2. PF RED FLAGS DETECTED' : '2. NO PF RED FLAGS DETECTED',
    ...assessment.flags.map(f => `   [${f.id}] ${f.flag} (weight: ${f.weight})\n     Ref: ${f.regulation}`),
    '',
    '3. RECOMMENDED ACTIONS',
    ...assessment.actions.map((a, i) => `   ${i + 1}. ${a}`),
    '',
    'Regulatory basis: Cabinet Resolution 156/2025 on PF & Dual-Use Controls',
    'FATF Recommendations 1, 2, 7 on Proliferation Financing Risk Assessment',
    '',
    'For review by the MLRO.',
  ].join('\n');
}

export { PF_HIGH_RISK_COUNTRIES, PF_ELEVATED_COUNTRIES, PF_RED_FLAGS };
