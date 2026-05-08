// Hawkeye Sterling — semantic financial crime event classifier.
// Classifies news/enforcement text into structured financial crime events
// with FATF predicate offense mapping, severity, and confidence scores.
//
// Event types cover the full FATF predicate offense list and DNFBP-specific
// typologies. Each event is independently traceable to source text.

export type FinancialCrimeEventType =
  | 'money_laundering'
  | 'terrorist_financing'
  | 'proliferation_financing'
  | 'sanctions_evasion'
  | 'bribery'
  | 'corruption'
  | 'fraud'
  | 'embezzlement'
  | 'insider_trading'
  | 'market_manipulation'
  | 'tax_crime'
  | 'drug_trafficking'
  | 'human_trafficking'
  | 'cybercrime'
  | 'environmental_crime'
  | 'arms_trafficking'
  | 'pep_abuse'
  | 'shell_company_abuse'
  | 'trade_based_laundering'
  | 'real_estate_laundering'
  | 'crypto_crime'
  | 'regulatory_breach'
  | 'accounting_fraud'
  | 'foreign_bribery'
  | 'kleptocracy';

export interface ClassifiedEvent {
  type: FinancialCrimeEventType;
  subType?: string;
  confidence: number;        // 0..1
  severity: 'critical' | 'high' | 'medium' | 'low';
  fatfPredicateOffense: string;
  fatfRecommendations: string[];
  evidenceTokens: string[];  // text fragments that triggered classification
  propagatesTo: FinancialCrimeEventType[]; // likely co-occurring events
  requiresSTR: boolean;
  typologyCode?: string;     // internal typology reference
}

// ── Classification signal definitions ────────────────────────────────────────

interface EventSignal {
  type: FinancialCrimeEventType;
  subType?: string;
  patterns: RegExp[];
  negativePatterns?: RegExp[]; // patterns that override (false-positive guards)
  severity: ClassifiedEvent['severity'];
  fatfPredicate: string;
  fatfRecs: string[];
  propagatesTo: FinancialCrimeEventType[];
  requiresSTR: boolean;
  typologyCode?: string;
  minTokens?: number; // minimum matching patterns required
}

const EVENT_SIGNALS: EventSignal[] = [
  {
    type: 'money_laundering',
    patterns: [
      /money[\s-]launder/gi,
      /laundering\s+(?:of\s+)?(?:money|funds|proceeds|assets)/gi,
      /anti[\s-]money\s+laundering/gi,
      /proceeds\s+of\s+(?:crime|criminal\s+activity|unlawful)/gi,
      /placement|layering|integration/gi,
      /structuring\s+transactions/gi,
      /smurfing/gi,
      /commingling\s+(?:of\s+)?funds/gi,
    ],
    severity: 'high',
    fatfPredicate: 'Money Laundering (FATF R.3)',
    fatfRecs: ['R.3', 'R.10', 'R.20', 'R.21'],
    propagatesTo: ['shell_company_abuse', 'trade_based_laundering', 'real_estate_laundering'],
    requiresSTR: true,
    typologyCode: 'ML-001',
  },
  {
    type: 'terrorist_financing',
    patterns: [
      /terrorist\s+financ/gi,
      /financ(?:ing|ed)\s+(?:of\s+)?terrorism/gi,
      /terror\s+fund/gi,
      /material\s+support\s+to\s+terrorism/gi,
      /IRGC|al.qaeda|isis|isil|daesh|hezbollah|hamas|al.shabaab|boko\s+haram/gi,
      /designated\s+(?:foreign\s+)?terrorist/gi,
      /FTO\b/g,
    ],
    severity: 'critical',
    fatfPredicate: 'Terrorist Financing (FATF R.5)',
    fatfRecs: ['R.5', 'R.6', 'R.20', 'R.21'],
    propagatesTo: ['money_laundering', 'proliferation_financing'],
    requiresSTR: true,
    typologyCode: 'TF-001',
  },
  {
    type: 'proliferation_financing',
    patterns: [
      /proliferation\s+financ/gi,
      /weapons?\s+of\s+mass\s+destruction/gi,
      /\bWMD\b/g,
      /nuclear\s+(?:weapon|program|enrichment|material|device)/gi,
      /ballistic\s+missile/gi,
      /dual.use\s+(?:goods|items|technology|export)/gi,
      /chemical\s+weapon/gi,
      /biological\s+weapon/gi,
      /centrifuge|uranium\s+enrichment|plutonium|fissile/gi,
    ],
    severity: 'critical',
    fatfPredicate: 'Proliferation Financing (FATF R.7)',
    fatfRecs: ['R.7', 'INR.7', 'R.20'],
    propagatesTo: ['sanctions_evasion', 'trade_based_laundering'],
    requiresSTR: true,
    typologyCode: 'PF-001',
  },
  {
    type: 'sanctions_evasion',
    patterns: [
      /sanctions?\s+(?:evasion|evasion|busting|circumvention|violation|breach)/gi,
      /OFAC\s+(?:violat|penalt|settlement)/gi,
      /SDN\s+(?:list(?:ed)?|violat)/gi,
      /asset\s+(?:freeze|frozen)\s+violat/gi,
      /deceptive\s+shipping/gi,
      /AIS\s+(?:manip|spoofing|off)/gi,
      /flag\s+hopping/gi,
      /shell\s+(?:company|entity)\s+sanction/gi,
    ],
    severity: 'critical',
    fatfPredicate: 'Sanctions Violation / Evasion',
    fatfRecs: ['R.6', 'R.7', 'R.20'],
    propagatesTo: ['money_laundering', 'trade_based_laundering', 'shell_company_abuse'],
    requiresSTR: true,
    typologyCode: 'SE-001',
  },
  {
    type: 'bribery',
    patterns: [
      /bribery|brib(?:ed|ing|es)/gi,
      /kickback/gi,
      /facilitation\s+payment/gi,
      /grease\s+payment/gi,
      /FCPA\s+violat/gi,
      /UK\s+Bribery\s+Act/gi,
    ],
    severity: 'high',
    fatfPredicate: 'Bribery (FATF R.3)',
    fatfRecs: ['R.3', 'R.12', 'R.20'],
    propagatesTo: ['corruption', 'money_laundering', 'foreign_bribery'],
    requiresSTR: true,
    typologyCode: 'BR-001',
  },
  {
    type: 'corruption',
    patterns: [
      /corruption|corrupt(?:ed|ing)\s+(?:official|government|politician)/gi,
      /kleptocracy|kleptocrat/gi,
      /state\s+capture/gi,
      /abuse\s+of\s+(?:power|position|office)/gi,
      /misappropriat(?:ion|ed)\s+(?:public\s+)?funds/gi,
    ],
    severity: 'high',
    fatfPredicate: 'Corruption (FATF R.3)',
    fatfRecs: ['R.3', 'R.12', 'R.20'],
    propagatesTo: ['bribery', 'embezzlement', 'money_laundering', 'pep_abuse'],
    requiresSTR: true,
    typologyCode: 'CO-001',
  },
  {
    type: 'fraud',
    patterns: [
      /\bfraud\b/gi,
      /Ponzi\s+scheme/gi,
      /pyramid\s+scheme/gi,
      /wire\s+fraud/gi,
      /bank\s+fraud/gi,
      /securities\s+fraud/gi,
      /investment\s+fraud/gi,
      /identity\s+fraud/gi,
      /pig\s+butchering/gi,
    ],
    severity: 'high',
    fatfPredicate: 'Fraud (FATF R.3)',
    fatfRecs: ['R.3', 'R.10', 'R.20'],
    propagatesTo: ['money_laundering', 'cybercrime'],
    requiresSTR: false,
    typologyCode: 'FR-001',
  },
  {
    type: 'insider_trading',
    patterns: [
      /insider\s+trading/gi,
      /insider\s+dealing/gi,
      /front.running/gi,
      /material\s+non.public\s+information/gi,
      /MNPI\b/g,
    ],
    severity: 'high',
    fatfPredicate: 'Insider Trading (FATF R.3)',
    fatfRecs: ['R.3', 'R.20'],
    propagatesTo: ['market_manipulation', 'money_laundering'],
    requiresSTR: false,
    typologyCode: 'IT-001',
  },
  {
    type: 'market_manipulation',
    patterns: [
      /market\s+manipulation/gi,
      /pump.and.dump/gi,
      /wash\s+trading/gi,
      /spoofing\s+(?:orders?|bids?)/gi,
      /layering\s+(?:orders?|trades?)/gi,
      /false\s+market/gi,
    ],
    severity: 'high',
    fatfPredicate: 'Market Manipulation (FATF R.3)',
    fatfRecs: ['R.3', 'R.15', 'R.20'],
    propagatesTo: ['insider_trading', 'money_laundering'],
    requiresSTR: false,
    typologyCode: 'MM-001',
  },
  {
    type: 'tax_crime',
    patterns: [
      /tax\s+(?:evasion|fraud|crime)/gi,
      /offshore\s+tax\s+evasion/gi,
      /undeclared\s+(?:account|income|assets)/gi,
      /Panama\s+Papers|Paradise\s+Papers|Pandora\s+Papers/gi,
      /FATCA\s+violat/gi,
      /CRS\s+(?:violation|non.complian)/gi,
    ],
    severity: 'medium',
    fatfPredicate: 'Tax Crime (FATF R.3)',
    fatfRecs: ['R.3', 'R.10'],
    propagatesTo: ['money_laundering', 'shell_company_abuse'],
    requiresSTR: false,
    typologyCode: 'TC-001',
  },
  {
    type: 'crypto_crime',
    patterns: [
      /crypto\s+(?:fraud|theft|hack|laundering)/gi,
      /ransomware\s+payment/gi,
      /darknet\s+(?:market|purchase)/gi,
      /tornado\s+cash/gi,
      /coin\s+mixer/gi,
      /rug\s+pull/gi,
      /DeFi\s+exploit/gi,
      /crypto\s+mixing/gi,
    ],
    severity: 'medium',
    fatfPredicate: 'Virtual Asset Crime (FATF R.15)',
    fatfRecs: ['R.15', 'R.3', 'R.20'],
    propagatesTo: ['money_laundering', 'cybercrime'],
    requiresSTR: false,
    typologyCode: 'CC-001',
  },
  {
    type: 'trade_based_laundering',
    patterns: [
      /trade.based\s+(?:money\s+)?laundering/gi,
      /over.invoicing|under.invoicing/gi,
      /mis.invoicing/gi,
      /phantom\s+(?:shipment|goods)/gi,
      /multiple\s+invoicing/gi,
      /carousel\s+fraud/gi,
    ],
    severity: 'high',
    fatfPredicate: 'Trade-Based Money Laundering (FATF R.3)',
    fatfRecs: ['R.3', 'R.20'],
    propagatesTo: ['money_laundering', 'sanctions_evasion'],
    requiresSTR: true,
    typologyCode: 'TBML-001',
  },
  {
    type: 'shell_company_abuse',
    patterns: [
      /shell\s+company/gi,
      /front\s+company/gi,
      /nominee\s+director/gi,
      /beneficial\s+owner(?:ship)?\s+(?:concealment|hidden|opaque)/gi,
      /opaque\s+(?:ownership|structure)/gi,
      /layered\s+ownership/gi,
    ],
    severity: 'high',
    fatfPredicate: 'Shell Company Abuse (FATF R.24)',
    fatfRecs: ['R.24', 'R.25', 'R.10'],
    propagatesTo: ['money_laundering', 'tax_crime'],
    requiresSTR: false,
    typologyCode: 'SC-001',
  },
  {
    type: 'real_estate_laundering',
    patterns: [
      /real\s+estate\s+(?:launder|fraud|money\s+laundering)/gi,
      /property\s+(?:launder|purchased\s+with\s+(?:illicit|criminal|dirty))/gi,
      /luxury\s+(?:property|apartment|villa)\s+(?:purchased|bought)\s+cash/gi,
    ],
    severity: 'high',
    fatfPredicate: 'Real Estate Laundering (FATF R.22)',
    fatfRecs: ['R.22', 'R.3'],
    propagatesTo: ['money_laundering'],
    requiresSTR: true,
    typologyCode: 'RE-001',
  },
  {
    type: 'accounting_fraud',
    patterns: [
      /accounting\s+fraud|accounting\s+irregularit/gi,
      /earnings\s+manipulation/gi,
      /revenue\s+inflation/gi,
      /financial\s+statement\s+fraud/gi,
      /audit\s+(?:failure|qualified|disclaim)/gi,
      /restatement\s+of\s+(?:earnings|financial\s+results)/gi,
    ],
    severity: 'high',
    fatfPredicate: 'Accounting Fraud (FATF R.3)',
    fatfRecs: ['R.3', 'R.10'],
    propagatesTo: ['fraud', 'money_laundering'],
    requiresSTR: false,
    typologyCode: 'AF-001',
  },
  {
    type: 'pep_abuse',
    patterns: [
      /politically\s+exposed\s+person/gi,
      /\bPEP\b.*(?:abuse|corrupt|sanction|defraud)/gi,
      /senior\s+official.*(?:brib|corrupt|embezzl)/gi,
      /government\s+official.*(?:stolen|looted|embezzl)/gi,
    ],
    severity: 'high',
    fatfPredicate: 'PEP Abuse (FATF R.12)',
    fatfRecs: ['R.12', 'R.13', 'R.20'],
    propagatesTo: ['corruption', 'bribery', 'money_laundering'],
    requiresSTR: true,
    typologyCode: 'PE-001',
  },
];

// ── Classifier ────────────────────────────────────────────────────────────────

export function classifyEvents(text: string): ClassifiedEvent[] {
  const events: ClassifiedEvent[] = [];

  for (const signal of EVENT_SIGNALS) {
    const matchedTokens: string[] = [];

    for (const pattern of signal.patterns) {
      const matches = text.match(new RegExp(pattern.source, pattern.flags)) ?? [];
      matchedTokens.push(...matches.slice(0, 3));
    }

    if (matchedTokens.length === 0) continue;

    // Apply negative patterns (false-positive guards)
    if (signal.negativePatterns) {
      const negativeMatch = signal.negativePatterns.some((np) => np.test(text));
      if (negativeMatch) continue;
    }

    // Confidence = proportion of patterns matched, up to 1
    const patternsMatched = signal.patterns.filter((p) => p.test(text)).length;
    const confidence = Math.min(1, 0.50 + (patternsMatched / signal.patterns.length) * 0.50);

    events.push({
      type: signal.type,
      subType: signal.subType,
      confidence,
      severity: signal.severity,
      fatfPredicateOffense: signal.fatfPredicate,
      fatfRecommendations: signal.fatfRecs,
      evidenceTokens: [...new Set(matchedTokens)].slice(0, 5),
      propagatesTo: signal.propagatesTo,
      requiresSTR: signal.requiresSTR,
      typologyCode: signal.typologyCode,
    });
  }

  // Sort: critical → high → medium → low, then by confidence desc
  const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
  events.sort((a, b) => {
    const sd = (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0);
    return sd !== 0 ? sd : b.confidence - a.confidence;
  });

  return events;
}

// ── Event propagation expander ────────────────────────────────────────────────
// Given directly classified events, expand to likely co-occurring events
// that may not have enough direct evidence to classify on their own.

export function expandEventPropagation(
  directEvents: ClassifiedEvent[],
  text: string,
): ClassifiedEvent[] {
  const allEvents = [...directEvents];
  const existingTypes = new Set(directEvents.map((e) => e.type));

  for (const event of directEvents) {
    for (const propagated of event.propagatesTo) {
      if (existingTypes.has(propagated)) continue;
      // Check if text has weak signal for the propagated type
      const propSignal = EVENT_SIGNALS.find((s) => s.type === propagated);
      if (!propSignal) continue;
      const weakMatch = propSignal.patterns.some((p) => p.test(text));
      if (!weakMatch) continue;
      existingTypes.add(propagated);
      allEvents.push({
        type: propagated,
        confidence: event.confidence * 0.6, // reduced confidence (indirect)
        severity: propSignal.severity,
        fatfPredicateOffense: propSignal.fatfPredicate,
        fatfRecommendations: propSignal.fatfRecs,
        evidenceTokens: [`propagated from ${event.type}`],
        propagatesTo: propSignal.propagatesTo,
        requiresSTR: propSignal.requiresSTR,
        typologyCode: propSignal.typologyCode,
      });
    }
  }

  return allEvents;
}

// ── STR recommendation logic ──────────────────────────────────────────────────

export interface STRRecommendation {
  recommended: boolean;
  urgency: 'immediate' | 'within_24h' | 'within_30_days' | 'monitor';
  basis: string;
  fatfBasis: string[];
}

export function recommendSTR(events: ClassifiedEvent[]): STRRecommendation {
  const critical = events.filter((e) => e.severity === 'critical' && e.requiresSTR);
  const high = events.filter((e) => e.severity === 'high' && e.requiresSTR);

  if (critical.length > 0) {
    return {
      recommended: true,
      urgency: 'immediate',
      basis: `Critical financial crime event(s): ${critical.map((e) => e.type).join(', ')}`,
      fatfBasis: [...new Set(critical.flatMap((e) => e.fatfRecommendations))],
    };
  }

  if (high.length > 0) {
    return {
      recommended: true,
      urgency: 'within_24h',
      basis: `High-severity financial crime event(s): ${high.map((e) => e.type).join(', ')}`,
      fatfBasis: [...new Set(high.flatMap((e) => e.fatfRecommendations))],
    };
  }

  const medium = events.filter((e) => e.severity === 'medium');
  if (medium.length >= 2) {
    return {
      recommended: true,
      urgency: 'within_30_days',
      basis: `Pattern of medium-severity events: ${medium.map((e) => e.type).join(', ')}`,
      fatfBasis: ['R.20'],
    };
  }

  return {
    recommended: false,
    urgency: 'monitor',
    basis: 'No STR threshold met; continue enhanced monitoring.',
    fatfBasis: [],
  };
}
