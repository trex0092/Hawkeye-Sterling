// Hawkeye Sterling — ingestion barrel + registry.

import type { SourceAdapter } from './types.js';
import { unConsolidatedAdapter } from './sources/un-consolidated.js';
import { ofacSdnAdapter } from './sources/ofac-sdn.js';
import { ofacConsAdapter } from './sources/ofac-cons.js';
import { euFsfAdapter } from './sources/eu-fsf.js';
import { ukOfsiAdapter } from './sources/uk-ofsi.js';
import { uaeEocnAdapter, uaeLtlAdapter } from './sources/uae-seed.js';

export * from './types.js';
export * from './fetch-util.js';
export * from './xml-lite.js';
export * from './blobs-store.js';
export * from './matcher.js';

export const SOURCE_ADAPTERS: SourceAdapter[] = [
  unConsolidatedAdapter,
  ofacSdnAdapter,
  ofacConsAdapter,
  euFsfAdapter,
  ukOfsiAdapter,
  uaeEocnAdapter,
  uaeLtlAdapter,
];

export const SOURCE_ADAPTER_BY_ID = new Map(SOURCE_ADAPTERS.map((a) => [a.id, a]));
