// Hawkeye Sterling — adverse-media NLP pipeline.
// Extracts structured intelligence from raw news/enforcement text:
//   crimes, persons, entities, dates, jurisdictions, penalties,
//   sanctions designations, convictions, enforcement actions.
//
// Architecture: rule-based extraction with pattern libraries.
// No external ML dependencies — deterministic and auditable.

// ── Extraction types ──────────────────────────────────────────────────────────

export interface ExtractedPerson {
  name: string;
  roles: string[];        // 'suspect', 'defendant', 'director', 'official', 'victim'
  nationality?: string;
  mentions: number;
}

export interface ExtractedEntity {
  name: string;
  types: string[];        // 'company', 'bank', 'government', 'ngо', 'vessel', 'cryptocurrency_exchange'
  jurisdiction?: string;
  mentions: number;
}

export interface ExtractedCrime {
  category: string;       // FATF predicate offense category
  keywords: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  fatfRecommendations: string[];
}

export interface ExtractedPenalty {
  type: 'fine' | 'imprisonment' | 'confiscation' | 'debarment' | 'license_revocation' | 'other';
  amount?: number | undefined;
  currency?: string | undefined;
  duration?: string | undefined;
  rawText: string;
}

export interface ExtractedDate {
  date: string;           // ISO 8601 date
  context: string;        // surrounding text snippet
  type: 'incident' | 'conviction' | 'sentencing' | 'filing' | 'publication';
}

export interface ExtractedJurisdiction {
  code: string;           // ISO 3166-1 alpha-2
  name: string;
  role: 'venue' | 'subject_nationality' | 'enforcement_authority' | 'victim_country';
}

export interface NLPExtractionResult {
  sourceText: string;
  wordCount: number;
  persons: ExtractedPerson[];
  entities: ExtractedEntity[];
  crimes: ExtractedCrime[];
  penalties: ExtractedPenalty[];
  dates: ExtractedDate[];
  jurisdictions: ExtractedJurisdiction[];
  sanctionsMentioned: boolean;
  convictionMentioned: boolean;
  arrestMentioned: boolean;
  sarRelevant: boolean;
  confidenceScore: number;  // 0..1 — extraction quality
  extractedAt: string;
}

// ── Crime pattern library ─────────────────────────────────────────────────────

interface CrimePattern {
  category: string;
  patterns: RegExp[];
  severity: ExtractedCrime['severity'];
  fatfRecs: string[];
}

const CRIME_PATTERNS: CrimePattern[] = [
  {
    category: 'money_laundering',
    patterns: [
      /money.laundering/gi,
      /laundering.(?:of\s+)?(?:money|funds|proceeds)/gi,
      /launder(?:ed|ing|s)/gi,
      /placement|layering|integration/gi,
      /proceeds\s+of\s+crime/gi,
    ],
    severity: 'high',
    fatfRecs: ['R.3', 'R.20'],
  },
  {
    category: 'terrorist_financing',
    patterns: [
      /terrorist.financ/gi,
      /financ.(?:of\s+)?terrorism/gi,
      /terror.fund/gi,
      /designated.terrorist/gi,
      /foreign.terrorist.organi/gi,
    ],
    severity: 'critical',
    fatfRecs: ['R.5', 'R.6', 'R.20', 'R.21'],
  },
  {
    category: 'proliferation_financing',
    patterns: [
      /proliferation.financ/gi,
      /weapons?\s+of\s+mass\s+destruction/gi,
      /\bWMD\b/g,
      /dual.use.(?:goods|items|technology)/gi,
      /nuclear.(?:weapon|program|material)/gi,
    ],
    severity: 'critical',
    fatfRecs: ['R.7', 'INR.7'],
  },
  {
    category: 'sanctions_evasion',
    patterns: [
      /sanctions?.evasion/gi,
      /sanctions?.violat/gi,
      /sanctions?.circumvent/gi,
      /OFAC.violat/gi,
      /SDN.list(?:ed)?/gi,
      /asset.freeze\s+violat/gi,
    ],
    severity: 'critical',
    fatfRecs: ['R.6', 'R.7'],
  },
  {
    category: 'bribery_corruption',
    patterns: [
      /bribery|brib(?:ed|ing)/gi,
      /corruption|corrupt(?:ed|ing)/gi,
      /kickback/gi,
      /facilitation.payment/gi,
      /kleptocrac/gi,
      /embezzl(?:ed|ment|ing)/gi,
    ],
    severity: 'high',
    fatfRecs: ['R.3', 'R.12'],
  },
  {
    category: 'fraud',
    patterns: [
      /\bfraud\b/gi,
      /fraudulent/gi,
      /Ponzi\s+scheme/gi,
      /pyramid\s+scheme/gi,
      /insider\s+trading/gi,
      /market\s+manipulation/gi,
      /accounting\s+fraud/gi,
      /wire\s+fraud/gi,
    ],
    severity: 'high',
    fatfRecs: ['R.3', 'R.10'],
  },
  {
    category: 'drug_trafficking',
    patterns: [
      /drug.trafficking/gi,
      /narcotics.trafficking/gi,
      /drug.cartel/gi,
      /narco.laundering/gi,
      /cocaine|heroin|methamphetamine|fentanyl/gi,
    ],
    severity: 'medium',
    fatfRecs: ['R.3'],
  },
  {
    category: 'human_trafficking',
    patterns: [
      /human.trafficking/gi,
      /sex.trafficking/gi,
      /forced.labour/gi,
      /modern.slavery/gi,
      /people.smuggling/gi,
    ],
    severity: 'high',
    fatfRecs: ['R.3'],
  },
];

// ── Penalty extraction ────────────────────────────────────────────────────────

const PENALTY_PATTERNS: Array<{ pattern: RegExp; type: ExtractedPenalty['type'] }> = [
  { pattern: /fined?\s+(?:USD?|EUR?|GBP?|AED?)?\s*[\d,]+(?:\.\d+)?(?:\s*(?:million|billion|mn|bn))?/gi, type: 'fine' },
  { pattern: /penalty\s+of\s+(?:USD?|EUR?|GBP?|AED?)?\s*[\d,]+(?:\.\d+)?(?:\s*(?:million|billion|mn|bn))?/gi, type: 'fine' },
  { pattern: /sentenced?\s+to\s+[\d.]+\s+years?/gi, type: 'imprisonment' },
  { pattern: /prison\s+(?:term|sentence)\s+of\s+[\d.]+\s+years?/gi, type: 'imprisonment' },
  { pattern: /confiscation\s+of\s+(?:USD?|EUR?|GBP?|AED?)?\s*[\d,]+/gi, type: 'confiscation' },
  { pattern: /asset\s+forfeiture/gi, type: 'confiscation' },
  { pattern: /debarred?|disqualified?|struck\s+off/gi, type: 'debarment' },
  { pattern: /license\s+(?:revoked?|suspended?|cancelled?)/gi, type: 'license_revocation' },
];

// ── Currency + amount patterns ────────────────────────────────────────────────

const AMOUNT_PATTERN = /(USD?|EUR?|GBP?|AED?|CNY?)\s*([\d,]+(?:\.\d+)?)\s*(million|billion|mn|bn)?/i;
const CURRENCIES: Record<string, string> = {
  'usd': 'USD', 'us$': 'USD', 'eur': 'EUR', 'gbp': 'GBP', 'aed': 'AED', 'cny': 'CNY',
};

function extractAmount(text: string): { amount: number; currency: string } | null {
  const m = AMOUNT_PATTERN.exec(text);
  if (!m) return null;
  const cur = CURRENCIES[(m[1] ?? '').toLowerCase()] ?? 'USD';
  const raw = parseFloat((m[2] ?? '0').replace(/,/g, ''));
  const mult = m[3] ? (m[3].toLowerCase().startsWith('b') ? 1e9 : 1e6) : 1;
  return { amount: raw * mult, currency: cur };
}

// ── Date extraction ───────────────────────────────────────────────────────────

const DATE_PATTERNS: Array<{ pattern: RegExp; type: ExtractedDate['type'] }> = [
  { pattern: /convicted?\s+(?:on|in)\s+(\w+\s+\d{1,2},?\s+\d{4})/gi, type: 'conviction' },
  { pattern: /sentenced?\s+(?:on|in)\s+(\w+\s+\d{1,2},?\s+\d{4})/gi, type: 'sentencing' },
  { pattern: /arrested?\s+(?:on|in)\s+(\w+\s+\d{1,2},?\s+\d{4})/gi, type: 'incident' },
  { pattern: /filed?\s+(?:on|in)\s+(\w+\s+\d{1,2},?\s+\d{4})/gi, type: 'filing' },
  { pattern: /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g, type: 'incident' },
];

// ── Jurisdiction mapping ──────────────────────────────────────────────────────

const JURISDICTION_TERMS: Record<string, string> = {
  'united states': 'US', 'u.s.': 'US', 'usa': 'US',
  'united kingdom': 'GB', 'u.k.': 'GB', 'britain': 'GB',
  'european union': 'EU', 'e.u.': 'EU',
  'united arab emirates': 'AE', 'uae': 'AE',
  'saudi arabia': 'SA',
  'iran': 'IR', 'islamic republic of iran': 'IR',
  'north korea': 'KP', 'dprk': 'KP', "democratic people's republic of korea": 'KP',
  'russia': 'RU', 'russian federation': 'RU',
  'china': 'CN', "people's republic of china": 'CN',
  'germany': 'DE',
  'france': 'FR',
  'switzerland': 'CH',
  'singapore': 'SG',
  'hong kong': 'HK',
  'cayman islands': 'KY',
  'british virgin islands': 'VG',
};

// ── Action detection ──────────────────────────────────────────────────────────

const SANCTIONS_INDICATORS = [
  /\bsanction(?:ed|s|ing)\b/gi,
  /\bdesignated?\b.*OFAC/gi,
  /\bSDN\b/g,
  /\bfrozen?\s+assets?\b/gi,
  /\btravel\s+ban\b/gi,
];

const CONVICTION_INDICATORS = [
  /\bconvicted?\b/gi,
  /\bguilty\s+(?:plea|verdict)\b/gi,
  /\bplea\s+deal\b/gi,
  /\bsentenced?\b/gi,
];

const ARREST_INDICATORS = [
  /\barrested?\b/gi,
  /\bdetained?\b/gi,
  /\bindicted?\b/gi,
  /\bcharged?\s+with\b/gi,
];

function anyMatch(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

// ── Confidence scoring ────────────────────────────────────────────────────────

function computeConfidence(result: Partial<NLPExtractionResult>): number {
  let score = 0.50;
  if ((result.crimes?.length ?? 0) > 0) score += 0.15;
  if ((result.persons?.length ?? 0) > 0) score += 0.10;
  if ((result.dates?.length ?? 0) > 0) score += 0.05;
  if ((result.penalties?.length ?? 0) > 0) score += 0.10;
  if ((result.jurisdictions?.length ?? 0) > 0) score += 0.05;
  if (result.sanctionsMentioned) score += 0.05;
  return Math.min(1, score);
}

// ── Main extraction function ──────────────────────────────────────────────────

export function extractNLP(text: string): NLPExtractionResult {
  const words = text.split(/\s+/).filter(Boolean);

  // Crime extraction
  const crimes: ExtractedCrime[] = [];
  const seenCategories = new Set<string>();
  for (const cp of CRIME_PATTERNS) {
    const matched = cp.patterns.some((p) => p.test(text));
    if (matched && !seenCategories.has(cp.category)) {
      seenCategories.add(cp.category);
      const keywords = cp.patterns
        .flatMap((p) => { const m = text.match(p); return m ? m.slice(0, 3) : []; })
        .filter(Boolean);
      crimes.push({
        category: cp.category,
        keywords: [...new Set(keywords)].slice(0, 5),
        severity: cp.severity,
        fatfRecommendations: cp.fatfRecs,
      });
    }
  }

  // Penalty extraction
  const penalties: ExtractedPenalty[] = [];
  for (const { pattern, type } of PENALTY_PATTERNS) {
    const matches = text.match(pattern) ?? [];
    for (const raw of matches.slice(0, 5)) {
      const amountData = extractAmount(raw);
      penalties.push({
        type,
        amount: amountData?.amount,
        currency: amountData?.currency,
        rawText: raw.trim(),
      });
    }
  }

  // Date extraction
  const dates: ExtractedDate[] = [];
  for (const { pattern, type } of DATE_PATTERNS) {
    let m;
    const re = new RegExp(pattern.source, pattern.flags);
    while ((m = re.exec(text)) !== null) {
      const rawDate = m[1] ?? m[0];
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime())) {
        dates.push({
          date: parsed.toISOString().slice(0, 10),
          context: text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).trim(),
          type,
        });
      }
      if (dates.length >= 10) break;
    }
  }

  // Jurisdiction extraction
  const jurisdictions: ExtractedJurisdiction[] = [];
  const lowerText = text.toLowerCase();
  for (const [term, code] of Object.entries(JURISDICTION_TERMS)) {
    if (lowerText.includes(term)) {
      const name = term.charAt(0).toUpperCase() + term.slice(1);
      jurisdictions.push({ code, name, role: 'venue' });
    }
  }

  // Action detection
  const sanctionsMentioned = anyMatch(text, SANCTIONS_INDICATORS);
  const convictionMentioned = anyMatch(text, CONVICTION_INDICATORS);
  const arrestMentioned = anyMatch(text, ARREST_INDICATORS);

  // SAR relevance — critical or high severity crimes + sanctions/conviction
  const sarRelevant =
    crimes.some((c) => c.severity === 'critical' || c.severity === 'high') &&
    (sanctionsMentioned || convictionMentioned);

  const partial: Partial<NLPExtractionResult> = {
    crimes, penalties, dates, jurisdictions,
    sanctionsMentioned, convictionMentioned, arrestMentioned, sarRelevant,
  };

  return {
    sourceText: text.slice(0, 2000), // truncate for storage
    wordCount: words.length,
    persons: [],      // person NER requires ML — placeholder for integration
    entities: [],     // entity NER requires ML — placeholder for integration
    crimes,
    penalties,
    dates,
    jurisdictions: [...new Map(jurisdictions.map((j) => [j.code, j])).values()],
    sanctionsMentioned,
    convictionMentioned,
    arrestMentioned,
    sarRelevant,
    confidenceScore: computeConfidence(partial),
    extractedAt: new Date().toISOString(),
  };
}

// ── Batch extraction ──────────────────────────────────────────────────────────

export function extractNLPBatch(
  articles: Array<{ id: string; title: string; content: string }>,
): Array<{ id: string; extraction: NLPExtractionResult }> {
  return articles.map((a) => ({
    id: a.id,
    extraction: extractNLP(`${a.title} ${a.content}`),
  }));
}
