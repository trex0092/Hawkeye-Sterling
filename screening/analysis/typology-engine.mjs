/**
 * ML/TF Typology Detection Engine.
 *
 * Implements automated detection of specific money laundering and
 * terrorist financing typologies relevant to Dealers in Precious
 * Metals and Stones, as defined by:
 *
 *   - FATF Trade-Based ML Indicators (2020)
 *   - FATF ML/TF Risk Indicators for Precious Metals Dealers
 *   - Egmont Group Typology Reports
 *   - UAE National Risk Assessment findings
 *
 * Each typology is encoded as a rule set with weighted indicators.
 * When a sufficient number of indicators are present, the typology
 * fires with a confidence score.
 *
 * Zero dependencies. Pure rule-based detection.
 */

const TYPOLOGIES = [
  {
    id: 'TBML-001',
    name: 'Trade-Based Money Laundering via Gold',
    category: 'ML',
    description: 'Over/under-invoicing of gold shipments to transfer value across borders',
    indicators: [
      { id: 'price-deviation', weight: 3, test: (ctx) => {
        if (!ctx.unitPrice || !ctx.marketPrice) return false;
        const deviation = Math.abs(ctx.unitPrice - ctx.marketPrice) / ctx.marketPrice;
        return deviation > 0.10; // >10% deviation from market
      }, description: 'Unit price deviates >10% from market price' },
      { id: 'mismatched-docs', weight: 2, test: (ctx) => ctx.documentMismatch === true,
        description: 'Invoice details do not match shipping documents' },
      { id: 'high-risk-corridor', weight: 2, test: (ctx) =>
        ['IR', 'KP', 'MM'].includes(ctx.originCountry) || ['IR', 'KP', 'MM'].includes(ctx.destCountry),
        description: 'Shipment involves FATF blacklist jurisdiction' },
      { id: 'shell-intermediary', weight: 3, test: (ctx) => ctx.intermediaryIsShell === true,
        description: 'Intermediary entity shows shell company characteristics' },
      { id: 'round-trip', weight: 2, test: (ctx) => ctx.isRoundTrip === true,
        description: 'Gold returns to originating jurisdiction within 90 days' },
    ],
    minScore: 5,
    regulation: 'FDL No.10/2025 Art.26-27 | FATF TBML Indicators (2020)',
  },
  {
    id: 'TBML-002',
    name: 'Carousel Trading in Precious Stones',
    category: 'ML',
    description: 'Circular trading of precious stones between related entities to generate apparent legitimacy',
    indicators: [
      { id: 'circular-flow', weight: 3, test: (ctx) => ctx.circularFlowDetected === true,
        description: 'Same stones traded between related entities multiple times' },
      { id: 'inflating-value', weight: 2, test: (ctx) => ctx.valueInflation > 0.5,
        description: 'Stone valuation increases >50% between trades' },
      { id: 'no-end-consumer', weight: 2, test: (ctx) => ctx.noRetailSale === true,
        description: 'Stones never reach retail consumer' },
      { id: 'same-ubo', weight: 3, test: (ctx) => ctx.sharedUBO === true,
        description: 'Trading entities share ultimate beneficial owner' },
    ],
    minScore: 5,
    regulation: 'FDL No.10/2025 Art.26-27 | FATF Precious Stones Typology',
  },
  {
    id: 'TF-001',
    name: 'Terrorist Financing via Cash-Intensive Gold Trade',
    category: 'TF',
    description: 'Cash purchases of gold converted to untraceable value store for transfer',
    indicators: [
      { id: 'cash-purchases', weight: 2, test: (ctx) => ctx.cashPurchases > 2,
        description: 'Multiple cash purchases below reporting threshold' },
      { id: 'high-risk-buyer', weight: 3, test: (ctx) => ctx.buyerHighRisk === true,
        description: 'Buyer linked to high-risk jurisdiction or entity' },
      { id: 'no-business-rationale', weight: 2, test: (ctx) => ctx.noBusinessRationale === true,
        description: 'No apparent business rationale for transactions' },
      { id: 'small-gold-bars', weight: 1, test: (ctx) => ctx.productType === 'small_gold_bars',
        description: 'Purchases of small, easily transportable gold bars' },
      { id: 'rapid-resale', weight: 2, test: (ctx) => ctx.resaleWithin7Days === true,
        description: 'Gold resold within 7 days of purchase' },
    ],
    minScore: 5,
    regulation: 'FDL No.10/2025 Art.28-30 | UNSCR 1373 | FATF Rec.5-8',
  },
  {
    id: 'PF-001',
    name: 'Proliferation Financing via Precious Metals',
    category: 'PF',
    description: 'Precious metals used to circumvent targeted financial sanctions for WMD programs',
    indicators: [
      { id: 'sanctioned-nexus', weight: 4, test: (ctx) => ctx.sanctionedEntityNexus === true,
        description: 'Transaction chain includes sanctioned entity or country' },
      { id: 'dual-use-goods', weight: 2, test: (ctx) => ctx.dualUseGoodsLinked === true,
        description: 'Transaction linked to dual-use goods procurement' },
      { id: 'front-company', weight: 3, test: (ctx) => ctx.frontCompanyIndicators >= 3,
        description: 'Counterparty exhibits front company indicators' },
      { id: 'evasion-pattern', weight: 2, test: (ctx) => ctx.sanctionsEvasionPattern === true,
        description: 'Transaction pattern consistent with sanctions evasion' },
    ],
    minScore: 6,
    regulation: 'FDL No.10/2025 Art.31-33 | UNSCR 1718, 2231 | FATF Rec.7',
  },
  {
    id: 'ML-001',
    name: 'Layered Cash Conversion',
    category: 'ML',
    description: 'Converting cash proceeds to gold/precious stones through multiple intermediaries',
    indicators: [
      { id: 'cash-heavy', weight: 2, test: (ctx) => ctx.cashRatio > 0.7,
        description: 'Cash accounts for >70% of transaction value' },
      { id: 'multiple-intermediaries', weight: 2, test: (ctx) => ctx.intermediaryCount >= 3,
        description: '3+ intermediaries in transaction chain' },
      { id: 'rapid-conversion', weight: 2, test: (ctx) => ctx.conversionDays < 3,
        description: 'Cash converted to precious metals within 3 days' },
      { id: 'fragmented-deposits', weight: 2, test: (ctx) => ctx.fragmentedDeposits === true,
        description: 'Multiple small cash deposits across different locations' },
      { id: 'no-kyc-docs', weight: 3, test: (ctx) => ctx.kycIncomplete === true,
        description: 'Customer KYC documentation incomplete or suspicious' },
    ],
    minScore: 5,
    regulation: 'FDL No.10/2025 Art.15-16 | Cabinet Res 134/2025 Art.7-10',
  },
  {
    id: 'ML-002',
    name: 'Gold-for-Drugs Exchange',
    category: 'ML',
    description: 'Gold used as payment mechanism in narcotics trade',
    indicators: [
      { id: 'drug-corridor', weight: 3, test: (ctx) =>
        ['CO', 'MX', 'AF', 'MM'].includes(ctx.counterpartyCountry),
        description: 'Counterparty in known narcotics source country' },
      { id: 'unusual-shipping', weight: 2, test: (ctx) => ctx.unusualShippingRoute === true,
        description: 'Shipping route inconsistent with declared business' },
      { id: 'adverse-media', weight: 2, test: (ctx) => ctx.adverseMediaDrugLinks > 0,
        description: 'Counterparty has adverse media related to narcotics' },
      { id: 'cash-and-gold', weight: 2, test: (ctx) => ctx.mixedCashGold === true,
        description: 'Transaction mixes cash and gold in unusual pattern' },
    ],
    minScore: 5,
    regulation: 'FDL No.10/2025 Art.26-27 | FATF Typology: Gold & Drug Trade',
  },
];

/**
 * Screen a transaction context against all typologies.
 *
 * @param {object} context - Transaction and entity context data
 * @returns {{ matches: TypeMatch[], summary: object }}
 */
export function screenTypologies(context) {
  const matches = [];

  for (const typology of TYPOLOGIES) {
    const indicatorResults = [];
    let totalScore = 0;

    for (const indicator of typology.indicators) {
      let triggered = false;
      try {
        triggered = indicator.test(context);
      } catch {
        triggered = false;
      }

      indicatorResults.push({
        id: indicator.id,
        description: indicator.description,
        weight: indicator.weight,
        triggered,
      });

      if (triggered) totalScore += indicator.weight;
    }

    if (totalScore >= typology.minScore) {
      const maxScore = typology.indicators.reduce((s, i) => s + i.weight, 0);
      const confidence = Math.min(1, totalScore / maxScore);

      matches.push({
        typologyId: typology.id,
        name: typology.name,
        category: typology.category,
        description: typology.description,
        confidence,
        severity: confidence >= 0.7 ? 'CRITICAL' : confidence >= 0.5 ? 'HIGH' : 'MEDIUM',
        score: totalScore,
        maxScore,
        indicators: indicatorResults,
        triggeredCount: indicatorResults.filter(i => i.triggered).length,
        regulation: typology.regulation,
        recommendation: generateTypologyAction(typology, confidence),
      });
    }
  }

  return {
    matches: matches.sort((a, b) => b.confidence - a.confidence),
    summary: {
      typologiesChecked: TYPOLOGIES.length,
      matchesFound: matches.length,
      criticalMatches: matches.filter(m => m.severity === 'CRITICAL').length,
      categories: {
        ML: matches.filter(m => m.category === 'ML').length,
        TF: matches.filter(m => m.category === 'TF').length,
        PF: matches.filter(m => m.category === 'PF').length,
      },
    },
    screenedAt: new Date().toISOString(),
  };
}

function generateTypologyAction(typology, confidence) {
  if (confidence >= 0.7) {
    return `IMMEDIATE: File ${typology.category === 'TF' ? 'STR (TF-related)' : 'STR'} via goAML. ` +
           `Freeze assets if applicable. Notify MLRO within 24 hours.`;
  }
  if (confidence >= 0.5) {
    return `ESCALATE: Refer to MLRO for enhanced investigation. ` +
           `Gather additional evidence for ${typology.id} indicators.`;
  }
  return `MONITOR: Add to watchlist for ongoing monitoring. ` +
         `Review at next CDD cycle.`;
}

/**
 * Get all available typology definitions (for documentation/UI).
 */
export function getTypologyDefinitions() {
  return TYPOLOGIES.map(t => ({
    id: t.id,
    name: t.name,
    category: t.category,
    description: t.description,
    indicatorCount: t.indicators.length,
    minScore: t.minScore,
    regulation: t.regulation,
    indicators: t.indicators.map(i => ({
      id: i.id,
      description: i.description,
      weight: i.weight,
    })),
  }));
}

export { TYPOLOGIES };
