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

// Registry consumed by netlify/functions/refresh-lists.ts cron.
// Order is informational; each adapter runs independently.
//
// Jurisdiction coverage as of 2026-05:
//   · UN (Security Council Consolidated)
//   · US (OFAC SDN + Consolidated Non-SDN)
//   · EU (CFSP consolidated)
//   · UK (OFSI consolidated)
//   · CA (OSFI / SEMA consolidated)        ← added
//   · CH (SECO Gesamtliste)                ← added
//   · FATF (call-for-action / monitoring)
//   · UAE (EOCN + Local Terrorist List)
//
// Australia (DFAT) and Japan (MOF) are documented system-card coverage
// but require XLSX / PDF parsing to ingest — deferred until an
// xlsx/pdf-parser dependency is added.
export const SOURCE_ADAPTERS: readonly SourceAdapter[] = [
  unConsolidatedAdapter,
  ofacSdnAdapter,
  ofacConsAdapter,
  euFsfAdapter,
  ukOfsiAdapter,
  caOsfiAdapter,
  chSecoAdapter,
  auDfatAdapter,      // opt-in: requires 'exceljs' for XLSX parsing
  jpMofAdapter,       // opt-in: requires 'exceljs' + FEED_JP_MOF env (per-country URLs)
  fatfAdapter,
  uaeEocnXlsxAdapter,  // opt-in: XLSX-fetched EOCN list from uaeiec.gov.ae
  uaeLtlXlsxAdapter,   // opt-in: XLSX-fetched UAE Terrorist List (FileID c2b2f915-...)
];
