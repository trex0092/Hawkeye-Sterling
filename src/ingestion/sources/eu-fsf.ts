// EU Financial Sanctions Files adapter.
// Source (anonymous endpoint): https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw
// Official EEAS consolidated XML — token is public, embedded in the portal.

import { type SourceAdapter, type NormalisedEntity, type EntityType, mkListing } from '../types.js';
import { fetchText, sha256Hex } from '../fetch-util.js';
import { parseXml, findAll } from '../xml-lite.js';

const SOURCE_URL = 'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw';

export const euFsfAdapter: SourceAdapter = {
  id: 'eu_fsf',
  displayName: 'EU Financial Sanctions Files',
  sourceUrl: SOURCE_URL,
  async fetch() {
    const xml = await fetchText(SOURCE_URL, { accept: 'application/xml' });
    const rawChecksum = await sha256Hex(xml);
    const root = parseXml(xml);
    const fetchedAt = Date.now();
    const entities: NormalisedEntity[] = [];

    const topTags = [...new Set(root.children.map((c) => c.tag))].slice(0, 10);
    let sanctionEntries = findAll(root, 'sanctionEntity');

    // EU FSF schema migration: v1.x uses <sanctionEntity>, v2.x uses <subject>.
    // Try both so the adapter survives a schema upgrade without a deploy.
    if (sanctionEntries.length === 0) {
      const subjectEntries = findAll(root, 'subject');
      if (subjectEntries.length > 0) {
        console.info(
          `[eu_fsf] fallback: found ${subjectEntries.length} <subject> nodes (v2 schema). ` +
          `Top-level tags: [${topTags.join(', ')}]`,
        );
        sanctionEntries = subjectEntries;
      } else {
        console.warn(
          `[eu_fsf] findAll('sanctionEntity'/'subject') both returned 0 nodes. ` +
          `Top-level tags: [${topTags.join(', ')}]. ` +
          `XML length: ${xml.length} bytes. ` +
          `First 400 chars: ${xml.slice(0, 400).replace(/\s+/g, ' ')}`,
        );
      }
    }

    for (const entry of sanctionEntries) {
      const logicalId = entry.attrs['logicalId'] ?? entry.attrs['euReferenceNumber'] ?? entry.attrs['id'] ?? '';
      const subject = findAll(entry, 'subjectType')[0];
      const subjectCode = subject?.attrs['code']?.toLowerCase();
      const t: EntityType = subjectCode === 'person' ? 'individual'
        : subjectCode === 'enterprise' ? 'entity' : 'unknown';
      const nameAliases = findAll(entry, 'nameAlias');
      if (nameAliases.length === 0) continue;
      const primary = nameAliases[0];
      const name = (primary?.attrs['wholeName']
        ?? [primary?.attrs['firstName'], primary?.attrs['lastName']].filter(Boolean).join(' ')).trim();
      if (!name) continue;
      const aliases = nameAliases.slice(1).map((a) => a.attrs['wholeName'] ?? '').filter(Boolean);
      const programs = findAll(entry, 'regulation').map((r) => r.attrs['publicationTitle'] ?? r.attrs['programme'] ?? '').filter(Boolean);
      const addresses = findAll(entry, 'address').map((a) => [
        a.attrs['street'], a.attrs['city'], a.attrs['zipCode'], a.attrs['countryDescription'],
      ].filter(Boolean).join(', ')).filter((s) => s.length > 0);
      const nats = findAll(entry, 'citizenship').map((c) => c.attrs['countryDescription'] ?? c.attrs['country'] ?? '').filter(Boolean);

      entities.push({
        id: `eu_fsf:${logicalId || name}`,
        name, aliases, type: t,
        nationalities: nats,
        jurisdictions: nats,
        identifiers: {},
        addresses,
        listings: programs.map((p) => mkListing('eu_fsf', {
          program: p, reference: logicalId,
          authorityUrl: 'https://webgate.ec.europa.eu/fsd/fsf',
        })),
        source: 'eu_fsf', fetchedAt,
      });
    }
    return { entities, rawChecksum };
  },
};
