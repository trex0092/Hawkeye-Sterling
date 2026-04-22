// Hawkeye Sterling — ingestion barrel.
export * from './opensanctions.js';
export * from './adverse-media.js';

import type { SourceAdapter } from './types.js';
import { euFsfAdapter } from './sources/eu-fsf.js';
import { ofacConsAdapter } from './sources/ofac-cons.js';
import { ofacSdnAdapter } from './sources/ofac-sdn.js';
import { uaeEocnAdapter, uaeLtlAdapter } from './sources/uae-seed.js';
import { ukOfsiAdapter } from './sources/uk-ofsi.js';
import { unConsolidatedAdapter } from './sources/un-consolidated.js';

// Registry consumed by netlify/functions/refresh-lists.ts cron.
// Order is informational; each adapter runs independently.
export const SOURCE_ADAPTERS: readonly SourceAdapter[] = [
  unConsolidatedAdapter,
  ofacSdnAdapter,
  ofacConsAdapter,
  euFsfAdapter,
  ukOfsiAdapter,
  uaeEocnAdapter,
  uaeLtlAdapter,
];
