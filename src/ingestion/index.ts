// Hawkeye Sterling — ingestion barrel.
export * from './opensanctions.js';
export * from './adverse-media.js';
export * from './ftm-mapper.js';   // FollowTheMoney entity mapper (alephdata/ftm)

import type { SourceAdapter } from './types.js';
import { euFsfAdapter } from './sources/eu-fsf.js';
import { fatfAdapter } from './sources/fatf.js';
import { ofacConsAdapter } from './sources/ofac-cons.js';
import { ofacSdnAdapter } from './sources/ofac-sdn.js';
import { uaeEocnXlsxAdapter } from './sources/uae-eocn-xlsx.js';
import { uaeLtlXlsxAdapter } from './sources/uae-ltl-xlsx.js';
import { ukOfsiAdapter } from './sources/uk-ofsi.js';
import { unConsolidatedAdapter } from './sources/un-consolidated.js';
import { caOsfiAdapter } from './sources/ca-osfi.js';
import { chSecoAdapter } from './sources/ch-seco.js';
import { auDfatAdapter } from './sources/au-dfat.js';
import { jpMofAdapter } from './sources/jp-mof.js';
import { jpMetiAdapter } from './sources/jp-meti.js';
import { interpolRedAdapter } from './sources/interpol.js';
import { bisEntityAdapter } from './sources/bis-entity.js';
import { uaeMoeDesignatedAdapter } from './sources/uae-moe-designated.js';
import { fincen314aAdapter } from './sources/fincen-314a.js';
import { trMasakAdapter } from './sources/tr-masak.js';

// Registry consumed by netlify/functions/refresh-lists.ts cron.
// Order is informational; each adapter runs independently.
//
// Jurisdiction coverage as of 2026-05:
//   · UN (Security Council Consolidated)
//   · US (OFAC SDN + Consolidated Non-SDN + BIS Entity List)
//   · EU (CFSP consolidated)
//   · UK (OFSI consolidated)
//   · CA (OSFI / SEMA consolidated)
//   · CH (SECO Gesamtliste)
//   · AU (DFAT Consolidated)
//   · JP (MOF sanctions + METI export controls)
//   · FATF (call-for-action / monitoring)
//   · UAE (EOCN + Local Terrorist List + MoE Designated)
//   · Interpol (Red Notices)
//   · FinCEN (314a advisories)
//   · TR (MASAK domestic terror/proliferation freeze — Law 6415/7262)
export const SOURCE_ADAPTERS: readonly SourceAdapter[] = [
  unConsolidatedAdapter,
  ofacSdnAdapter,
  ofacConsAdapter,
  euFsfAdapter,
  ukOfsiAdapter,
  caOsfiAdapter,
  chSecoAdapter,
  auDfatAdapter,              // opt-in: requires 'exceljs' for XLSX parsing
  jpMofAdapter,               // opt-in: requires 'exceljs' + FEED_JP_MOF env (per-country URLs)
  jpMetiAdapter,              // opt-in: set FEED_JP_METI for live data; static seed active
  fatfAdapter,
  uaeEocnXlsxAdapter,         // opt-in: XLSX-fetched EOCN list from uaeiec.gov.ae
  uaeLtlXlsxAdapter,          // opt-in: XLSX-fetched UAE Terrorist List
  uaeMoeDesignatedAdapter,    // opt-in: set FEED_UAE_MOE_DESIGNATED for live data
  interpolRedAdapter,         // live: Interpol public Red Notice API (no key required)
  bisEntityAdapter,           // opt-in: set FEED_BIS_ENTITY for live BIS Entity List CSV
  fincen314aAdapter,          // opt-in: set FINCEN_314A_API_KEY + FINCEN_314A_ENDPOINT
  trMasakAdapter,             // live via FEED_TR_MASAK; curated static seed otherwise
];
