// Interpol notices adapter — Red, Blue and Green.
//
// Red:   wanted persons (criminal arrest warrants)
// Blue:  persons of interest (information gathering, not arrest)
// Green: persons with criminal history / warning notices
//
// All three use the same Interpol public API (no key required):
//   https://ws-public.interpol.int/notices/v1/{red|blue|green}
//
// Override URLs via FEED_INTERPOL / FEED_INTERPOL_BLUE / FEED_INTERPOL_GREEN.

import { type SourceAdapter, type NormalisedEntity, mkListing } from '../types.js';
import { sha256Hex, BROWSER_UA, ingestionDispatcher } from '../fetch-util.js';

const SOURCE_URL = process.env['FEED_INTERPOL']
  ?? 'https://ws-public.interpol.int/notices/v1/red?resultPerPage=200&page=1';
const SOURCE_URL_BLUE = process.env['FEED_INTERPOL_BLUE']
  ?? 'https://ws-public.interpol.int/notices/v1/blue?resultPerPage=200&page=1';
const SOURCE_URL_GREEN = process.env['FEED_INTERPOL_GREEN']
  ?? 'https://ws-public.interpol.int/notices/v1/green?resultPerPage=200&page=1';
const FETCH_TIMEOUT_MS = 20_000;
const MAX_PAGES = 50; // cap at 10 000 notices per ingestion run

interface InterpolNotice {
  entity_id: string;
  name?: string;
  forename?: string;
  date_of_birth?: string;
  nationality?: string;
  sex_id?: string;
  country_of_birth_id?: string;
  charges_description?: string;
  arrest_warrants?: Array<{ issuing_country_id?: string; charge?: string }>;
}

interface InterpolPage {
  total?: number;
  query?: Record<string, unknown>;
  _embedded?: { notices?: InterpolNotice[] };
  _links?: { next?: { href?: string } };
}

async function fetchPage(url: string): Promise<InterpolPage | null> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'Accept': 'application/json', 'User-Agent': BROWSER_UA },
      ...(ingestionDispatcher() ? { dispatcher: ingestionDispatcher() } : {}),
    } as RequestInit);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json() as InterpolPage;
  } finally {
    clearTimeout(tid);
  }
}

function noticeToEntity(notice: InterpolNotice): NormalisedEntity {
  const fullName = [notice.forename, notice.name].filter(Boolean).join(' ').trim()
    || `INTERPOL-${notice.entity_id}`;
  const aliases: string[] = [];
  if (notice.forename && notice.name) aliases.push(notice.name);
  if (notice.forename) aliases.push(notice.forename);

  const charges = notice.arrest_warrants
    ? notice.arrest_warrants.map((w) => w.charge ?? w.issuing_country_id ?? '').filter(Boolean)
    : (notice.charges_description ? [notice.charges_description] : []);

  const id = `interpol_red:${notice.entity_id}`;
  return {
    id,
    name: fullName,
    aliases: [...new Set(aliases)],
    type: 'individual',
    nationalities: notice.nationality ? [notice.nationality] : [],
    jurisdictions: notice.country_of_birth_id ? [notice.country_of_birth_id] : [],
    ...(notice.date_of_birth !== undefined ? { dateOfBirth: notice.date_of_birth } : {}),
    identifiers: { interpol_entity_id: notice.entity_id },
    addresses: [],
    listings: [mkListing('interpol_red', {
      program: 'RED_NOTICE',
      reference: notice.entity_id,
      reason: charges.join('; ') || undefined,
    })],
    source: 'interpol_red',
    fetchedAt: Date.now(),
  };
}

async function fetchAllNotices(
  startUrl: string,
  sourceId: string,
  program: string,
): Promise<{ entities: NormalisedEntity[]; rawChecksum: string }> {
  const entities: NormalisedEntity[] = [];
  let nextUrl: string | undefined = startUrl;
  let pages = 0;

  while (nextUrl && pages < MAX_PAGES) {
    pages++;
    let page: InterpolPage | null = null;
    try {
      page = await fetchPage(nextUrl);
    } catch {
      break;
    }
    if (!page) break;

    for (const notice of page._embedded?.notices ?? []) {
      try {
        const e = noticeToEntity(notice);
        // Override id/source/listing for non-red types.
        if (sourceId !== 'interpol_red') {
          e.id = `${sourceId}:${notice.entity_id}`;
          e.source = sourceId;
          e.listings = [mkListing(sourceId, {
            program,
            reference: notice.entity_id,
            reason: e.listings[0]?.reason,
          })];
        }
        entities.push(e);
      } catch {
        // skip malformed notices
      }
    }

    nextUrl = page._links?.next?.href ?? undefined;
  }

  const rawChecksum = await sha256Hex(entities.map((e) => e.id).join(','));
  return { entities, rawChecksum };
}

export const interpolRedAdapter: SourceAdapter = {
  id: 'interpol_red',
  displayName: 'Interpol Red Notices',
  sourceUrl: SOURCE_URL,
  isEnabled: () => true,
  fetch: () => fetchAllNotices(SOURCE_URL, 'interpol_red', 'RED_NOTICE'),
};

export const interpolBlueAdapter: SourceAdapter = {
  id: 'interpol_blue',
  displayName: 'Interpol Blue Notices',
  sourceUrl: SOURCE_URL_BLUE,
  isEnabled: () => true,
  fetch: () => fetchAllNotices(SOURCE_URL_BLUE, 'interpol_blue', 'BLUE_NOTICE'),
};

export const interpolGreenAdapter: SourceAdapter = {
  id: 'interpol_green',
  displayName: 'Interpol Green Notices',
  sourceUrl: SOURCE_URL_GREEN,
  isEnabled: () => true,
  fetch: () => fetchAllNotices(SOURCE_URL_GREEN, 'interpol_green', 'GREEN_NOTICE'),
};
