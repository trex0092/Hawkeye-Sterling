// UN Security Council Consolidated List adapter.
// Source: https://scsanctions.un.org/resources/xml/en/consolidated.xml

import type { SourceAdapter, NormalisedEntity } from '../types.js';
import { mkListing } from '../types.js';
import { fetchText, sha256Hex } from '../fetch-util.js';
import { parseXml, findAll, textOf } from '../xml-lite.js';

const SOURCE_URL = 'https://scsanctions.un.org/resources/xml/en/consolidated.xml';

export const unConsolidatedAdapter: SourceAdapter = {
  id: 'un_consolidated',
  displayName: 'UN Consolidated List',
  sourceUrl: SOURCE_URL,
  async fetch() {
    const xml = await fetchText(SOURCE_URL, { accept: 'application/xml' });
    const rawChecksum = await sha256Hex(xml);
    const root = parseXml(xml);
    const entities: NormalisedEntity[] = [];
    const fetchedAt = Date.now();

    // Individuals
    for (const ind of findAll(root, 'INDIVIDUAL')) {
      const first = textOf(ind, 'FIRST_NAME');
      const second = textOf(ind, 'SECOND_NAME');
      const third = textOf(ind, 'THIRD_NAME');
      const name = [first, second, third].filter(Boolean).join(' ').trim();
      if (!name) continue;
      const ref = textOf(ind, 'REFERENCE_NUMBER') || textOf(ind, 'DATAID');
      const aliases: string[] = [];
      for (const al of findAll(ind, 'INDIVIDUAL_ALIAS')) {
        const aname = textOf(al, 'ALIAS_NAME');
        if (aname) aliases.push(aname);
      }
      const nats: string[] = [];
      for (const n of findAll(ind, 'NATIONALITY')) if (n.text) nats.push(n.text);
      const dob = textOf(ind, 'DATE_OF_BIRTH');
      entities.push({
        id: `un_consolidated:${ref || name}`,
        name, aliases, type: 'individual',
        nationalities: nats,
        jurisdictions: nats,
        ...(dob ? { dateOfBirth: dob } : {}),
        identifiers: {},
        addresses: findAll(ind, 'INDIVIDUAL_ADDRESS').map((a) => a.text).filter(Boolean),
        listings: [mkListing('un_consolidated', {
          program: textOf(ind, 'UN_LIST_TYPE'),
          reference: ref,
          designatedAt: textOf(ind, 'LISTED_ON'),
          reason: textOf(ind, 'COMMENTS1'),
          authorityUrl: SOURCE_URL,
        })],
        source: 'un_consolidated',
        fetchedAt,
      });
    }

    // Entities
    for (const ent of findAll(root, 'ENTITY')) {
      const name = textOf(ent, 'FIRST_NAME') || textOf(ent, 'ENTITY_NAME');
      if (!name) continue;
      const ref = textOf(ent, 'REFERENCE_NUMBER') || textOf(ent, 'DATAID');
      const aliases: string[] = [];
      for (const al of findAll(ent, 'ENTITY_ALIAS')) {
        const aname = textOf(al, 'ALIAS_NAME');
        if (aname) aliases.push(aname);
      }
      entities.push({
        id: `un_consolidated:${ref || name}`,
        name, aliases, type: 'entity',
        nationalities: [],
        jurisdictions: [],
        identifiers: {},
        addresses: findAll(ent, 'ENTITY_ADDRESS').map((a) => a.text).filter(Boolean),
        listings: [mkListing('un_consolidated', {
          program: textOf(ent, 'UN_LIST_TYPE'),
          reference: ref,
          designatedAt: textOf(ent, 'LISTED_ON'),
          reason: textOf(ent, 'COMMENTS1'),
          authorityUrl: SOURCE_URL,
        })],
        source: 'un_consolidated',
        fetchedAt,
      });
    }

    return { entities, rawChecksum };
  },
};
