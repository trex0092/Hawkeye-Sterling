// Hawkeye Sterling — advisor tools (regulatory anchor library + sanctions
// programs). Deterministic, in-process retrieval that the MLRO Advisor
// pipeline consults BEFORE the LLM call, so the model is given the actual
// primary-source citations it should be quoting rather than relying on
// training-data recall (which trips P8: training-data-as-current-source).
//
// Why deterministic and not Anthropic Tool Use? Three reasons:
//   1. Latency. A tool-use loop adds round-trips; we already operate inside a
//      55-95 s budget against a Netlify function timeout.
//   2. Determinism. The unit-tested score-and-cite pipeline must produce
//      identical output for identical input. A model deciding when to call a
//      tool breaks that property.
//   3. Auditability. Every anchor injected into the prompt is logged in the
//      reasoning trail with its source — an MLRO can replay the exact set of
//      citations that the model saw.
//
// Tool 1 — ANCHOR_LIBRARY: a curated keyword → citation map covering the
// regulatory questions the Q&A tab actually receives (PEP, EDD, CDD, STR,
// sanctions, UBO, VASP, gold/DPMS, tipping-off, record retention, …).
//
// Tool 2 — SANCTIONS_PROGRAMS: metadata on every sanctions regime mentioned
// in REGULATORY_ANCHORS — full name, scope, owning body, primary list URL.
//
// Both are exported as plain data so future Anthropic Tool Use wiring can
// register them as `input_schema` tools without re-curating the corpus.

export interface RegulatoryAnchor {
  /** Canonical short citation, e.g. "FDL 20/2018 Art.16(2)". */
  citation: string;
  /** One-sentence description of what the anchor governs. */
  topic: string;
  /** Jurisdiction tag — UAE, EU, UK, US, FATF/Global. */
  jurisdiction: string;
}

export interface AnchorEntry {
  /** Lowercase keywords / phrases that trigger this anchor cluster. */
  keywords: string[];
  /** The anchors to surface when any keyword matches. Order = relevance. */
  anchors: RegulatoryAnchor[];
}

// Curated knowledge base. Every citation here was manually verified against
// the primary instrument; updates require regulatory review.
export const ANCHOR_LIBRARY: AnchorEntry[] = [
  {
    keywords: ['pep', 'politically exposed', 'peps'],
    anchors: [
      { citation: 'FATF R.12 INR.12', topic: 'PEP CDD obligations + family/close associate scope', jurisdiction: 'FATF/Global' },
      { citation: 'EU 5AMLD Art.20-23', topic: 'PEP definition + EDD measures + 12-month declassification window', jurisdiction: 'EU' },
      { citation: 'FDL 20/2018 Art.16(1)(b)', topic: 'PEP enhanced due diligence — UAE statutory mandate', jurisdiction: 'UAE' },
      { citation: 'Cabinet Decision 10/2019 Art.15', topic: 'PEP EDD operational requirements + senior-management approval', jurisdiction: 'UAE' },
      { citation: 'MLR 2017 Reg.35', topic: 'UK domestic + foreign PEP CDD measures', jurisdiction: 'UK' },
    ],
  },
  {
    keywords: ['edd', 'enhanced due diligence', 'enhanced cdd'],
    anchors: [
      { citation: 'FATF R.10 INR.10(b)', topic: 'EDD trigger conditions and measures', jurisdiction: 'FATF/Global' },
      { citation: 'EU 5AMLD Art.18-18a', topic: 'High-risk-third-country EDD + PEP EDD', jurisdiction: 'EU' },
      { citation: 'FDL 20/2018 Art.16', topic: 'UAE EDD statutory requirements', jurisdiction: 'UAE' },
      { citation: 'Cabinet Decision 10/2019 Art.6', topic: 'UAE EDD operational measures', jurisdiction: 'UAE' },
    ],
  },
  {
    keywords: ['cdd', 'customer due diligence', 'kyc'],
    anchors: [
      { citation: 'FATF R.10', topic: 'CDD core obligations', jurisdiction: 'FATF/Global' },
      { citation: 'EU 4AMLD Art.13', topic: 'EU CDD identification + verification + ongoing monitoring', jurisdiction: 'EU' },
      { citation: 'FDL 20/2018 Art.15', topic: 'UAE CDD statutory mandate', jurisdiction: 'UAE' },
      { citation: 'Cabinet Decision 10/2019 Art.5', topic: 'UAE CDD operational requirements', jurisdiction: 'UAE' },
      { citation: 'MLR 2017 Reg.27-28', topic: 'UK CDD obligations + simplified CDD scope', jurisdiction: 'UK' },
    ],
  },
  {
    keywords: ['str', 'sar', 'suspicious transaction', 'suspicious activity'],
    anchors: [
      { citation: 'FATF R.20', topic: 'STR filing trigger and timing', jurisdiction: 'FATF/Global' },
      { citation: 'FDL 20/2018 Art.15(4)', topic: 'UAE STR filing obligation to FIU', jurisdiction: 'UAE' },
      { citation: 'FDL 20/2018 Art.26-27', topic: 'UAE STR filing deadlines + content requirements', jurisdiction: 'UAE' },
      { citation: 'BSA 31 USC §5318(g)', topic: 'US SAR filing under the Bank Secrecy Act', jurisdiction: 'US' },
      { citation: 'POCA 2002 s.330', topic: 'UK regulated-sector SAR obligation', jurisdiction: 'UK' },
    ],
  },
  {
    keywords: ['tipping-off', 'tipping off', 'disclosure'],
    anchors: [
      { citation: 'FDL 20/2018 Art.29', topic: 'UAE tipping-off prohibition', jurisdiction: 'UAE' },
      { citation: 'EU 4AMLD Art.39', topic: 'EU tipping-off prohibition', jurisdiction: 'EU' },
      { citation: 'POCA 2002 s.333A', topic: 'UK tipping-off offence', jurisdiction: 'UK' },
    ],
  },
  {
    keywords: ['ubo', 'beneficial owner', 'beneficial ownership'],
    anchors: [
      { citation: 'FATF R.24', topic: 'Beneficial-ownership transparency for legal persons', jurisdiction: 'FATF/Global' },
      { citation: 'FATF R.25', topic: 'Beneficial-ownership transparency for legal arrangements', jurisdiction: 'FATF/Global' },
      { citation: 'EU 5AMLD Art.30-31', topic: 'EU central UBO registers', jurisdiction: 'EU' },
      { citation: 'Cabinet Decision 58/2020', topic: 'UAE beneficial-ownership procedures regulation', jurisdiction: 'UAE' },
    ],
  },
  {
    keywords: ['sanctions', 'tfs', 'targeted financial sanctions', 'asset freeze'],
    anchors: [
      { citation: 'FATF R.6', topic: 'TFS related to terrorism + terrorist financing', jurisdiction: 'FATF/Global' },
      { citation: 'FATF R.7', topic: 'TFS related to proliferation financing', jurisdiction: 'FATF/Global' },
      { citation: 'UNSCR 1267', topic: 'Al-Qaida/ISIL sanctions regime', jurisdiction: 'FATF/Global' },
      { citation: 'UNSCR 1373', topic: 'Counter-terrorism sanctions regime', jurisdiction: 'FATF/Global' },
      { citation: 'Cabinet Decision 74/2020', topic: 'UAE TFS regulation — Local + UN consolidated lists', jurisdiction: 'UAE' },
      { citation: 'OFAC 31 CFR §501.603', topic: 'US OFAC blocked-property reporting', jurisdiction: 'US' },
      { citation: 'EU Regulation 2580/2001', topic: 'EU asset-freeze regime against terrorism', jurisdiction: 'EU' },
    ],
  },
  {
    keywords: ['vasp', 'virtual asset', 'crypto', 'cryptocurrency', 'travel rule'],
    anchors: [
      { citation: 'FATF R.15 INR.15', topic: 'VASP CDD + travel rule + licensing', jurisdiction: 'FATF/Global' },
      { citation: 'FATF R.16 INR.16', topic: 'Wire-transfer travel rule applied to VAs', jurisdiction: 'FATF/Global' },
      { citation: 'EU TFR 2023/1113', topic: 'EU Travel Rule for crypto-asset transfers', jurisdiction: 'EU' },
      { citation: 'UAE VARA Regulation 2023', topic: 'Dubai virtual-asset licensing categories', jurisdiction: 'UAE' },
    ],
  },
  {
    keywords: ['dpms', 'gold', 'precious metals', 'precious stones', 'jewellery'],
    anchors: [
      { citation: 'FATF R.22-23', topic: 'DNFBP CDD + STR obligations (incl. dealers in precious metals/stones)', jurisdiction: 'FATF/Global' },
      { citation: 'MoE Circular 08/2021', topic: 'UAE DPMS cash-transaction reporting threshold (AED 55,000)', jurisdiction: 'UAE' },
      { citation: 'FDL 20/2018 Art.4', topic: 'UAE DNFBP scope incl. dealers in precious metals/stones', jurisdiction: 'UAE' },
      { citation: 'OECD Due Diligence Guidance', topic: 'Responsible supply chain due diligence for gold', jurisdiction: 'FATF/Global' },
      { citation: 'LBMA Responsible Gold Guidance', topic: 'Industry-standard gold-supply-chain due diligence', jurisdiction: 'FATF/Global' },
    ],
  },
  {
    keywords: ['record', 'retention', 'recordkeeping', 'record-keeping'],
    anchors: [
      { citation: 'FATF R.11', topic: 'Five-year record-retention requirement', jurisdiction: 'FATF/Global' },
      { citation: 'FDL 20/2018 Art.16(3)', topic: 'UAE 5-year record retention (extended to 10y under FDL 10/2025)', jurisdiction: 'UAE' },
      { citation: 'EU 4AMLD Art.40', topic: 'EU 5-year retention (extendable to 10y)', jurisdiction: 'EU' },
    ],
  },
  {
    keywords: ['wire transfer', 'cross-border', 'correspondent banking'],
    anchors: [
      { citation: 'FATF R.13', topic: 'Correspondent banking due diligence', jurisdiction: 'FATF/Global' },
      { citation: 'FATF R.16 INR.16', topic: 'Originator + beneficiary information for wire transfers', jurisdiction: 'FATF/Global' },
    ],
  },
  {
    keywords: ['shell company', 'shell', 'front company'],
    anchors: [
      { citation: 'FATF R.24 INR.24', topic: 'Beneficial-ownership transparency to defeat shell-company misuse', jurisdiction: 'FATF/Global' },
    ],
  },
  {
    keywords: ['high-risk jurisdiction', 'fatf grey list', 'fatf black list', 'high risk third country'],
    anchors: [
      { citation: 'FATF Public Statement (latest)', topic: 'High-risk + jurisdictions under increased monitoring', jurisdiction: 'FATF/Global' },
      { citation: 'EU Regulation 2016/1675', topic: 'EU high-risk-third-country list (delegated regulation)', jurisdiction: 'EU' },
    ],
  },
  {
    keywords: ['risk-based', 'risk based approach', 'rba'],
    anchors: [
      { citation: 'FATF R.1 INR.1', topic: 'Risk-based approach — national + supervisory + FI level', jurisdiction: 'FATF/Global' },
    ],
  },
  {
    keywords: ['ofac 50%', '50 percent rule', 'ownership rule'],
    anchors: [
      { citation: 'OFAC 50 Percent Rule (2014 guidance)', topic: 'Aggregated ownership ≥ 50% → blocked by operation of law', jurisdiction: 'US' },
    ],
  },
];

export interface SanctionsProgramMeta {
  id: string;
  name: string;
  jurisdiction: string;
  body: string;
  primaryListUrl: string;
  scope: string;
}

export const SANCTIONS_PROGRAMS: SanctionsProgramMeta[] = [
  { id: 'OFAC-SDN', name: 'OFAC Specially Designated Nationals', jurisdiction: 'US', body: 'US Treasury OFAC', primaryListUrl: 'https://www.treasury.gov/ofac/downloads/sdn.xml', scope: 'Comprehensive US sanctions targets — natural persons, entities, vessels, aircraft' },
  { id: 'OFAC-Non-SDN', name: 'OFAC Consolidated Non-SDN', jurisdiction: 'US', body: 'US Treasury OFAC', primaryListUrl: 'https://www.treasury.gov/ofac/downloads/consolidated/cons_prim.xml', scope: 'Sectoral, FSE, and other non-SDN US lists' },
  { id: 'UN-Consolidated', name: 'UN Security Council Consolidated List', jurisdiction: 'UN', body: 'UN Security Council', primaryListUrl: 'https://scsanctions.un.org/resources/xml/en/consolidated.xml', scope: 'All UNSCR-mandated sanctions targets — binding on all member states' },
  { id: 'EU-Consolidated', name: 'EU Financial Sanctions File', jurisdiction: 'EU', body: 'European Commission', primaryListUrl: 'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content', scope: 'EU-wide consolidated list combining UN + autonomous EU designations' },
  { id: 'UK-OFSI', name: 'UK OFSI Consolidated List', jurisdiction: 'UK', body: 'HM Treasury OFSI', primaryListUrl: 'https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.xml', scope: 'Persons subject to UK financial sanctions under all regimes' },
  { id: 'UAE-EOCN', name: 'UAE Executive Office of the Counter-Terrorism Network — Local List', jurisdiction: 'UAE', body: 'UAE Cabinet (EOCN)', primaryListUrl: 'https://www.uaeiec.gov.ae/en-us/un-page', scope: 'UAE Local Terrorism List under Cabinet Decision 74/2020' },
  { id: 'UAE-LTL', name: 'UAE Local Terrorism List', jurisdiction: 'UAE', body: 'UAE Cabinet', primaryListUrl: 'https://www.uaeiec.gov.ae/en-us/un-page', scope: 'Domestic-designations supplement to UN consolidated' },
];

/**
 * Match a free-text question against the anchor library and return all
 * relevant primary-source citations. Each anchor is returned at most once
 * even if multiple keywords match. Order: relevance-by-cluster, then within
 * a cluster the curator-defined order.
 */
export function selectAnchorsForQuestion(question: string): RegulatoryAnchor[] {
  const lower = question.toLowerCase();
  const seen = new Set<string>();
  const out: RegulatoryAnchor[] = [];
  for (const entry of ANCHOR_LIBRARY) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      for (const anchor of entry.anchors) {
        if (!seen.has(anchor.citation)) {
          seen.add(anchor.citation);
          out.push(anchor);
        }
      }
    }
  }
  return out;
}

/**
 * Format a set of anchors as a citation block to splice into a model prompt.
 * The model is told these are PRE-VERIFIED primary sources it MAY cite as
 * authoritative — and any other citation it produces must satisfy CITATION
 * ENFORCEMENT rule 1 against a primary instrument.
 */
export function buildAnchorPreamble(anchors: RegulatoryAnchor[]): string {
  if (anchors.length === 0) return '';
  const lines = anchors.map((a) => `  • ${a.citation}  [${a.jurisdiction}]  — ${a.topic}`);
  return [
    'PRE-VERIFIED PRIMARY-SOURCE ANCHORS (selected by deterministic retrieval against',
    'this question — these are authoritative; cite them verbatim where they govern the',
    'asserted fact; any OTHER citation you produce must satisfy CITATION ENFORCEMENT',
    'rule 1 against a primary instrument):',
    ...lines,
    '',
  ].join('\n');
}

/**
 * Anthropic Tool-Use schema definitions — exported for future direct
 * integration with the messages API. Each tool is pure-function and
 * deterministic; the executors are the same `selectAnchorsForQuestion` and
 * a sanctions-program lookup so calling them from the LLM yields identical
 * output to the prompt-side enrichment path.
 */
export const ADVISOR_TOOL_SCHEMAS = [
  {
    name: 'cite_regulatory_anchor',
    description:
      'Return pre-verified primary-source regulatory citations relevant to the question. ' +
      'Use this BEFORE asserting any AML/CFT/sanctions threshold or rule so you cite the ' +
      'actual instrument rather than relying on training data (which trips P8).',
    input_schema: {
      type: 'object' as const,
      properties: {
        question: {
          type: 'string',
          description: 'The MLRO question for which to retrieve anchor citations.',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'lookup_sanctions_program',
    description:
      'Return metadata for a named sanctions program (full name, owning body, primary list URL, scope). ' +
      'Use this when the question asks about specific lists like OFAC SDN, UN Consolidated, EU FSF.',
    input_schema: {
      type: 'object' as const,
      properties: {
        program_id: {
          type: 'string',
          description: 'Program identifier — one of OFAC-SDN, OFAC-Non-SDN, UN-Consolidated, EU-Consolidated, UK-OFSI, UAE-EOCN, UAE-LTL.',
        },
      },
      required: ['program_id'],
    },
  },
] as const;

export function executeToolCall(name: string, input: Record<string, unknown>): string {
  if (name === 'cite_regulatory_anchor') {
    const q = typeof input['question'] === 'string' ? input['question'] : '';
    const anchors = selectAnchorsForQuestion(q);
    return JSON.stringify({ anchors }, null, 2);
  }
  if (name === 'lookup_sanctions_program') {
    const id = typeof input['program_id'] === 'string' ? input['program_id'] : '';
    const program = SANCTIONS_PROGRAMS.find((p) => p.id === id);
    return JSON.stringify({ program: program ?? null }, null, 2);
  }
  return JSON.stringify({ error: `unknown tool: ${name}` });
}
