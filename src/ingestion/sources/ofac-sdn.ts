// OFAC SDN XML adapter.
// Source migrated mid-2024 from treasury.gov/ofac/downloads to a dedicated
// host. The legacy URL returns 404 since the migration — which is the
// reason this adapter has been silently failing on every cron run.
// Override at runtime via FEED_OFAC_SDN env var if OFAC migrates again.

import type { SourceAdapter, NormalisedEntity, EntityType } from '../types.js';
import { mkListing } from '../types.js';
import { fetchText, sha256Hex } from '../fetch-util.js';
import { parseXml, findAll, textOf } from '../xml-lite.js';

const SOURCE_URL = process.env['FEED_OFAC_SDN']
  ?? 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML';

export const ofacSdnAdapter: SourceAdapter = {
  id: 'ofac_sdn',
  displayName: 'OFAC SDN',
  sourceUrl: SOURCE_URL,
  async fetch() {
    const xml = await fetchText(SOURCE_URL, { accept: 'application/xml' });
    const rawChecksum = await sha256Hex(xml);
    const root = parseXml(xml);
    const fetchedAt = Date.now();
    const entities: NormalisedEntity[] = [];

    for (const entry of findAll(root, 'sdnEntry')) {
      const sdnType = textOf(entry, 'sdnType').toLowerCase();
      const t: EntityType = sdnType === 'individual' ? 'individual'
        : sdnType === 'entity' ? 'entity'
        : sdnType === 'vessel' ? 'vessel'
        : sdnType === 'aircraft' ? 'aircraft'
        : 'unknown';
      const first = textOf(entry, 'firstName');
      const last = textOf(entry, 'lastName');
      const name = t === 'individual' ? [first, last].filter(Boolean).join(' ').trim() : (last || first || '').trim();
      if (!name) continue;
      const uid = textOf(entry, 'uid');
      const aliases = findAll(entry, 'aka').map((a) => [textOf(a, 'firstName'), textOf(a, 'lastName')]
        .filter(Boolean).join(' ').trim()).filter(Boolean);
      const programs = findAll(entry, 'program').map((p) => p.text).filter(Boolean);
      const addresses = findAll(entry, 'address').map((a) => [
        textOf(a, 'address1'), textOf(a, 'city'), textOf(a, 'stateOrProvince'),
        textOf(a, 'postalCode'), textOf(a, 'country'),
      ].filter(Boolean).join(', ')).filter((s) => s.length > 0);
      const nationalities: string[] = [];
      for (const n of findAll(entry, 'nationality')) {
        const c = textOf(n, 'country');
        if (c) nationalities.push(c);
      }

      const identifiers: Record<string, string> = {};
      for (const id of findAll(entry, 'id')) {
        const type = textOf(id, 'idType').toLowerCase();
        const num = textOf(id, 'idNumber');
        if (type && num) identifiers[type] = num;
      }

      entities.push({
        id: `ofac_sdn:${uid || name}`,
        name, aliases, type: t,
        nationalities,
        jurisdictions: nationalities,
        identifiers,
        addresses,
        listings: programs.map((p) => mkListing('ofac_sdn', {
          program: p,
          reference: uid,
          authorityUrl: 'https://ofac.treasury.gov/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists',
        })),
        source: 'ofac_sdn',
        fetchedAt,
      });
    }

    return { entities, rawChecksum };
  },
};
