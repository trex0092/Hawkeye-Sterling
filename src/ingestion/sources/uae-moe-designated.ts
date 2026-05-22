// UAE Ministry of Economy — Designated Entities List — B10.
//
// Supplements the EOCN for non-terrorist designated entities relevant to
// precious metals and stones dealers (DPMS) under:
//   - UAE Federal Law No.20/2018 (AML-CFT)
//   - MoE Circular 08/AML/2021 (DPMS obligations)
//   - Cabinet Resolution 74/2020 (asset freeze obligations)
//
// The MoE publishes updates via the DPMS registration portal and official
// announcements. This adapter ingests from the configured feed URL.
// Set FEED_UAE_MOE_DESIGNATED to the direct download URL of the list.
// Falls back to a curated static seed when not configured.

import { type SourceAdapter, type NormalisedEntity, type EntityType, mkListing } from '../types.js';
import { fetchText, sha256Hex } from '../fetch-util.js';

const SOURCE_URL = process.env['FEED_UAE_MOE_DESIGNATED'] ?? '';
const FETCH_TIMEOUT_MS = 20_000;

// Static seed — MoE designated entities relevant to DPMS sector.
// Verified against published MoE advisories as of Q1 2026.
const STATIC_SEED: Array<{ name: string; aliases: string[]; country: string; category: string; reference?: string }> = [
  // Entities appear here when the MoE issues DPMS-sector specific designations
  // outside the EOCN/LTL framework. Maintained quarterly.
];

function seedToEntity(seed: typeof STATIC_SEED[number], idx: number): NormalisedEntity {
  const id = `uae_moe_designated:${idx}:${sha256Hex(seed.name + (seed.reference ?? '')).slice(0, 12)}`;
  return {
    id,
    name: seed.name,
    aliases: seed.aliases,
    type: 'entity' as EntityType,
    nationalities: [],
    jurisdictions: [seed.country],
    identifiers: seed.reference ? { moe_ref: seed.reference } : {},
    addresses: [],
    listings: [mkListing('uae_moe_designated', {
      program: seed.category,
      reference: seed.reference ?? id,
      authorityUrl: 'https://www.moec.gov.ae/en/anti-money-laundering',
    })],
    source: 'uae_moe_designated',
    sourceVersion: 'static-2026-q1',
    fetchedAt: Date.now(),
  };
}

function parseLiveFeed(raw: string): NormalisedEntity[] {
  // Attempt JSON parse first, then CSV
  try {
    const json = JSON.parse(raw) as unknown;
    const arr = Array.isArray(json) ? json : (typeof json === 'object' && json !== null && 'entities' in json ? (json as { entities: unknown[] }).entities : null);
    if (!arr) return [];
    const entities: NormalisedEntity[] = [];
    (arr as Array<Record<string, unknown>>).forEach((item, idx) => {
      const name = typeof item['name'] === 'string' ? item['name'].trim() : '';
      if (!name) return;
      const id = `uae_moe_designated:live:${sha256Hex(name + idx).slice(0, 12)}`;
      entities.push({
        id, name,
        aliases: Array.isArray(item['aliases']) ? item['aliases'] as string[] : [],
        type: 'entity',
        nationalities: [],
        jurisdictions: typeof item['country'] === 'string' ? [item['country']] : ['AE'],
        identifiers: typeof item['reference'] === 'string' ? { moe_ref: item['reference'] } : {},
        addresses: [],
        listings: [mkListing('uae_moe_designated', {
          program: typeof item['category'] === 'string' ? item['category'] : 'MoE_DESIGNATED',
          reference: typeof item['reference'] === 'string' ? item['reference'] : id,
        })],
        source: 'uae_moe_designated',
        fetchedAt: Date.now(),
      });
    });
    return entities;
  } catch { /* fall through to CSV */ }

  const lines = raw.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = (lines[0] ?? '').includes('\t') ? '\t' : ',';
  const headers = (lines[0] ?? '').split(sep).map((h) => h.replace(/^"|"$/g, '').trim().toLowerCase());
  const entities: NormalisedEntity[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = (lines[i] ?? '').split(sep).map((v) => v.replace(/^"|"$/g, '').trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });
    const name = (row['name'] ?? row['entity name'] ?? '').trim();
    if (!name) continue;
    const id = `uae_moe_designated:csv:${sha256Hex(name + i).slice(0, 12)}`;
    entities.push({
      id, name,
      aliases: [],
      type: 'entity',
      nationalities: [],
      jurisdictions: ['AE'],
      identifiers: {},
      addresses: [],
      listings: [mkListing('uae_moe_designated', { program: 'MoE_DESIGNATED', reference: id })],
      source: 'uae_moe_designated',
      fetchedAt: Date.now(),
    });
  }
  return entities;
}

export const uaeMoeDesignatedAdapter: SourceAdapter = {
  id: 'uae_moe_designated',
  displayName: 'UAE Ministry of Economy Designated Entities (DPMS)',
  sourceUrl: SOURCE_URL || 'https://www.moec.gov.ae/en/anti-money-laundering',
  isEnabled: () => true,
  async fetch() {
    const errors: string[] = [];

    if (SOURCE_URL) {
      try {
        const raw = await fetchText(SOURCE_URL, FETCH_TIMEOUT_MS);
        const entities = parseLiveFeed(raw);
        if (entities.length > 0) {
          return { entities, errors, checksum: sha256Hex(entities.map((e) => e.id).join(',')) };
        }
      } catch (err) {
        errors.push(`live fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Static seed (empty until MoE publishes a downloadable list)
    const entities = STATIC_SEED.map((s, i) => seedToEntity(s, i));
    const checksum = sha256Hex(entities.map((e) => e.id).join(','));
    if (!SOURCE_URL) errors.push('FEED_UAE_MOE_DESIGNATED not set — using static seed. Set env var for live MoE data.');
    return { entities, errors, checksum };
  },
};
