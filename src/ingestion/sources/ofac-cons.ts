// OFAC Consolidated Non-SDN — same schema as SDN XML, different URL.
import type { SourceAdapter, NormalisedEntity, EntityType } from '../types.js';
import { mkListing } from '../types.js';
import { fetchText, sha256Hex } from '../fetch-util.js';
import { parseXml, findAll, textOf } from '../xml-lite.js';

const SOURCE_URL = 'https://www.treasury.gov/ofac/downloads/consolidated/consolidated.xml';

export const ofacConsAdapter: SourceAdapter = {
  id: 'ofac_cons',
  displayName: 'OFAC Consolidated Non-SDN',
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
        : sdnType === 'entity' ? 'entity' : sdnType === 'vessel' ? 'vessel'
        : sdnType === 'aircraft' ? 'aircraft' : 'unknown';
      const first = textOf(entry, 'firstName');
      const last = textOf(entry, 'lastName');
      const name = t === 'individual' ? [first, last].filter(Boolean).join(' ').trim() : (last || first || '').trim();
      if (!name) continue;
      const uid = textOf(entry, 'uid');
      const aliases = findAll(entry, 'aka').map((a) => [textOf(a, 'firstName'), textOf(a, 'lastName')]
        .filter(Boolean).join(' ').trim()).filter(Boolean);
      const programs = findAll(entry, 'program').map((p) => p.text).filter(Boolean);
      entities.push({
        id: `ofac_cons:${uid || name}`,
        name, aliases, type: t,
        nationalities: [], jurisdictions: [], identifiers: {}, addresses: [],
        listings: programs.map((p) => mkListing('ofac_cons', {
          program: p, reference: uid,
          authorityUrl: 'https://ofac.treasury.gov/consolidated-sanctions-list',
        })),
        source: 'ofac_cons', fetchedAt,
      });
    }
    return { entities, rawChecksum };
  },
};
