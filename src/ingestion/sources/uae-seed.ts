// UAE EOCN + Local Terrorist List — seed adapter.
// The authoritative UAE lists are distributed as PDFs and, for EOCN, also as a
// searchable portal. Real parsing of those PDFs is Phase-2 follow-up. In the
// meantime this adapter ships an empty but well-formed dataset so the matcher
// and brain can reason over a consistent schema. Point this at a local JSON
// seed file by setting UAE_SEED_PATH; otherwise returns [].

import type { SourceAdapter, NormalisedEntity } from '../types.js';
import { mkListing } from '../types.js';
import { readFile } from 'node:fs/promises';
import { sha256Hex } from '../fetch-util.js';

function makeAdapter(id: string, displayName: string, envVar: string, portal: string): SourceAdapter {
  return {
    id, displayName, sourceUrl: portal,
    async fetch() {
      const path = process.env[envVar];
      const fetchedAt = Date.now();
      if (!path) return { entities: [], rawChecksum: await sha256Hex('') };
      let raw = '';
      try { raw = await readFile(path, 'utf8'); }
      catch { return { entities: [], rawChecksum: await sha256Hex('') }; }
      const rawChecksum = await sha256Hex(raw);
      let records: unknown[];
      try { records = JSON.parse(raw) as unknown[]; }
      catch { return { entities: [], rawChecksum }; }
      const entities: NormalisedEntity[] = [];
      for (const r of Array.isArray(records) ? records : []) {
        if (!r || typeof r !== 'object') continue;
        const o = r as Record<string, unknown>;
        const name = typeof o.name === 'string' ? o.name : '';
        if (!name) continue;
        entities.push({
          id: `${id}:${typeof o.reference === 'string' ? o.reference : name}`,
          name,
          aliases: Array.isArray(o.aliases) ? (o.aliases as unknown[]).filter((x): x is string => typeof x === 'string') : [],
          type: (o.type === 'individual' || o.type === 'entity' || o.type === 'vessel' || o.type === 'aircraft') ? o.type : 'unknown',
          nationalities: Array.isArray(o.nationalities) ? (o.nationalities as unknown[]).filter((x): x is string => typeof x === 'string') : [],
          jurisdictions: ['AE'],
          identifiers: (typeof o.identifiers === 'object' && o.identifiers) ? (o.identifiers as Record<string, string>) : {},
          addresses: Array.isArray(o.addresses) ? (o.addresses as unknown[]).filter((x): x is string => typeof x === 'string') : [],
          listings: [mkListing(id, {
            program: typeof o.program === 'string' ? o.program : undefined,
            reference: typeof o.reference === 'string' ? o.reference : undefined,
            designatedAt: typeof o.designatedAt === 'string' ? o.designatedAt : undefined,
            authorityUrl: portal,
          })],
          source: id, fetchedAt,
        });
      }
      return { entities, rawChecksum };
    },
  };
}

export const uaeEocnAdapter: SourceAdapter = makeAdapter(
  'uae_eocn', 'UAE EOCN Sanctions List', 'UAE_EOCN_SEED_PATH',
  'https://www.uaeiec.gov.ae/',
);

export const uaeLtlAdapter: SourceAdapter = makeAdapter(
  'uae_ltl', 'UAE Local Terrorist List', 'UAE_LTL_SEED_PATH',
  'https://www.moi.gov.ae/',
);
