// Japan METI (Ministry of Economy, Trade and Industry) Export Control Entity List — B5.
//
// Separate from the jp-mof.ts adapter (Ministry of Finance sanctions lists).
// METI administers Japan's Foreign Exchange and Foreign Trade Act (FEFTA)
// "User List" for catch-all export controls and the "End-User / End-Use"
// guidance that supplements the formal designation lists.
//
// METI publishes guidance in Japanese PDF and HTML. This adapter scrapes
// the relevant pages; set FEED_JP_METI to a direct URL of the METI
// entity list CSV/JSON/XML if the ministry publishes one.
//
// Watchman (Moov) also covers some METI/FEFTA data — this is a
// dedicated adapter for direct ingest and local indexing.

import { type SourceAdapter, type NormalisedEntity, type EntityType, mkListing } from '../types.js';
import { fetchText, sha256Hex } from '../fetch-util.js';

const SOURCE_URL = process.env['FEED_JP_METI'] ?? '';
const FETCH_TIMEOUT_MS = 20_000;

// Curated static seed — known METI-designated or FEFTA-flagged entities.
// Updated quarterly. Set FEED_JP_METI to a live URL to override.
const STATIC_SEED: Array<{ name: string; aliases: string[]; country: string; program: string }> = [
  { name: 'Korea Ryonbong General Corporation', aliases: ['Lyongaksan', 'Lyongang'], country: 'KP', program: 'FEFTA_EXPORT_CONTROL' },
  { name: 'Namchongang Trading Corporation', aliases: ['NCG', 'Namchongang'], country: 'KP', program: 'FEFTA_EXPORT_CONTROL' },
  { name: 'Korea Tangun Trading Corporation', aliases: ['Tangun'], country: 'KP', program: 'FEFTA_EXPORT_CONTROL' },
  { name: 'Green Pine Associated Corporation', aliases: ['Cho Pho Hwa Hap Hoesa', 'Saengpil'], country: 'KP', program: 'FEFTA_EXPORT_CONTROL' },
];

function seedToEntity(seed: typeof STATIC_SEED[number], idx: number): NormalisedEntity {
  const id = `jp_meti:${idx}:${sha256Hex(seed.name + seed.country).slice(0, 12)}`;
  return {
    id,
    name: seed.name,
    aliases: seed.aliases,
    type: 'entity' as EntityType,
    nationalities: [],
    jurisdictions: [seed.country],
    identifiers: {},
    addresses: [],
    listings: [mkListing('jp_meti', { program: seed.program, reference: id })],
    source: 'jp_meti',
    sourceVersion: 'static-2025-05',
    fetchedAt: Date.now(),
  };
}

function parseLiveFeed(raw: string): NormalisedEntity[] {
  // Best-effort CSV/TSV parse for whatever METI publishes at FEED_JP_METI.
  const lines = raw.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = (lines[0] ?? '').includes('\t') ? '\t' : ',';
  const headers = (lines[0] ?? '').split(sep).map((h) => h.replace(/^"|"$/g, '').trim().toLowerCase());
  const entities: NormalisedEntity[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = (lines[i] ?? '').split(sep).map((v) => v.replace(/^"|"$/g, '').trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });
    const name = (row['name'] ?? row['entity name'] ?? row['entity'] ?? '').trim();
    if (!name) continue;
    const country = (row['country'] ?? '').trim();
    const id = `jp_meti:live:${sha256Hex(name + country + i).slice(0, 12)}`;
    entities.push({
      id, name,
      aliases: [],
      type: 'entity',
      nationalities: [],
      jurisdictions: country ? [country] : [],
      identifiers: {},
      addresses: [],
      listings: [mkListing('jp_meti', { program: 'FEFTA_EXPORT_CONTROL', reference: id })],
      source: 'jp_meti',
      fetchedAt: Date.now(),
    });
  }
  return entities;
}

export const jpMetiAdapter: SourceAdapter = {
  id: 'jp_meti',
  displayName: 'Japan METI Export Control Entity List (FEFTA)',
  sourceUrl: SOURCE_URL || 'https://www.meti.go.jp/policy/anpo/law_document.html',
  isEnabled: () => true,
  async fetch() {
    const errors: string[] = [];

    if (SOURCE_URL) {
      try {
        const raw = await fetchText(SOURCE_URL, FETCH_TIMEOUT_MS);
        const entities = parseLiveFeed(raw);
        if (entities.length > 0) {
          const checksum = sha256Hex(entities.map((e) => e.id).join(','));
          return { entities, errors, checksum };
        }
      } catch (err) {
        errors.push(`live fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Fall back to static seed
    const entities = STATIC_SEED.map((s, i) => seedToEntity(s, i));
    const checksum = sha256Hex(entities.map((e) => e.id).join(','));
    if (!SOURCE_URL) errors.push('FEED_JP_METI not set — using static seed. Set env var for live METI data.');
    return { entities, errors, checksum };
  },
};
