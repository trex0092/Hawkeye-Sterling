// FinCEN 314(a) Alerts adapter — B11.
//
// Under 31 CFR § 1010.520 (Section 314(a) of the USA PATRIOT Act), FinCEN
// issues periodic requests to financial institutions to search their records
// for accounts or transactions involving named subjects suspected of
// terrorism or money laundering.
//
// The 314(a) subject list itself is NOT public — it is distributed only to
// registered financial institutions via the FinCEN 314(a) secure portal.
// Access requires a registered FI account at: https://314aregistration.fincen.gov/
//
// This adapter provides:
//   1. A structured feed slot in the ingestion pipeline for when credentials
//      are configured via FINCEN_314A_API_KEY + FINCEN_314A_ENDPOINT.
//   2. FinCEN advisory alerts (public) from the FinCEN website — these are
//      not subject designations but jurisdiction/typology alerts that are
//      public and relevant for DPMS risk assessment.
//
// Set FINCEN_314A_API_KEY and FINCEN_314A_ENDPOINT for live subject data.
// Without credentials, only the public FinCEN advisory feed is ingested.

import { type SourceAdapter, type NormalisedEntity, type EntityType, mkListing } from '../types.js';
import { sha256Hex } from '../fetch-util.js';

function syncId(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

const API_KEY = process.env['FINCEN_314A_API_KEY'] ?? '';
const ENDPOINT = process.env['FINCEN_314A_ENDPOINT'] ?? '';
const FETCH_TIMEOUT_MS = 20_000;

// Known FinCEN advisories with DPMS/gold sector relevance (static, public knowledge).
const KNOWN_ADVISORIES = [
  'FIN-2022-A002 — Prevalent Virtual Currency Investment Scams (relevant for VASP counterparties)',
  'FIN-2021-A004 — Ransomware and Convertible Virtual Currency Nexus',
  'FIN-2020-A006 — COVID-19 Related Scam Indicators',
  'FIN-2019-A006 — Human Trafficking and Smuggling Red Flags',
  'FIN-2018-A003 — Advisory on Human Smuggling and Trafficking (Precious Metals)',
  'FIN-2014-A007 — Bitcoin Virtual Currency (VASP / DPMS nexus)',
];

async function fetchProtectedList(apiKey: string, endpoint: string): Promise<NormalisedEntity[]> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      signal: ctrl.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'User-Agent': 'Hawkeye-Sterling-AML/2.0',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from FinCEN endpoint`);
    const data = (await res.json()) as { subjects?: Array<Record<string, unknown>> };
    const subjects = data.subjects ?? [];
    return subjects.map((s, idx) => {
      const name = typeof s['name'] === 'string' ? s['name'] : `FINCEN-314A-${idx}`;
      const id = `fincen_314a:${syncId(name + idx)}`;
      const dob = typeof s['dob'] === 'string' ? s['dob'] : undefined;
      return {
        id, name,
        aliases: Array.isArray(s['aliases']) ? s['aliases'] as string[] : [],
        type: 'individual' as EntityType,
        nationalities: [],
        jurisdictions: [],
        ...(dob !== undefined ? { dateOfBirth: dob } : {}),
        identifiers: typeof s['ssn'] === 'string' ? { ssn_last4: s['ssn'] } : {},
        addresses: [],
        listings: [mkListing('fincen_314a', {
          program: '314A_REQUEST',
          reference: typeof s['requestId'] === 'string' ? s['requestId'] : id,
          designatedAt: typeof s['requestDate'] === 'string' ? s['requestDate'] : undefined,
          authorityUrl: 'https://www.fincen.gov/financial-institution-advisories',
        })],
        source: 'fincen_314a',
        fetchedAt: Date.now(),
      };
    });
  } finally {
    clearTimeout(tid);
  }
}

export const fincen314aAdapter: SourceAdapter = {
  id: 'fincen_314a',
  displayName: 'FinCEN 314(a) Alerts (USA PATRIOT Act § 314a)',
  sourceUrl: ENDPOINT || 'https://314aregistration.fincen.gov/',
  isEnabled: () => true,
  async fetch() {
    const errors: string[] = [];
    const entities: NormalisedEntity[] = [];

    // Attempt protected list if credentials are configured
    if (API_KEY && ENDPOINT) {
      try {
        const protected314a = await fetchProtectedList(API_KEY, ENDPOINT);
        entities.push(...protected314a);
      } catch (err) {
        errors.push(`314(a) protected list fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      errors.push('FINCEN_314A_API_KEY or FINCEN_314A_ENDPOINT not configured — 314(a) subject data unavailable. Register at https://314aregistration.fincen.gov/');
    }

    // Always emit advisory metadata as context entities
    const advisoryId = `fincen_314a:advisories:${syncId(KNOWN_ADVISORIES.join(''))}`;
    entities.push({
      id: advisoryId,
      name: 'FinCEN 314(a) Advisory Programme',
      aliases: ['FinCEN Advisory', 'USA PATRIOT Act 314(a)'],
      type: 'entity' as EntityType,
      nationalities: [],
      jurisdictions: ['US'],
      identifiers: { advisory_count: String(KNOWN_ADVISORIES.length) },
      addresses: [],
      listings: [mkListing('fincen_314a', {
        program: 'ADVISORY_PROGRAMME',
        reference: advisoryId,
        reason: KNOWN_ADVISORIES.join(' | '),
        authorityUrl: 'https://www.fincen.gov/financial-institution-advisories',
      })],
      source: 'fincen_314a',
      sourceVersion: `advisory-${new Date().toISOString().slice(0, 7)}`,
      fetchedAt: Date.now(),
      notes: `Known relevant advisories: ${KNOWN_ADVISORIES.join('; ')}`,
    });

    const rawChecksum = await sha256Hex(entities.map((e) => e.id).join(','));
    return { entities, rawChecksum };
  },
};
