// Turkey MASAK (Mali Suçları Araştırma Kurulu / Financial Crimes Investigation
// Board) domestic asset-freeze list — TR FIU coverage.
//
// MASAK administers Turkey's targeted financial sanctions under Law No. 6415
// (Prevention of the Financing of Terrorism) and Law No. 7262 (Prevention of
// Financing of the Proliferation of Weapons of Mass Destruction). Domestic
// freeze decisions are issued by Presidential / Cabinet decree and published
// in the Resmî Gazete (Official Gazette).
//
// MASAK publishes the consolidated domestic freeze list as HTML/PDF and, for
// some channels, a downloadable file. Set FEED_TR_MASAK to a direct URL of a
// CSV/TSV/JSON export (or a self-hosted mirror) to ingest live data; otherwise
// the curated static seed below provides baseline coverage so a TR-jurisdiction
// subject is screened against MASAK rather than flagged "manual query".
//
// Honesty guard: when only the static seed runs (live feed unset/unreachable),
// candidates-loader surfaces this via CandidateLoadHealth so the MLRO knows the
// screen ran against seed rather than live MASAK data.

import { type SourceAdapter, type NormalisedEntity, type EntityType, mkListing } from '../types.js';
import { fetchText, sha256Hex } from '../fetch-util.js';

function syncId(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

const SOURCE_URL = process.env['FEED_TR_MASAK'] ?? '';
const FETCH_TIMEOUT_MS = 20_000;

// Curated static seed — publicly documented organisations designated under
// Turkey's domestic counter-terrorism-financing freeze decisions (Law 6415 /
// 7262, Resmî Gazete). Names are kept in both Turkish and common English forms
// as aliases to maximise match recall. Refresh by setting FEED_TR_MASAK.
const STATIC_SEED: Array<{ name: string; aliases: string[]; type: EntityType; program: string }> = [
  {
    name: 'Kurdistan İşçi Partisi',
    aliases: ['PKK', 'Kurdistan Workers Party', 'KADEK', 'KONGRA-GEL'],
    type: 'entity',
    program: 'LAW_6415_TERROR_FREEZE',
  },
  {
    name: 'Devrimci Halk Kurtuluş Partisi-Cephesi',
    aliases: ['DHKP-C', 'DHKP/C', 'Revolutionary People\'s Liberation Party-Front', 'Dev Sol'],
    type: 'entity',
    program: 'LAW_6415_TERROR_FREEZE',
  },
  {
    name: 'Fetullahçı Terör Örgütü',
    aliases: ['FETÖ', 'FETO/PDY', 'FETÖ/PDY', 'Gülen Movement', 'Hizmet'],
    type: 'entity',
    program: 'LAW_6415_TERROR_FREEZE',
  },
  {
    name: 'Türkiye Halk Kurtuluş Partisi-Cephesi',
    aliases: ['THKP-C', 'People\'s Liberation Party-Front of Turkey'],
    type: 'entity',
    program: 'LAW_6415_TERROR_FREEZE',
  },
  {
    name: 'El Kaide',
    aliases: ['Al-Qaida', 'Al Qaeda', 'El-Kaide Terör Örgütü'],
    type: 'entity',
    program: 'LAW_6415_UNSCR_1267',
  },
  {
    name: 'Irak Şam İslam Devleti',
    aliases: ['DEAŞ', 'DAESH', 'ISIL', 'ISIS', 'Islamic State'],
    type: 'entity',
    program: 'LAW_6415_UNSCR_1267',
  },
];

function seedToEntity(seed: typeof STATIC_SEED[number], idx: number): NormalisedEntity {
  const id = `tr_masak:${idx}:${syncId(seed.name)}`;
  return {
    id,
    name: seed.name,
    aliases: seed.aliases,
    type: seed.type,
    nationalities: [],
    jurisdictions: ['TR'],
    identifiers: {},
    addresses: [],
    listings: [mkListing('tr_masak', {
      program: seed.program,
      reference: id,
      authorityUrl: 'https://masak.hmb.gov.tr',
    })],
    source: 'tr_masak',
    sourceVersion: 'static-2026-06',
    fetchedAt: Date.now(),
  };
}

function parseLiveFeed(raw: string): NormalisedEntity[] {
  // Best-effort CSV/TSV parse for whatever export is published at FEED_TR_MASAK.
  // Expected columns (case-insensitive): name | aliases | type | program | reference.
  const lines = raw.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = (lines[0] ?? '').includes('\t') ? '\t' : ',';
  const headers = (lines[0] ?? '').split(sep).map((h) => h.replace(/^"|"$/g, '').trim().toLowerCase());
  const entities: NormalisedEntity[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = (lines[i] ?? '').split(sep).map((v) => v.replace(/^"|"$/g, '').trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });
    const name = (row['name'] ?? row['unvan'] ?? row['ad soyad'] ?? row['entity'] ?? '').trim();
    if (!name) continue;
    const aliases = (row['aliases'] ?? row['takma ad'] ?? '')
      .split(/[;|]/)
      .map((a) => a.trim())
      .filter(Boolean);
    const rawType = (row['type'] ?? row['tür'] ?? '').toLowerCase();
    const type: EntityType = /indiv|kişi|şahıs|person/.test(rawType) ? 'individual' : 'entity';
    const program = (row['program'] ?? row['karar'] ?? 'LAW_6415_TERROR_FREEZE').trim();
    const reference = (row['reference'] ?? row['ref'] ?? '').trim();
    const id = `tr_masak:live:${syncId(name + i)}`;
    entities.push({
      id,
      name,
      aliases,
      type,
      nationalities: [],
      jurisdictions: ['TR'],
      identifiers: {},
      addresses: [],
      listings: [mkListing('tr_masak', {
        program,
        reference: reference || id,
        authorityUrl: 'https://masak.hmb.gov.tr',
      })],
      source: 'tr_masak',
      fetchedAt: Date.now(),
    });
  }
  return entities;
}

export const trMasakAdapter: SourceAdapter = {
  id: 'tr_masak',
  displayName: 'MASAK — Turkey Frozen Assets (Law 6415 / 7262)',
  sourceUrl: SOURCE_URL || 'https://masak.hmb.gov.tr',
  isEnabled: () => true,
  async fetch() {
    const errors: string[] = [];

    if (SOURCE_URL) {
      try {
        const raw = await fetchText(SOURCE_URL, { timeoutMs: FETCH_TIMEOUT_MS });
        const entities = parseLiveFeed(raw);
        if (entities.length > 0) {
          const rawChecksum = await sha256Hex(entities.map((e) => e.id).join(','));
          return { entities, rawChecksum, sourceVersion: `live-${new Date().toISOString().slice(0, 10)}` };
        }
      } catch (err) {
        errors.push(`live fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Fall back to curated static seed.
    const entities = STATIC_SEED.map((s, i) => seedToEntity(s, i));
    const rawChecksum = await sha256Hex(entities.map((e) => e.id).join(','));
    return { entities, rawChecksum, sourceVersion: 'static-2026-06' };
  },
};
