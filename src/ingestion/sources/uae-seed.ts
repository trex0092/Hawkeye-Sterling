// UAE EOCN + Local Terrorist List — seed adapter.
// The authoritative UAE lists are distributed as PDFs and, for EOCN, also as a
// searchable portal. Point this at a local JSON seed file by setting
// UAE_EOCN_SEED_PATH / UAE_LTL_SEED_PATH in the Netlify environment.
// If the env var is unset, falls back to data/eocn_seed.json or data/uae_ltl_seed.json
// in the project root so the lists load on fresh deploys.
//
// Seed schema (either style accepted):
//   { id, name, aliases, dob, nationality, listId, designation, reference, type, nationalities, program, designatedAt }
// or the legacy ingestion schema:
//   { name, aliases, nationalities, type, identifiers, addresses, program, reference, designatedAt }

import type { SourceAdapter, NormalisedEntity } from '../types.js';
import { mkListing } from '../types.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sha256Hex } from '../fetch-util.js';

// Resolve the project root from this file's location (src/ingestion/sources/ → ../../..)
const PROJECT_ROOT = resolve(__dirname, '..', '..', '..');

const DEFAULT_PATHS: Record<string, string> = {
  UAE_EOCN_SEED_PATH: resolve(PROJECT_ROOT, 'data', 'eocn_seed.json'),
  UAE_LTL_SEED_PATH:  resolve(PROJECT_ROOT, 'data', 'uae_ltl_seed.json'),
};

function makeAdapter(id: string, displayName: string, envVar: string, portal: string): SourceAdapter {
  return {
    id, displayName, sourceUrl: portal,
    async fetch() {
      const path = process.env[envVar] ?? DEFAULT_PATHS[envVar];
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
        // Skip seed placeholder entries
        if (name.startsWith('SEED ENTRY')) continue;

        // Support both spec schema (id, nationality, designation) and legacy schema
        const refFromSpec = typeof o.id === 'string' ? o.id : undefined;
        const refFromLegacy = typeof o.reference === 'string' ? o.reference : undefined;
        const ref = refFromLegacy ?? refFromSpec ?? name;

        const natFromSpec = typeof o.nationality === 'string' ? [o.nationality] : [];
        const natFromLegacy = Array.isArray(o.nationalities) ? (o.nationalities as unknown[]).filter((x): x is string => typeof x === 'string') : [];
        const nationalities = [...new Set([...natFromLegacy, ...natFromSpec])];

        const programFromSpec = typeof o.designation === 'string' ? o.designation : undefined;
        const programFromLegacy = typeof o.program === 'string' ? o.program : undefined;

        const identifiers: Record<string, string> = (typeof o.identifiers === 'object' && o.identifiers)
          ? (o.identifiers as Record<string, string>)
          : {};
        if (typeof o.dob === 'string' && o.dob) identifiers['dob'] = o.dob;

        entities.push({
          id: `${id}:${ref}`,
          name,
          aliases: Array.isArray(o.aliases) ? (o.aliases as unknown[]).filter((x): x is string => typeof x === 'string') : [],
          type: (o.type === 'individual' || o.type === 'entity' || o.type === 'vessel' || o.type === 'aircraft') ? o.type : 'unknown',
          nationalities,
          jurisdictions: ['AE'],
          identifiers,
          addresses: Array.isArray(o.addresses) ? (o.addresses as unknown[]).filter((x): x is string => typeof x === 'string') : [],
          listings: [mkListing(id, {
            program: programFromLegacy ?? programFromSpec,
            reference: ref,
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
