// Interpol Red Notices adapter — B1.
//
// Fetches active Red Notices from the Interpol public API.
// Endpoint: https://ws-public.interpol.int/notices/v1/red
//
// API is public and free. Returns paginated JSON with notice detail
// for each wanted person. No API key required.
//
// Override URL via FEED_INTERPOL (useful for staging / self-hosted mirror).

import { type SourceAdapter, type NormalisedEntity, mkListing } from '../types.js';
import { sha256Hex } from '../fetch-util.js';

const SOURCE_URL = process.env['FEED_INTERPOL']
  ?? 'https://ws-public.interpol.int/notices/v1/red?resultPerPage=200&page=1';
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
      headers: { 'Accept': 'application/json', 'User-Agent': 'Hawkeye-Sterling-AML/2.0' },
    });
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

export const interpolRedAdapter: SourceAdapter = {
  id: 'interpol_red',
  displayName: 'Interpol Red Notices',
  sourceUrl: SOURCE_URL,
  isEnabled: () => true,
  async fetch() {
    const entities: NormalisedEntity[] = [];
    const errors: string[] = [];
    let nextUrl: string | undefined = SOURCE_URL;
    let pages = 0;

    while (nextUrl && pages < MAX_PAGES) {
      pages++;
      let page: InterpolPage | null = null;
      try {
        page = await fetchPage(nextUrl);
      } catch (err) {
        errors.push(`Page ${pages}: ${err instanceof Error ? err.message : String(err)}`);
        break;
      }
      if (!page) break;

      const notices = page._embedded?.notices ?? [];
      for (const notice of notices) {
        try {
          entities.push(noticeToEntity(notice));
        } catch (err) {
          errors.push(`Notice ${notice.entity_id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Follow pagination
      const nextHref = page._links?.next?.href;
      nextUrl = nextHref ?? undefined;
    }

    const rawChecksum = await sha256Hex(entities.map((e) => e.id).join(','));
    return { entities, rawChecksum };
  },
};
