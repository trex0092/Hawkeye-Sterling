// UK OFSI Consolidated List — CSV export.
// Source: https://ofsistorage.blob.core.windows.net/publishlive/ConList.csv

import type { SourceAdapter, NormalisedEntity, EntityType } from '../types.js';
import { mkListing } from '../types.js';
import { fetchText, sha256Hex } from '../fetch-util.js';

const SOURCE_URL = 'https://ofsistorage.blob.core.windows.net/publishlive/ConList.csv';

export const ukOfsiAdapter: SourceAdapter = {
  id: 'uk_ofsi',
  displayName: 'UK OFSI Consolidated List',
  sourceUrl: SOURCE_URL,
  async fetch() {
    const csv = await fetchText(SOURCE_URL, { accept: 'text/csv' });
    const rawChecksum = await sha256Hex(csv);
    const fetchedAt = Date.now();
    const rows = parseCsv(csv);
    if (rows.length === 0) return { entities: [], rawChecksum };
    const header = rows[0]!.map((h) => h.toLowerCase());
    const idx = (name: string) => header.findIndex((h) => h === name.toLowerCase());
    const iName6 = idx('name 6');
    const iName1 = idx('name 1');
    const iGroupType = idx('group type');
    const iGroupId = idx('group id');
    const iRegime = idx('regime') >= 0 ? idx('regime') : idx('legal basis');
    const iDob = idx('dob');
    const iNat = idx('nationality');
    const entities: NormalisedEntity[] = [];
    const byGroup = new Map<string, NormalisedEntity>();

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]!;
      const name = [iName1, iName6].filter((x) => x >= 0).map((x) => r[x] ?? '').filter(Boolean).join(' ').trim();
      if (!name) continue;
      const groupType = (iGroupType >= 0 ? r[iGroupType] ?? '' : '').toLowerCase();
      const t: EntityType = groupType === 'individual' ? 'individual'
        : groupType === 'entity' ? 'entity' : groupType === 'ship' ? 'vessel' : 'unknown';
      const groupId = iGroupId >= 0 ? (r[iGroupId] ?? '') : '';
      const existing = groupId ? byGroup.get(groupId) : undefined;
      if (existing) {
        if (!existing.aliases.includes(name)) existing.aliases.push(name);
        continue;
      }
      const regime = iRegime >= 0 ? (r[iRegime] ?? '') : '';
      const dob = iDob >= 0 ? (r[iDob] ?? '').trim() : '';
      const nat = iNat >= 0 ? (r[iNat] ?? '').trim() : '';
      const ent: NormalisedEntity = {
        id: `uk_ofsi:${groupId || name}`,
        name, aliases: [], type: t,
        nationalities: nat ? [nat] : [],
        jurisdictions: nat ? [nat] : [],
        ...(dob ? { dateOfBirth: dob } : {}),
        identifiers: {},
        addresses: [],
        listings: [mkListing('uk_ofsi', {
          program: regime,
          reference: groupId,
          authorityUrl: 'https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-of-targets',
        })],
        source: 'uk_ofsi',
        fetchedAt,
      };
      if (groupId) byGroup.set(groupId, ent);
      entities.push(ent);
    }
    return { entities, rawChecksum };
  },
};

// Minimal RFC-4180 CSV parser handling quoted fields + escaped quotes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"' && i + 1 < text.length && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}
