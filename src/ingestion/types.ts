// Hawkeye Sterling — ingestion domain model.
// A NormalisedEntity is the post-parser, pre-storage shape emitted by every
// sanctions-source adapter. The matcher and the brain only see this shape.

export type EntityType = 'individual' | 'entity' | 'vessel' | 'aircraft' | 'wallet' | 'unknown';

export interface Listing {
  source: string;            // list-id (e.g. 'un_consolidated', 'ofac_sdn')
  program?: string;          // e.g. 'SYRIA', 'JCPOA-E.O.13599'
  reference?: string;        // SDN ID / UN ref / EU logical key
  designatedAt?: string;     // ISO date
  reason?: string;
  authorityUrl?: string;
}

export function mkListing(source: string, opts: {
  program?: string | undefined;
  reference?: string | undefined;
  designatedAt?: string | undefined;
  reason?: string | undefined;
  authorityUrl?: string | undefined;
}): Listing {
  const l: Listing = { source };
  if (opts.program) l.program = opts.program;
  if (opts.reference) l.reference = opts.reference;
  if (opts.designatedAt) l.designatedAt = opts.designatedAt;
  if (opts.reason) l.reason = opts.reason;
  if (opts.authorityUrl) l.authorityUrl = opts.authorityUrl;
  return l;
}

export interface NormalisedEntity {
  id: string;                // stable synthetic id — `${source}:${reference}`
  name: string;
  aliases: string[];
  type: EntityType;
  nationalities: string[];
  jurisdictions: string[];
  dateOfBirth?: string;
  dateOfIncorporation?: string;
  identifiers: Record<string, string>;  // passport, trade licence, LEI, IMO, wallet addr
  addresses: string[];
  listings: Listing[];       // list memberships — one entity may be on many lists
  source: string;            // primary source of this record
  sourceVersion?: string;
  fetchedAt: number;         // epoch ms
  notes?: string;
}

export interface IngestionReport {
  listId: string;
  sourceUrl?: string;
  recordCount: number;
  checksum: string;          // SHA-256 hex
  fetchedAt: number;
  durationMs: number;
  errors: string[];
}

export interface SourceAdapter {
  id: string;
  displayName: string;
  sourceUrl: string;
  fetch: () => Promise<{ entities: NormalisedEntity[]; rawChecksum: string; sourceVersion?: string }>;
  /**
   * When defined and returning false, run-all.ts skips this adapter entirely —
   * no blob is written and it is not counted as a failure. Use for opt-in
   * adapters that are dormant until a configuring env var is set.
   */
  isEnabled?: () => boolean;
}
