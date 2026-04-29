// Hawkeye Sterling — Layer 6.1: DPMS typology classifier.
//
// Sector-specific patterns the Advisor must consider on every
// transactional query. Each typology has its own indicator set,
// suggested anchors (registry sourceIds), and a mapping to the
// EWRA risk register so the Advisor's red-flags section can cite
// the right doctrine and the audit log can filter by typology.

export type DpmsTypologyId =
  | 'scrap_to_kilobar'
  | 'refining_margin_abuse'
  | 'weight_discrepancy_laundering'
  | 'free_zone_re_export_structuring'
  | 'hawala_linked_cash_out'
  | 'dore_misdeclaration'
  | 'cahra_origin_laundering'
  | 'sub_threshold_structuring';

export interface DpmsTypology {
  id: DpmsTypologyId;
  name: string;
  shortDescription: string;
  /** Indicator phrases / regex hints. Surfacing any of these in the
   *  question raises this typology to the top of the consideration
   *  list. */
  indicators: RegExp[];
  /** Registry sourceIds the Advisor should anchor to when reasoning
   *  about this typology. */
  anchorSources: string[];
  /** EWRA risk-register cluster id — empty string means the typology
   *  has not yet been mapped (operator action item). */
  ewraCluster: string;
}

export const DPMS_TYPOLOGIES: DpmsTypology[] = [
  {
    id: 'scrap_to_kilobar',
    name: 'Scrap-jewellery to kilo-bar conversion',
    shortDescription:
      'Cash-bought scrap jewellery refined into kilo-bars with weak provenance trail; ' +
      'often used to integrate cash proceeds via the refining pipeline.',
    indicators: [
      /\bscrap\s+(?:gold|jewell?ery)\b/i,
      /\bkilo[- ]?bar\s+(?:from|conversion)\b/i,
      /\bcash\s+(?:purchase|payment).*?(?:scrap|jewell?ery)\b/i,
    ],
    anchorSources: ['LBMA-RGG-v9', 'UAE-FIU-DNFBP-CIRCULAR-DPMS', 'FATF-R22'],
    ewraCluster: 'dpms_refining_pipeline',
  },
  {
    id: 'refining_margin_abuse',
    name: 'Refining-margin abuse',
    shortDescription:
      'Inflated or deflated refining fees used to move value off-book; reconciliation ' +
      'gaps between input weight and output assay can mask cash-in / cash-out flows.',
    indicators: [
      /\brefining\s+(?:margin|fee|commission)\b/i,
      /\bassay\s+discrepan/i,
      /\binput\s+weight.*output\s+(?:weight|assay)/i,
    ],
    anchorSources: ['LBMA-RGG-v9', 'WOLFSBERG-DPMS', 'FATF-R22'],
    ewraCluster: 'dpms_refining_pipeline',
  },
  {
    id: 'weight_discrepancy_laundering',
    name: 'Weight-discrepancy laundering',
    shortDescription:
      'Manipulated weight tickets / declarations used to under-report or over-report ' +
      'consignments crossing customs or refinery weighbridges.',
    indicators: [
      /\bweight\s+(?:discrepancy|mismatch|adjustment)\b/i,
      /\bweighbridge\b/i,
      /\bcustoms\s+declar(?:ation)?\b.*\b(?:weight|gold)\b/i,
    ],
    anchorSources: ['UAE-FIU-DNFBP-CIRCULAR-DPMS', 'FATF-R32', 'OECD-DDG-MINERALS'],
    ewraCluster: 'dpms_logistics',
  },
  {
    id: 'free_zone_re_export_structuring',
    name: 'Free-zone re-export structuring',
    shortDescription:
      'Repeated re-export cycles via UAE free zones to obscure origin and break chain ' +
      'of custody; particularly when combined with shell-company counterparties.',
    indicators: [
      /\bfree\s+zone\b/i,
      /\bre[- ]?export\b/i,
      /\b(?:DMCC|JAFZA|RAK\s*Free\s*Zone|DAFZA)\b/i,
    ],
    anchorSources: ['CD-134-2025', 'OECD-DDG-MINERALS', 'FATF-R22'],
    ewraCluster: 'dpms_logistics',
  },
  {
    id: 'hawala_linked_cash_out',
    name: 'Hawala-linked cash-out',
    shortDescription:
      'Gold purchase as hawala settlement leg — cash-funded purchase whose value moves ' +
      'cross-border via informal value-transfer arrangements rather than banking rails.',
    indicators: [
      /\bhawala\b/i,
      /\binformal\s+(?:value\s+)?transfer\b/i,
      /\bcash\s+settlement\b.*\bgold\b/i,
    ],
    anchorSources: ['FATF-R14', 'UAE-FIU-GOAML-MANUAL', 'CD-134-2025'],
    ewraCluster: 'dpms_funding',
  },
  {
    id: 'dore_misdeclaration',
    name: 'Doré-bar mis-declaration',
    shortDescription:
      'Doré (semi-refined gold) declared with mis-stated origin or fineness to defeat ' +
      'CAHRA / responsible-sourcing checks at the refinery gate.',
    indicators: [
      // \b doesn't work after é (non-ASCII); use lookarounds instead.
      /(?:^|[^a-z])dor[eé](?=[^a-z]|$)/i,
      /\bsemi[- ]?refined\b/i,
      /\bfineness\s+(?:declared|mis|under|over)/i,
    ],
    anchorSources: ['LBMA-RGG-v9', 'OECD-DDG-MINERALS', 'KIMBERLEY-PROCESS-CS'],
    ewraCluster: 'dpms_origin',
  },
  {
    id: 'cahra_origin_laundering',
    name: 'CAHRA origin laundering through transit hubs',
    shortDescription:
      'Conflict-affected / high-risk origin (DRC, Mali, Sudan, Myanmar, etc.) routed ' +
      'through a transit hub so the import declaration shows the hub rather than the ' +
      'originating jurisdiction.',
    indicators: [
      /\bCAHRA\b/i,
      /\b(?:DRC|Congo|Mali|Sudan|Myanmar|Burma|Yemen|Syria)\b/i,
      /\btransit\s+(?:hub|country)\b/i,
      /\borigin\s+(?:laundering|disguise|misrepresentation)\b/i,
    ],
    anchorSources: ['OECD-DDG-MINERALS', 'LBMA-RGG-v9', 'UAE-FIU-DNFBP-CIRCULAR-DPMS'],
    ewraCluster: 'dpms_origin',
  },
  {
    id: 'sub_threshold_structuring',
    name: 'Sub-threshold structuring across consecutive days',
    shortDescription:
      'Cash transactions deliberately broken into amounts just below the reporting ' +
      'threshold and spread across consecutive days / branches to defeat aggregate ' +
      'reporting triggers.',
    indicators: [
      /\bstructur(?:e|ing)\b/i,
      /\bjust\s+below\s+(?:the\s+)?threshold\b/i,
      /\bsplit\s+(?:transaction|deposit|payment)\b/i,
      /\bsmurfing\b/i,
    ],
    anchorSources: ['FATF-R20', 'FDL-10-2025', 'CD-134-2025'],
    ewraCluster: 'dpms_funding',
  },
];

export interface TypologyHit {
  typology: DpmsTypology;
  /** How many indicators matched. */
  matchCount: number;
  /** The first matched indicator's verbatim text (for the audit log). */
  excerpt: string;
}

/** Score a question against the DPMS typology library. Returns hits
 *  in descending matchCount order so the Advisor knows which
 *  typologies dominate. */
export function classifyDpmsTypologies(question: string): TypologyHit[] {
  const hits: TypologyHit[] = [];
  for (const t of DPMS_TYPOLOGIES) {
    let count = 0;
    let excerpt = '';
    for (const rx of t.indicators) {
      const m = question.match(rx);
      if (m) {
        count++;
        if (!excerpt) excerpt = m[0];
      }
    }
    if (count > 0) hits.push({ typology: t, matchCount: count, excerpt });
  }
  return hits.sort((a, b) => b.matchCount - a.matchCount);
}
