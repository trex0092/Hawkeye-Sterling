// US BIS Entity List adapter — B2.
//
// The Bureau of Industry and Security (BIS) publishes the Entity List under
// 15 CFR Part 744. Critical for a UAE DPMS entity handling gold exports —
// any gold transaction with a BIS-listed entity requires a specific
// export license under the Export Administration Regulations (EAR).
//
// Data is available as a CSV from the BIS website.
// Override URL via FEED_BIS_ENTITY.
//
// Also covers the Military End-User (MEU) List, which is a sub-category.

import { type SourceAdapter, type NormalisedEntity, type EntityType, mkListing } from '../types.js';
import { fetchText, sha256Hex } from '../fetch-util.js';

function syncId(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

const SOURCE_URL = process.env['FEED_BIS_ENTITY']
  ?? 'https://www.bis.doc.gov/index.php/component/docman/?task=doc_download&gid=1282';

// BIS publishes a TSV/CSV with the following headers (approximately):
// Source List | Entity Name | Entity Alias | Address | City | State | Country |
// Zip | Federal Register Notice | Effective Date | Date Delisted | License Requirement |
// License Policy | FRTIB Name
const FETCH_TIMEOUT_MS = 25_000;

function parseCsv(raw: string): Array<Record<string, string>> {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];
  // Detect separator (tab vs comma)
  const sep = (lines[0] ?? '').includes('\t') ? '\t' : ',';
  const headers = (lines[0] ?? '').split(sep).map((h) => h.replace(/^"|"$/g, '').trim().toLowerCase());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line?.trim()) continue;
    // Simple split — values may contain quoted commas, handle basic quoting
    const vals = line.split(sep).map((v) => v.replace(/^"|"$/g, '').trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });
    rows.push(row);
  }
  return rows;
}

function rowToEntity(row: Record<string, string>, idx: number): NormalisedEntity | null {
  const name = (row['entity name'] ?? row['name'] ?? '').trim();
  if (!name) return null;
  const country = (row['country'] ?? '').trim();
  const city = (row['city'] ?? '').trim();
  const address = [row['address'] ?? '', city, row['state'] ?? '', country].filter(Boolean).join(', ');
  const aliasRaw = (row['entity alias'] ?? row['alias'] ?? '').trim();
  const aliases = aliasRaw ? aliasRaw.split(/[;,]/).map((a) => a.trim()).filter(Boolean) : [];
  const effectiveDate = (row['effective date'] ?? '').trim();
  const licenseReq = (row['license requirement'] ?? '').trim();
  const source = (row['source list'] ?? 'bis_entity').toLowerCase().replace(/\s+/g, '_');
  const id = `bis_entity:${idx}:${syncId(name + country + effectiveDate)}`;

  return {
    id,
    name,
    aliases,
    type: 'entity' as EntityType,
    nationalities: [],
    jurisdictions: country ? [country] : [],
    identifiers: {},
    addresses: address ? [address] : [],
    listings: [mkListing('bis_entity', {
      program: licenseReq || 'EXPORT_CONTROL',
      reference: id,
      designatedAt: effectiveDate || undefined,
      reason: licenseReq || undefined,
    })],
    source: 'bis_entity',
    fetchedAt: Date.now(),
    notes: `BIS Entity List — ${source}`,
  };
}

export const bisEntityAdapter: SourceAdapter = {
  id: 'bis_entity',
  displayName: 'US BIS Entity List (Export Controls)',
  sourceUrl: SOURCE_URL,
  isEnabled: () => true,
  async fetch() {
    const errors: string[] = [];
    let raw = '';
    try {
      raw = await fetchText(SOURCE_URL, { timeoutMs: FETCH_TIMEOUT_MS });
    } catch (err) {
      throw new Error(`bis_entity: fetch failed — ${err instanceof Error ? err.message : String(err)}`);
    }

    const rows = parseCsv(raw);
    const entities: NormalisedEntity[] = [];
    rows.forEach((row, idx) => {
      try {
        const entity = rowToEntity(row, idx);
        if (entity) entities.push(entity);
      } catch (err) {
        errors.push(`row ${idx}: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    const rawChecksum = await sha256Hex(entities.map((e) => e.id).join(','));
    return { entities, rawChecksum };
  },
};
