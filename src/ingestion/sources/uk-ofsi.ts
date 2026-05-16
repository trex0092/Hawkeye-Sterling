// UK OFSI Consolidated List — CSV export.
// OFSI moved the consolidated list to a 2022format subdirectory; the
// legacy /publishlive/ConList.csv URL began returning 404 sometime
// after early 2024 (observed via /api/sanctions/last-errors). New
// canonical URL below. Override via FEED_UK_OFSI env var if OFSI
// migrates again.

import { type SourceAdapter, type NormalisedEntity, type EntityType, mkListing } from '../types.js';
import { fetchText, sha256Hex } from '../fetch-util.js';

const SOURCE_URL = process.env['FEED_UK_OFSI']
  ?? 'https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.csv';

export const ukOfsiAdapter: SourceAdapter = {
  id: 'uk_ofsi',
  displayName: 'UK OFSI Consolidated List',
  sourceUrl: SOURCE_URL,
  async fetch() {
    const csvRaw = await fetchText(SOURCE_URL, { accept: 'text/csv' });
    // Strip UTF-8 BOM if present — OFSI's CSV exports include it, and a
    // BOM-prefixed first column header (`﻿Group Type`) silently
    // breaks exact-match column lookup.
    const csv = csvRaw.replace(/^﻿/, '');
    const rawChecksum = await sha256Hex(csv);
    const fetchedAt = Date.now();
    const rows = parseCsv(csv);
    if (rows.length === 0) return { entities: [], rawChecksum };
    // 2022format OFSI CSV puts the header on row 2 (row 1 is a "Last updated"
    // metadata line). Detect header by looking for recognised column names
    // in the first 3 rows.
    let headerRow = 0;
    for (let r = 0; r < Math.min(3, rows.length); r++) {
      const candidate = (rows[r] ?? []).map((h) => h.trim().toLowerCase());
      if (candidate.some((h) => h === 'name 6' || h === 'name 1' || h === 'group type')) {
        headerRow = r;
        break;
      }
    }
    const header = (rows[headerRow] ?? []).map((h) => h.trim().toLowerCase());
    const idx = (name: string) => header.findIndex((h) => h === name.toLowerCase());
    const iName6 = idx('name 6');
    const iName1 = idx('name 1');
    const iGroupType = idx('group type');
    const iGroupId = idx('group id');
    const iRegime = idx('regime') >= 0 ? idx('regime') : (idx('regime name') >= 0 ? idx('regime name') : idx('legal basis'));
    const iDob = idx('dob');
    const iNat = idx('nationality');
    if (iName6 < 0 && iName1 < 0) {
      // Couldn't find any name column — emit empty rather than garbage.
      // The ingest-error log surfaces the cause via the parser's
      // upstream signal (headers don't include "Name 6" / "Name 1").
      return { entities: [], rawChecksum };
    }
    const entities: NormalisedEntity[] = [];
    const byGroup = new Map<string, NormalisedEntity>();

    for (let i = headerRow + 1; i < rows.length; i++) {
      const r = rows[i] ?? [];
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
    const c = text[i] ?? '';
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
