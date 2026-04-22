// Hawkeye Sterling — watchlist parser contracts.
// Adapter SHAPES for the public watchlist formats. Real ingest happens in
// Phase 2; this file fixes the typed contracts so all consumers (matching,
// engine, narrative composer) bind to a stable surface today.

export interface NormalisedListEntry {
  listId: string;             // e.g. 'ofac_sdn'
  sourceRef: string;          // upstream identifier (e.g. SDN UID)
  primaryName: string;
  aliases: string[];
  entityType: 'individual' | 'organisation' | 'vessel' | 'aircraft' | 'other';
  identifiers: Array<{ kind: string; number: string; issuer?: string }>;
  nationalities?: string[];
  addresses?: Array<{ country?: string; city?: string; line?: string }>;
  programs?: string[];        // sanctions programmes / designations
  remarks?: string;
  publishedAt?: string;
  ingestedAt: string;
  rawHash: string;            // sha/fnv of raw record for tamper / dedup
}

export interface WatchlistAdapter {
  listId: string;
  format: 'xml' | 'json' | 'csv' | 'tsv' | 'pdf';
  authoritativeUrlEnvKey: string;
  parse: (raw: string) => NormalisedListEntry[];
  validate: (entry: NormalisedListEntry) => string[]; // list of validation errors
}

// Stub adapters (real parsing in Phase 2). Each parser throws if invoked
// with incompatible content — guarantees no silent ingestion of garbage.

export const UN_CONSOLIDATED_ADAPTER: WatchlistAdapter = {
  listId: 'un_1267',
  format: 'xml',
  authoritativeUrlEnvKey: 'UN_CONSOLIDATED_URL',
  parse: () => { throw new Error('Phase-2: UN consolidated XML parser not yet implemented'); },
  validate: (e) => validateCommon(e),
};

export const OFAC_SDN_ADAPTER: WatchlistAdapter = {
  listId: 'ofac_sdn',
  format: 'xml',
  authoritativeUrlEnvKey: 'OFAC_SDN_URL',
  parse: () => { throw new Error('Phase-2: OFAC SDN XML parser not yet implemented'); },
  validate: (e) => validateCommon(e),
};

export const OFAC_CONS_ADAPTER: WatchlistAdapter = {
  listId: 'ofac_cons',
  format: 'xml',
  authoritativeUrlEnvKey: 'OFAC_CONS_URL',
  parse: () => { throw new Error('Phase-2: OFAC Consolidated XML parser not yet implemented'); },
  validate: (e) => validateCommon(e),
};

export const EU_FSF_ADAPTER: WatchlistAdapter = {
  listId: 'eu_consolidated',
  format: 'xml',
  authoritativeUrlEnvKey: 'EU_FSF_URL',
  parse: () => { throw new Error('Phase-2: EU FSF XML parser not yet implemented'); },
  validate: (e) => validateCommon(e),
};

export const UK_OFSI_ADAPTER: WatchlistAdapter = {
  listId: 'uk_ofsi',
  format: 'xml',
  authoritativeUrlEnvKey: 'UK_OFSI_URL',
  parse: () => { throw new Error('Phase-2: UK OFSI XML parser not yet implemented'); },
  validate: (e) => validateCommon(e),
};

export const UAE_EOCN_ADAPTER: WatchlistAdapter = {
  listId: 'uae_eocn',
  format: 'pdf',
  authoritativeUrlEnvKey: 'UAE_EOCN_URL',
  parse: () => { throw new Error('Phase-2: UAE EOCN PDF parser not yet implemented'); },
  validate: (e) => validateCommon(e),
};

export const UAE_LOCAL_TERRORIST_ADAPTER: WatchlistAdapter = {
  listId: 'uae_local_terrorist',
  format: 'pdf',
  authoritativeUrlEnvKey: 'UAE_EOCN_URL',
  parse: () => { throw new Error('Phase-2: UAE Local Terrorist List parser not yet implemented'); },
  validate: (e) => validateCommon(e),
};

export const ADAPTERS: Record<string, WatchlistAdapter> = {
  un_1267: UN_CONSOLIDATED_ADAPTER,
  ofac_sdn: OFAC_SDN_ADAPTER,
  ofac_cons: OFAC_CONS_ADAPTER,
  eu_consolidated: EU_FSF_ADAPTER,
  uk_ofsi: UK_OFSI_ADAPTER,
  uae_eocn: UAE_EOCN_ADAPTER,
  uae_local_terrorist: UAE_LOCAL_TERRORIST_ADAPTER,
};

function validateCommon(e: NormalisedListEntry): string[] {
  const errs: string[] = [];
  if (!e.listId) errs.push('listId missing');
  if (!e.sourceRef) errs.push('sourceRef missing');
  if (!e.primaryName) errs.push('primaryName missing');
  if (!e.entityType) errs.push('entityType missing');
  if (!e.ingestedAt) errs.push('ingestedAt missing');
  if (!e.rawHash) errs.push('rawHash missing (tamper-evidence required)');
  return errs;
}
