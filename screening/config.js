/**
 * Configuration for the unified screening module.
 *
 * Sources are declared here with their official download URLs. The URLs
 * point at the publisher's canonical endpoint — if a publisher changes
 * their URL, this is the only file that needs updating.
 *
 * Every URL listed is publicly accessible without authentication. That is
 * deliberate: the module must be runnable on any laptop or CI without
 * enterprise data contracts.
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Root directory for all screening artefacts. Can be overridden via env.
export const DATA_DIR = process.env.HAWKEYE_SCREENING_DIR
  ? process.env.HAWKEYE_SCREENING_DIR
  : join(__dirname, '..', '.screening');

export const PATHS = {
  dataDir: DATA_DIR,
  cacheDir: join(DATA_DIR, 'cache'),
  storeFile: join(DATA_DIR, 'store.json'),
  auditFile: join(DATA_DIR, 'audit.log'),
  snapshotDir: join(DATA_DIR, 'snapshots'),
};

/**
 * Source registry. Each source exports an `ingest(ctx)` function from the
 * corresponding file in sources/.
 *
 * `priority` controls refresh order: high-priority sources refresh first
 * so that if a lower-priority source fails, the critical lists are
 * already up-to-date.
 *
 * OpenSanctions' `default` dataset already consolidates UN, OFAC SDN, EU,
 * UK OFSI, and many national lists plus PEPs — using it as the primary
 * source avoids duplicating a hundred individual parsers. The individual
 * adapters remain as authoritative backups and for jurisdictions that
 * insist on the publisher's own feed.
 */
export const SOURCES = [
  {
    id: 'opensanctions-default',
    name: 'OpenSanctions Default (consolidated sanctions + PEPs + crime)',
    module: './sources/opensanctions.js',
    url: 'https://data.opensanctions.org/datasets/latest/default/targets.simple.csv',
    license: 'CC-BY 4.0',
    priority: 100,
    enabled: true,
  },
  {
    id: 'un-consolidated',
    name: 'UN Security Council Consolidated List',
    module: './sources/un.js',
    url: 'https://scsanctions.un.org/resources/xml/en/consolidated.xml',
    license: 'Public domain (UN)',
    priority: 90,
    enabled: true,
  },
  {
    id: 'ofac-sdn',
    name: 'OFAC Specially Designated Nationals (SDN)',
    module: './sources/ofac.js',
    url: 'https://www.treasury.gov/ofac/downloads/sdn.csv',
    aliasUrl: 'https://www.treasury.gov/ofac/downloads/alt.csv',
    license: 'Public domain (US Government)',
    priority: 90,
    enabled: true,
  },
  {
    id: 'uk-ofsi',
    name: 'UK HM Treasury OFSI Consolidated List',
    module: './sources/uk.js',
    url: 'https://assets.publishing.service.gov.uk/media/sanctionslistconsolidatedlist.csv',
    license: 'Open Government Licence',
    priority: 85,
    enabled: true,
  },
  {
    id: 'eu-fsf',
    name: 'EU Financial Sanctions File',
    module: './sources/eu.js',
    // EU FSF requires a token for the XML feed; the public CSV mirror is
    // provided by OpenSanctions. Left here for configuration; disabled by
    // default so a missing token does not fail a refresh.
    url: 'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content',
    license: 'EU (conditions apply)',
    priority: 80,
    enabled: false,
  },
  {
    id: 'gdelt-adverse-media',
    name: 'GDELT Adverse Media Screening',
    module: './sources/adverse-media.js',
    url: 'https://api.gdeltproject.org/api/v2/doc/doc',
    license: 'GDELT Project (free for non-commercial research)',
    priority: 10,
    enabled: true,
    runtime: true, // queried per-subject, not bulk-ingested
  },
];

/**
 * Match thresholds. Override via env if an MLRO wants tighter/looser
 * recall. Values must stay in (0, 1) and remain ordered.
 */
export const THRESHOLDS = {
  reject: Number(process.env.HAWKEYE_T_REJECT || 0.62),
  low:    Number(process.env.HAWKEYE_T_LOW    || 0.72),
  medium: Number(process.env.HAWKEYE_T_MEDIUM || 0.82),
  high:   Number(process.env.HAWKEYE_T_HIGH   || 0.92),
};

/**
 * Cache TTLs. Sanctions lists rarely change more than daily; 12h lets a
 * twice-daily cron refresh avoid hammering publisher infrastructure.
 */
export const CACHE_TTL_MS = {
  sanctions: 12 * 60 * 60 * 1000, // 12h
  adverseMedia: 60 * 60 * 1000,   // 1h
};

/**
 * Map ISO jurisdictions → FATF list (high-risk / increased-monitoring).
 * Sourced from the FATF February 2026 statement. MUST be verified against
 * the latest FATF plenary outcome before each screening cycle. FATF publishes
 * updates three times per year (typically February, June, October).
 * Last verified: February 2026. Next verification due: June 2026 plenary.
 */
export const FATF_LISTS = {
  blacklist: ['IR', 'KP', 'MM'],                 // Iran, DPRK, Myanmar
  greylist: [                                    // Increased monitoring
    'AL', 'BG', 'BF', 'CM', 'HR', 'CD', 'HT', 'KE', 'LA', 'LB', 'MC',
    'MZ', 'NA', 'NG', 'PH', 'ZA', 'SS', 'SY', 'TZ', 'VE', 'VN', 'YE',
  ],
};
