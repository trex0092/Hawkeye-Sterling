// FATF Public Statements adapter — black-list (Call-For-Action) and grey-list
// (Jurisdictions Under Increased Monitoring).
//
// FATF does not designate persons; it designates *jurisdictions*. Each
// jurisdiction is emitted as a NormalisedEntity of type 'entity' with the
// country name, ISO-2 code in identifiers, and the FATF status as the
// listing.program. Entities downstream (matcher, brain) treat a FATF
// hit as a country-risk anchor rather than a person/legal-entity match.
//
// Source pages:
//   - https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions/Call-for-action.html
//   - https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions/Increased-monitoring.html
//
// HTML structure changes frequently, so this adapter performs:
//   1. Best-effort scrape of the live pages (regex-only — no DOM parser).
//   2. Falls back to a curated static list (sourceVersion = `static-${date}`)
//      when scrape yields nothing — guarantees the cron is never empty.

import { type SourceAdapter, type NormalisedEntity, mkListing } from '../types.js';
import { fetchText, sha256Hex } from '../fetch-util.js';

const CALL_FOR_ACTION_URL =
  'https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions/Call-for-action.html';
const INCREASED_MONITORING_URL =
  'https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions/Increased-monitoring.html';

// Curated fallback. Update when FATF publishes a new public statement
// (typically February / June / October each year). This list reflects
// FATF Public Statement of October 2024.
const FALLBACK_BLACK: ReadonlyArray<{ name: string; iso2: string }> = [
  { name: 'Democratic People’s Republic of Korea', iso2: 'KP' },
  { name: 'Iran', iso2: 'IR' },
  { name: 'Myanmar', iso2: 'MM' },
];

const FALLBACK_GREY: ReadonlyArray<{ name: string; iso2: string }> = [
  { name: 'Algeria', iso2: 'DZ' },
  { name: 'Angola', iso2: 'AO' },
  { name: 'Bulgaria', iso2: 'BG' },
  { name: 'Burkina Faso', iso2: 'BF' },
  { name: 'Cameroon', iso2: 'CM' },
  { name: 'Côte d’Ivoire', iso2: 'CI' },
  { name: 'Croatia', iso2: 'HR' },
  { name: 'Democratic Republic of the Congo', iso2: 'CD' },
  { name: 'Haiti', iso2: 'HT' },
  { name: 'Kenya', iso2: 'KE' },
  { name: 'Lebanon', iso2: 'LB' },
  { name: 'Mali', iso2: 'ML' },
  { name: 'Monaco', iso2: 'MC' },
  { name: 'Mozambique', iso2: 'MZ' },
  { name: 'Namibia', iso2: 'NA' },
  { name: 'Nigeria', iso2: 'NG' },
  { name: 'Philippines', iso2: 'PH' },
  { name: 'South Africa', iso2: 'ZA' },
  { name: 'South Sudan', iso2: 'SS' },
  { name: 'Syria', iso2: 'SY' },
  { name: 'Tanzania', iso2: 'TZ' },
  { name: 'Venezuela', iso2: 'VE' },
  { name: 'Vietnam', iso2: 'VN' },
  { name: 'Yemen', iso2: 'YE' },
];

function buildLookup(list: ReadonlyArray<{ name: string; iso2: string }>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const c of list) m[c.name.toLowerCase()] = c.iso2;
  return m;
}

const BLACK_LOOKUP: Record<string, string> = buildLookup(FALLBACK_BLACK);
const GREY_LOOKUP: Record<string, string>  = buildLookup(FALLBACK_GREY);

interface ScrapedJurisdiction { name: string; iso2: string }

function scrapeJurisdictions(html: string, lookup: Record<string, string>): ScrapedJurisdiction[] {
  // Heuristic 1: <h2>/<h3>/<strong>Country</strong> markers used on FATF pages.
  const headings = [...html.matchAll(/<(?:h2|h3|strong)[^>]*>\s*([A-Z][A-Za-zÀ-ſ \-’']{2,60})\s*<\/(?:h2|h3|strong)>/g)]
    .map((m) => m[1]!.replace(/\s+/g, ' ').trim());

  // Heuristic 2: bullet list items often contain just the country name.
  const bullets = [...html.matchAll(/<li[^>]*>\s*([A-Z][A-Za-zÀ-ſ \-’']{2,60})\s*<\/li>/g)]
    .map((m) => m[1]!.replace(/\s+/g, ' ').trim());

  const seen = new Set<string>();
  const out: ScrapedJurisdiction[] = [];
  for (const candidate of [...headings, ...bullets]) {
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    const iso2 = lookup[key];
    // Only accept candidates that match a country in the *expected* list
    // for this page (CFA → black, IM → grey). This filters arbitrary
    // headings like "Background" *and* prevents grey-list names mentioned
    // in CFA prose from being mis-classified as black-list designations.
    if (!iso2) continue;
    seen.add(key);
    out.push({ name: candidate, iso2 });
  }
  return out;
}

async function safeScrape(url: string, lookup: Record<string, string>): Promise<{ html: string; scraped: ScrapedJurisdiction[] }> {
  try {
    const html = await fetchText(url, { accept: 'text/html', timeoutMs: 30_000, retries: 1 });
    return { html, scraped: scrapeJurisdictions(html, lookup) };
  } catch {
    return { html: '', scraped: [] };
  }
}

function toEntity(
  jur: { name: string; iso2: string },
  program: 'FATF Call-for-Action' | 'FATF Increased Monitoring',
  authorityUrl: string,
  fetchedAt: number,
): NormalisedEntity {
  return {
    id: `fatf:${program === 'FATF Call-for-Action' ? 'cfa' : 'im'}:${jur.iso2}`,
    name: jur.name,
    aliases: [],
    type: 'entity',
    nationalities: [],
    jurisdictions: [jur.iso2],
    identifiers: { iso2: jur.iso2 },
    addresses: [],
    listings: [mkListing('fatf', {
      program,
      reference: jur.iso2,
      authorityUrl,
    })],
    source: 'fatf',
    fetchedAt,
    notes: program === 'FATF Call-for-Action'
      ? 'FATF black-list jurisdiction — counter-measures or enhanced due diligence required.'
      : 'FATF grey-list jurisdiction — enhanced due diligence proportionate to identified risks.',
  };
}

export const fatfAdapter: SourceAdapter = {
  id: 'fatf',
  displayName: 'FATF Public Statement (Black + Grey List)',
  sourceUrl: CALL_FOR_ACTION_URL,
  async fetch() {
    const fetchedAt = Date.now();
    const [cfa, im] = await Promise.all([
      safeScrape(CALL_FOR_ACTION_URL, BLACK_LOOKUP),
      safeScrape(INCREASED_MONITORING_URL, GREY_LOOKUP),
    ]);

    const black = cfa.scraped.length > 0
      ? cfa.scraped.map((s) => ({ name: s.name, iso2: s.iso2 }))
      : FALLBACK_BLACK.map((c) => ({ ...c }));
    const grey = im.scraped.length > 0
      ? im.scraped.map((s) => ({ name: s.name, iso2: s.iso2 }))
      : FALLBACK_GREY.map((c) => ({ ...c }));

    const entities: NormalisedEntity[] = [
      ...black.map((c) => toEntity(c, 'FATF Call-for-Action', CALL_FOR_ACTION_URL, fetchedAt)),
      ...grey.map((c) => toEntity(c, 'FATF Increased Monitoring', INCREASED_MONITORING_URL, fetchedAt)),
    ];

    const sourceVersion = cfa.scraped.length > 0 || im.scraped.length > 0
      ? `live-${new Date(fetchedAt).toISOString().slice(0, 10)}`
      : 'static-2024-10';
    const rawChecksum = await sha256Hex(cfa.html + '\n---\n' + im.html + `\nversion=${sourceVersion}`);

    return { entities, rawChecksum, sourceVersion };
  },
};
