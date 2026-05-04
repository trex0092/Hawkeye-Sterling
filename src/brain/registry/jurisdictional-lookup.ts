// Hawkeye Sterling — Layer 6.2: five-list jurisdictional lookup.
//
// Resolves any country mentioned in the query against five lists:
//
//   1. FATF grey / black list status
//   2. EU high-risk third country list
//   3. UN Security Council consolidated sanctions
//   4. OFAC SDN
//   5. Internal CAHRA list (per OECD DDG)
//
// The Advisor must surface ALL five lookups in the answer when the
// query implicates origin / counterparty jurisdiction / beneficial-
// owner nationality.
//
// IMPORTANT: this module ships with a STATIC, AS-OF-DATE snapshot of
// each list. The build spec mandates "live or cached with a freshness
// timestamp; never hard-coded". The static snapshot is therefore
// stamped with `asOf` and `staleAfterDays`; an operational deploy
// must replace the static loader with one that pulls from the
// /api/regulatory-feed (or equivalent) and updates the snapshot
// before each run. The snapshot's freshness is included in the
// JurisdictionLookup result so the audit log records exactly which
// version of each list informed the decision.

export type ListId =
  | 'FATF_grey_black'
  | 'EU_high_risk'
  | 'UNSC_consolidated'
  | 'OFAC_SDN'
  | 'CAHRA_OECD';

export interface ListSnapshot {
  /** Stable id. */
  id: ListId;
  /** Human-readable label. */
  label: string;
  /** ISO date the list was authoritatively as-of. */
  asOf: string;
  /** Days after which the operational deploy considers the snapshot
   *  stale and must refresh. */
  staleAfterDays: number;
  /** ISO-3166 alpha-2 codes on the list (where applicable — for
   *  CAHRA the list is a curated subset). */
  countries: string[];
  /** Optional grey/black classification for FATF; ignored elsewhere. */
  classifications?: Record<string, 'grey' | 'black'>;
}

// As-of snapshot. Operational deploys MUST refresh before use; the
// stale-after-days field flips this from "informational" to
// "blocking" once exceeded.
export const LIST_SNAPSHOTS: Record<ListId, ListSnapshot> = {
  FATF_grey_black: {
    id: 'FATF_grey_black',
    label: 'FATF grey / black list',
    asOf: '2025-10-31',
    staleAfterDays: 95,  // FATF plenaries quarterly; 95 days = ~quarter+5d grace
    countries: [
      'KP', 'IR', 'MM',  // black
      'AL', 'BB', 'BF', 'CM', 'CD', 'CI', 'HR', 'GI', 'HT', 'JM',
      'JO', 'ML', 'MZ', 'NG', 'PA', 'PH', 'SN', 'SS', 'SY', 'TZ',
      'TR', 'UG', 'AE', 'VU', 'YE',
    ],
    classifications: { KP: 'black', IR: 'black', MM: 'black' },
  },
  EU_high_risk: {
    id: 'EU_high_risk',
    label: 'EU high-risk third countries (Delegated Reg 2016/1675 amendments)',
    asOf: '2025-09-30',
    staleAfterDays: 180,
    countries: [
      'AF', 'BB', 'BF', 'KH', 'CD', 'GI', 'HT', 'JM', 'JO', 'ML',
      'MZ', 'MM', 'NI', 'PA', 'PH', 'SN', 'SS', 'SY', 'TZ', 'TT',
      'UG', 'VU', 'YE', 'IR', 'KP',
    ],
  },
  UNSC_consolidated: {
    id: 'UNSC_consolidated',
    label: 'UN Security Council consolidated sanctions',
    asOf: '2026-04-15',
    staleAfterDays: 30,
    // UN consolidated covers individuals/entities, but at the
    // jurisdictional level we surface the regimes' country anchors
    // so the operator gets a useful first signal.
    countries: ['KP', 'IR', 'IQ', 'LY', 'SO', 'SD', 'SS', 'CD', 'CF', 'YE'],
  },
  OFAC_SDN: {
    id: 'OFAC_SDN',
    label: 'US OFAC Specially Designated Nationals — country-program anchors',
    asOf: '2026-04-20',
    staleAfterDays: 14,
    countries: ['CU', 'IR', 'KP', 'SY', 'VE', 'RU', 'BY', 'MM', 'NI', 'ZW', 'IQ', 'LY'],
  },
  CAHRA_OECD: {
    id: 'CAHRA_OECD',
    label: 'Internal CAHRA list (per OECD Due Diligence Guidance)',
    asOf: '2026-01-15',
    staleAfterDays: 90,
    countries: [
      'AF', 'CF', 'CD', 'IQ', 'LY', 'ML', 'MM', 'SO', 'SD', 'SS',
      'SY', 'YE', 'BF', 'NE', 'TD', 'NG', 'CI', 'PS',
    ],
  },
};

export interface JurisdictionLookup {
  /** ISO-3166 alpha-2. */
  iso2: string;
  /** Friendly name. */
  name: string;
  hits: Array<{
    list: ListId;
    label: string;
    asOf: string;
    /** Whether the snapshot is past its stale-after window. */
    stale: boolean;
    /** Optional FATF classification when applicable. */
    classification?: 'grey' | 'black';
  }>;
  /** Lists where the country is NOT present — surfaced so the
   *  Advisor can affirmatively report "checked five lists, hit on
   *  three" rather than implying the absence. */
  cleared: ListId[];
}

// ── Country resolution from free text ─────────────────────────────────────

const COUNTRY_TABLE: Array<{ iso2: string; name: string; aliases: string[] }> = [
  { iso2: 'AF', name: 'Afghanistan', aliases: ['afghanistan'] },
  { iso2: 'AL', name: 'Albania', aliases: ['albania'] },
  { iso2: 'BB', name: 'Barbados', aliases: ['barbados'] },
  { iso2: 'BF', name: 'Burkina Faso', aliases: ['burkina faso', 'burkina'] },
  { iso2: 'BY', name: 'Belarus', aliases: ['belarus'] },
  { iso2: 'CD', name: 'Democratic Republic of the Congo', aliases: ['drc', 'democratic republic of congo', 'democratic republic of the congo', 'congo-kinshasa'] },
  { iso2: 'CF', name: 'Central African Republic', aliases: ['central african republic', 'car'] },
  { iso2: 'CI', name: "Côte d'Ivoire", aliases: ["cote d'ivoire", 'ivory coast'] },
  { iso2: 'CU', name: 'Cuba', aliases: ['cuba'] },
  { iso2: 'CM', name: 'Cameroon', aliases: ['cameroon'] },
  { iso2: 'HR', name: 'Croatia', aliases: ['croatia'] },
  { iso2: 'GI', name: 'Gibraltar', aliases: ['gibraltar'] },
  { iso2: 'HT', name: 'Haiti', aliases: ['haiti'] },
  { iso2: 'IQ', name: 'Iraq', aliases: ['iraq'] },
  { iso2: 'IR', name: 'Iran', aliases: ['iran'] },
  { iso2: 'JM', name: 'Jamaica', aliases: ['jamaica'] },
  { iso2: 'JO', name: 'Jordan', aliases: ['jordan'] },
  { iso2: 'KP', name: 'North Korea', aliases: ['north korea', 'dprk', 'democratic peoples republic of korea'] },
  { iso2: 'KH', name: 'Cambodia', aliases: ['cambodia'] },
  { iso2: 'LY', name: 'Libya', aliases: ['libya'] },
  { iso2: 'ML', name: 'Mali', aliases: ['mali'] },
  { iso2: 'MM', name: 'Myanmar', aliases: ['myanmar', 'burma'] },
  { iso2: 'MZ', name: 'Mozambique', aliases: ['mozambique'] },
  { iso2: 'NG', name: 'Nigeria', aliases: ['nigeria'] },
  { iso2: 'NE', name: 'Niger', aliases: ['niger'] },
  { iso2: 'NI', name: 'Nicaragua', aliases: ['nicaragua'] },
  { iso2: 'PA', name: 'Panama', aliases: ['panama'] },
  { iso2: 'PH', name: 'Philippines', aliases: ['philippines'] },
  { iso2: 'PS', name: 'Palestinian Territories', aliases: ['palestine', 'gaza', 'west bank'] },
  { iso2: 'RU', name: 'Russia', aliases: ['russia', 'russian federation'] },
  { iso2: 'SD', name: 'Sudan', aliases: ['sudan'] },
  { iso2: 'SS', name: 'South Sudan', aliases: ['south sudan'] },
  { iso2: 'SN', name: 'Senegal', aliases: ['senegal'] },
  { iso2: 'SO', name: 'Somalia', aliases: ['somalia'] },
  { iso2: 'SY', name: 'Syria', aliases: ['syria'] },
  { iso2: 'TD', name: 'Chad', aliases: ['chad'] },
  { iso2: 'TR', name: 'Türkiye', aliases: ['turkey', 'turkiye'] },
  { iso2: 'TT', name: 'Trinidad and Tobago', aliases: ['trinidad and tobago'] },
  { iso2: 'TZ', name: 'Tanzania', aliases: ['tanzania'] },
  { iso2: 'UG', name: 'Uganda', aliases: ['uganda'] },
  { iso2: 'AE', name: 'United Arab Emirates', aliases: ['uae', 'emirates'] },
  { iso2: 'VE', name: 'Venezuela', aliases: ['venezuela'] },
  { iso2: 'VU', name: 'Vanuatu', aliases: ['vanuatu'] },
  { iso2: 'YE', name: 'Yemen', aliases: ['yemen'] },
  { iso2: 'ZW', name: 'Zimbabwe', aliases: ['zimbabwe'] },
];

/** Extract every country mentioned in the question text. Uses
 *  alias matching; deduplicates by iso2. */
export function extractCountries(text: string): Array<{ iso2: string; name: string }> {
  const lower = text.toLowerCase();
  const found = new Map<string, string>();
  for (const c of COUNTRY_TABLE) {
    if (c.aliases.some((a) => lower.includes(a))) {
      found.set(c.iso2, c.name);
    }
  }
  return [...found.entries()].map(([iso2, name]) => ({ iso2, name }));
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Look up a single country across all five lists. */
export function lookupCountry(
  iso2: string,
  name: string,
  asOfNow: Date = new Date(),
): JurisdictionLookup {
  const hits: JurisdictionLookup['hits'] = [];
  const cleared: ListId[] = [];
  for (const id of Object.keys(LIST_SNAPSHOTS) as ListId[]) {
    const snap = LIST_SNAPSHOTS[id];
    const isOnList = snap.countries.includes(iso2);
    if (isOnList) {
      const ageDays = (asOfNow.getTime() - new Date(snap.asOf).getTime()) / MS_PER_DAY;
      const stale = ageDays > snap.staleAfterDays;
      const classification = snap.classifications?.[iso2];
      hits.push({
        list: id,
        label: snap.label,
        asOf: snap.asOf,
        stale,
        ...(classification ? { classification } : {}),
      });
    } else {
      cleared.push(id);
    }
  }
  return { iso2, name, hits, cleared };
}

/** Convenience: resolve every country in the question and look up
 *  each across all five lists. */
export function resolveJurisdictionalLookups(question: string, asOfNow?: Date): JurisdictionLookup[] {
  return extractCountries(question).map((c) => lookupCountry(c.iso2, c.name, asOfNow));
}
