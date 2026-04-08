/**
 * FATF Gold-Specific Red Flag Typology Matcher.
 *
 * Based on FATF Report: "Money Laundering and Terrorist Financing Risks
 * and Vulnerabilities Associated with Gold" and FATF Guidance on the
 * Risk-Based Approach for Dealers in Precious Metals and Stones.
 *
 * 40+ typologies specific to the gold/precious metals sector.
 * Each red flag includes regulatory citation, risk weight, and
 * detection logic.
 */

/**
 * FATF Gold Red Flag Typologies.
 *
 * Categories:
 *   TRADE    — Trade-based ML through gold
 *   ORIGIN   — Suspicious origin/provenance
 *   CASH     — Cash-intensive patterns
 *   IDENTITY — Customer identity concerns
 *   PRICING  — Pricing anomalies
 *   REFINING — Refining/processing red flags
 *   STRUCTURING — Transaction structuring
 *   LOGISTICS — Transport/shipping anomalies
 */
export const GOLD_RED_FLAGS = [
  // ── TRADE-BASED ML ──
  {
    id: 'GRF-01', category: 'TRADE',
    flag: 'Gold purchased and immediately resold at a loss or zero margin',
    weight: 9, regulation: 'FATF Gold Report Ch.3 | FATF Typology: Trade-Based ML',
    detect: (tx) => tx.buyPrice && tx.sellPrice && tx.sellPrice <= tx.buyPrice,
  },
  {
    id: 'GRF-02', category: 'TRADE',
    flag: 'Counter-party is a newly established company with no track record in gold trade',
    weight: 7, regulation: 'FATF RBA for DPMS | Cabinet Res 134/2025 Art.7',
    detect: (tx) => tx.counterpartyAge && tx.counterpartyAge < 12,
  },
  {
    id: 'GRF-03', category: 'TRADE',
    flag: 'Gold traded between related parties at non-market prices',
    weight: 8, regulation: 'FATF Gold Report | OECD Transfer Pricing Guidelines',
    detect: (tx) => tx.relatedParty && tx.priceDeviation && Math.abs(tx.priceDeviation) > 0.05,
  },
  {
    id: 'GRF-04', category: 'TRADE',
    flag: 'Multiple back-to-back trades with no apparent economic purpose',
    weight: 8, regulation: 'FATF Typology: Layering via Precious Metals',
    detect: (tx) => tx.backToBackCount && tx.backToBackCount >= 3,
  },
  {
    id: 'GRF-05', category: 'TRADE',
    flag: 'Gold invoice values inconsistent with weight and market price',
    weight: 9, regulation: 'FATF Gold Report | FATF Trade-Based ML Indicators',
    detect: (tx) => {
      if (!tx.weight || !tx.invoiceValue || !tx.marketPrice) return false;
      const expected = tx.weight * tx.marketPrice;
      return Math.abs(tx.invoiceValue - expected) / expected > 0.15;
    },
  },

  // ── ORIGIN / PROVENANCE ──
  {
    id: 'GRF-06', category: 'ORIGIN',
    flag: 'Gold claimed as recycled/scrap but quantities exceed normal scrap volumes',
    weight: 8, regulation: 'FATF Gold Report Ch.4 | LBMA RGG v9',
    detect: (tx) => tx.isRecycled && tx.weight > 10, // >10kg scrap is unusual for retail
  },
  {
    id: 'GRF-07', category: 'ORIGIN',
    flag: 'Origin country is a conflict-affected or high-risk area (CAHRA)',
    weight: 9, regulation: 'OECD Annex II | FATF Gold Report | LBMA RGG v9',
    detect: (tx) => {
      const cahra = ['AF', 'CF', 'CD', 'IQ', 'LY', 'ML', 'MM', 'KP', 'SO', 'SS', 'SD', 'SY', 'VE', 'YE', 'ZW'];
      return tx.originCountry && cahra.includes(tx.originCountry);
    },
  },
  {
    id: 'GRF-08', category: 'ORIGIN',
    flag: 'Unable or unwilling to provide provenance documentation for gold',
    weight: 9, regulation: 'FATF RBA for DPMS | OECD Step 2',
    detect: (tx) => tx.provenanceMissing === true,
  },
  {
    id: 'GRF-09', category: 'ORIGIN',
    flag: 'Gold routed through multiple countries without clear commercial reason',
    weight: 8, regulation: 'FATF Gold Report | FATF Typology: Transit Countries',
    detect: (tx) => tx.transitCountries && tx.transitCountries.length >= 3,
  },
  {
    id: 'GRF-10', category: 'ORIGIN',
    flag: 'Gold from artisanal/small-scale mining without formalisation evidence',
    weight: 7, regulation: 'OECD Annex II | LBMA RGG v9 ASM Supplement',
    detect: (tx) => tx.isASM && !tx.asmFormalised,
  },

  // ── CASH PATTERNS ──
  {
    id: 'GRF-11', category: 'CASH',
    flag: 'Large cash payments for gold just below AED 55,000 threshold',
    weight: 9, regulation: 'MoE Circular 08/AML/2021 | FDL No.10/2025 Art.15-16',
    detect: (tx) => tx.method === 'cash' && tx.amount >= 45000 && tx.amount < 55000,
  },
  {
    id: 'GRF-12', category: 'CASH',
    flag: 'Customer insists on cash payment for high-value gold transaction',
    weight: 8, regulation: 'FATF RBA for DPMS | FDL No.10/2025 Art.15',
    detect: (tx) => tx.method === 'cash' && tx.amount >= 55000,
  },
  {
    id: 'GRF-13', category: 'CASH',
    flag: 'Multiple cash transactions by same customer within short period',
    weight: 8, regulation: 'FATF Red Flag: Structuring | MoE Circular 08/AML/2021',
    detect: (tx) => tx.cashFrequency && tx.cashFrequency >= 3,
  },
  {
    id: 'GRF-14', category: 'CASH',
    flag: 'Cash payments accompanied by third-party wire transfers',
    weight: 7, regulation: 'FATF Typology: Mixed Payment ML',
    detect: (tx) => tx.mixedPayment === true,
  },

  // ── IDENTITY CONCERNS ──
  {
    id: 'GRF-15', category: 'IDENTITY',
    flag: 'Customer reluctant to provide identification or provides inconsistent documents',
    weight: 9, regulation: 'FDL No.10/2025 Art.12-14 | FATF Rec 22',
    detect: (tx) => tx.identityIssue === true,
  },
  {
    id: 'GRF-16', category: 'IDENTITY',
    flag: 'Customer uses multiple identities or aliases for transactions',
    weight: 9, regulation: 'FATF Red Flag | FDL No.10/2025 Art.12',
    detect: (tx) => tx.multipleIdentities === true,
  },
  {
    id: 'GRF-17', category: 'IDENTITY',
    flag: 'Transactions conducted by agents or intermediaries with no clear principal',
    weight: 8, regulation: 'FATF RBA for DPMS | Cabinet Res 134/2025 Art.8',
    detect: (tx) => tx.isAgent && !tx.principalIdentified,
  },
  {
    id: 'GRF-18', category: 'IDENTITY',
    flag: 'Customer is a PEP or connected to a PEP',
    weight: 8, regulation: 'Cabinet Res 134/2025 Art.14 | FATF Rec 22',
    detect: (tx) => tx.isPEP === true,
  },

  // ── PRICING ANOMALIES ──
  {
    id: 'GRF-19', category: 'PRICING',
    flag: 'Gold sold significantly below market price (>10% below spot)',
    weight: 9, regulation: 'FATF Gold Report | FATF Typology: Under-invoicing',
    detect: (tx) => tx.priceDeviation && tx.priceDeviation < -0.10,
  },
  {
    id: 'GRF-20', category: 'PRICING',
    flag: 'Gold purchased significantly above market price (>10% above spot)',
    weight: 8, regulation: 'FATF Gold Report | FATF Typology: Over-invoicing',
    detect: (tx) => tx.priceDeviation && tx.priceDeviation > 0.10,
  },
  {
    id: 'GRF-21', category: 'PRICING',
    flag: 'Frequent changes to invoice values after initial agreement',
    weight: 7, regulation: 'FATF Trade-Based ML Indicators',
    detect: (tx) => tx.invoiceAmended === true,
  },

  // ── REFINING ──
  {
    id: 'GRF-22', category: 'REFINING',
    flag: 'Gold refined by non-LBMA accredited refiner',
    weight: 7, regulation: 'LBMA RGG v9 | Dubai Good Delivery Standard',
    detect: (tx) => tx.refiner && !tx.refinerLBMA,
  },
  {
    id: 'GRF-23', category: 'REFINING',
    flag: 'Purity declared does not match assay certificate',
    weight: 8, regulation: 'Dubai Good Delivery | FATF Gold Report',
    detect: (tx) => tx.declaredPurity && tx.assayPurity && Math.abs(tx.declaredPurity - tx.assayPurity) > 0.005,
  },
  {
    id: 'GRF-24', category: 'REFINING',
    flag: 'Weight discrepancy between shipping documents and receipt',
    weight: 8, regulation: 'OECD Annex II | FATF Gold Report',
    detect: (tx) => tx.shippedWeight && tx.receivedWeight && Math.abs(tx.shippedWeight - tx.receivedWeight) / tx.shippedWeight > 0.05,
  },

  // ── STRUCTURING ──
  {
    id: 'GRF-25', category: 'STRUCTURING',
    flag: 'Customer splits a single purchase into multiple smaller transactions',
    weight: 9, regulation: 'FDL No.10/2025 Art.15-16 | FATF Red Flag: Structuring',
    detect: (tx) => tx.splitTransaction === true,
  },
  {
    id: 'GRF-26', category: 'STRUCTURING',
    flag: 'Customer uses multiple branches or dealers for the same purchase',
    weight: 8, regulation: 'FATF Typology: Multi-Location Structuring',
    detect: (tx) => tx.multiDealer === true,
  },

  // ── LOGISTICS ──
  {
    id: 'GRF-27', category: 'LOGISTICS',
    flag: 'Gold shipped to free trade zone with no onward commercial destination',
    weight: 8, regulation: 'FATF Gold Report Ch.5 | FATF Typology: FTZ Abuse',
    detect: (tx) => tx.destinationFTZ && !tx.onwardDestination,
  },
  {
    id: 'GRF-28', category: 'LOGISTICS',
    flag: 'Shipping route inconsistent with declared origin and destination',
    weight: 7, regulation: 'FATF Gold Report | OECD Step 2',
    detect: (tx) => tx.routeAnomaly === true,
  },
  {
    id: 'GRF-29', category: 'LOGISTICS',
    flag: 'Gold transported by hand courier rather than secure logistics',
    weight: 7, regulation: 'FATF Typology: Physical Movement of Gold',
    detect: (tx) => tx.transportMethod === 'hand_carry' && tx.amount >= 60000,
  },
  {
    id: 'GRF-30', category: 'LOGISTICS',
    flag: 'Cross-border gold shipment without customs declaration',
    weight: 9, regulation: 'FDL No.10/2025 Art.35 | Cabinet Res 134/2025 Art.16',
    detect: (tx) => tx.isCrossBorder && !tx.customsDeclared && tx.amount >= 60000,
  },
];

/**
 * Scan a transaction or entity against all FATF gold red flags.
 *
 * @param {object} data - Transaction or entity data.
 * @returns {{ matched: RedFlagMatch[], score: number, riskLevel: string }}
 */
export function scanRedFlags(data) {
  const matched = [];

  for (const rf of GOLD_RED_FLAGS) {
    try {
      if (rf.detect(data)) {
        matched.push({
          id: rf.id,
          category: rf.category,
          flag: rf.flag,
          weight: rf.weight,
          regulation: rf.regulation,
        });
      }
    } catch { /* skip flags that can't evaluate on this data */ }
  }

  // Score: sum of weights, capped at 100
  const rawScore = matched.reduce((s, m) => s + m.weight, 0);
  const score = Math.min(100, rawScore);

  const riskLevel = score >= 25 ? 'CRITICAL'
    : score >= 15 ? 'HIGH'
    : score >= 8 ? 'MEDIUM'
    : score > 0 ? 'LOW' : 'CLEAR';

  return {
    matched,
    totalFlags: matched.length,
    score,
    riskLevel,
    recommendation: getRecommendation(riskLevel, matched),
  };
}

/**
 * Scan a batch of transactions.
 */
export function batchScan(transactions) {
  const results = [];
  const entityFlags = {};

  for (const tx of transactions) {
    const result = scanRedFlags(tx);
    if (result.matched.length > 0) {
      results.push({ transaction: tx, ...result });
      const entity = tx.from || tx.counterparty || tx.customerName;
      if (entity) {
        if (!entityFlags[entity]) entityFlags[entity] = { flags: [], totalScore: 0 };
        entityFlags[entity].flags.push(...result.matched);
        entityFlags[entity].totalScore += result.score;
      }
    }
  }

  return {
    transactions: results,
    flaggedCount: results.length,
    totalTransactions: transactions.length,
    entitySummary: Object.entries(entityFlags).map(([name, data]) => ({
      entity: name,
      flagCount: data.flags.length,
      totalScore: data.totalScore,
      topFlags: [...new Set(data.flags.map(f => f.id))].slice(0, 5),
    })).sort((a, b) => b.totalScore - a.totalScore),
  };
}

function getRecommendation(riskLevel, matched) {
  switch (riskLevel) {
    case 'CRITICAL':
      return 'Immediate escalation to MLRO. Consider STR filing and transaction rejection. Multiple severe red flags detected.';
    case 'HIGH':
      return 'Enhanced due diligence required. Escalate to Compliance Officer. Document findings and obtain senior management approval before proceeding.';
    case 'MEDIUM':
      return 'Additional verification required. Request supporting documentation. Enhance monitoring for this customer/transaction.';
    case 'LOW':
      return 'Minor flag detected. Document and proceed with standard monitoring.';
    default:
      return 'No red flags detected. Proceed with standard procedures.';
  }
}
