// J-04 + J-05 audit-trail enrichment helper.
//
// At the time of every screening event we must record WHICH version of each
// sanctions list was active and WHAT match threshold the call used. Regulators
// asking "what did the list show on date X" need this snapshot in the
// tamper-evident chain — not derived later from a separately-mutating blob.
//
// Schema written into AuditChainEvent.body alongside the existing fields:
//
//   listVersions: {
//     un_consolidated: { entityCount, fetchedAt, sha256? }  // null if blob missing
//     ofac_sdn:       { entityCount, fetchedAt, sha256? }
//     ...
//   }
//   matchThreshold: <number>   // the threshold value the call used (0..1)
//
// This module is intentionally framework-free. The store handle is passed in
// so the helper is fully unit-testable without Blobs.
//
// Audit citations:
//   J-04 — list version logging at screening time
//   J-05 — match threshold logging at screening time
//   FDL 10/2025 Art.24 — evidence integrity for compliance examinations
//   CR 134/2025 — record-keeping for sanctions screening events

export interface ListVersionStore {
  /** Returns the parsed JSON blob for the given key, or null when absent.
   *  Must not throw on missing keys — return null instead. The parameters
   *  are prefixed with `_` to satisfy the no-unused-vars rule on interface
   *  declarations (this is the contract, not an implementation). */
  get(_key: string, _opts: { type: "json" }): Promise<unknown>;
}

export interface ListVersionSnapshot {
  /** Count of entities present in the blob at snapshot time. */
  entityCount: number;
  /** ISO-8601 timestamp of the last successful fetch from the upstream source. */
  fetchedAt: string | null;
  /** SHA-256 of the raw upstream payload when available. Lets a regulator
   *  verify that a re-downloaded list matches the bytes used at decision time. */
  sha256?: string;
}

/** The set of list IDs that we snapshot into every screening audit entry.
 *  Must stay in sync with MANDATORY_LIST_IDS in web/app/api/health/route.ts
 *  PLUS the supplementary lists every quick-screen call also consults so the
 *  audit record reflects the complete corpus used. */
export const SNAPSHOT_LIST_IDS = [
  "uae_eocn",
  "uae_ltl",
  "un_consolidated",
  "ofac_sdn",
  "eu_fsf",
  "uk_ofsi",
  "ca_osfi",
  "ch_seco",
  "au_dfat",
  "fatf",
] as const;

export type SnapshotListId = (typeof SNAPSHOT_LIST_IDS)[number];

export interface CapturedListVersions {
  /** Per-list snapshot. `null` means the blob was not present at capture time
   *  (vs `{ entityCount: 0, ... }` which means present but empty — a real
   *  CORPUS_INCOMPLETE signal). */
  versions: Record<string, ListVersionSnapshot | null>;
  /** Overall capture timestamp — when this helper was called, not when each
   *  list was last fetched. Useful for diagnosing slow-fetch ordering. */
  capturedAt: string;
  /** True if the store itself was unavailable. When true, `versions` is empty
   *  and downstream consumers should treat the audit record as ambiguous. */
  storeUnavailable: boolean;
}

interface ListBlobShape {
  metadata?: {
    entityCount?: unknown;
    fetchedAt?: unknown;
    sha256?: unknown;
  };
  entities?: unknown;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function deriveEntityCount(blob: ListBlobShape): number {
  const fromMeta = readNumber(blob.metadata?.entityCount);
  if (fromMeta !== null) return fromMeta;
  // Fallback: count the entities array directly. Defensive coercion in case
  // a malformed upstream wrote a non-array — never throw.
  return Array.isArray(blob.entities) ? blob.entities.length : 0;
}

/** Read a single list blob and project it to the audit-shaped snapshot.
 *  Returns null when the blob is absent or unparseable — never throws. */
async function snapshotOne(
  store: ListVersionStore,
  listId: string,
): Promise<ListVersionSnapshot | null> {
  let raw: unknown;
  try {
    raw = await store.get(`${listId}/latest.json`, { type: "json" });
  } catch {
    // A single per-list read failure must not corrupt the whole audit entry.
    return null;
  }
  if (raw === null || typeof raw !== "object") return null;
  const blob = raw as ListBlobShape;
  const entityCount = deriveEntityCount(blob);
  const fetchedAt = readString(blob.metadata?.fetchedAt);
  const sha256 = readString(blob.metadata?.sha256);
  const snap: ListVersionSnapshot = { entityCount, fetchedAt };
  if (sha256) snap.sha256 = sha256;
  return snap;
}

/** Capture a snapshot of every audit-relevant list at this instant. Used at
 *  the start of a screening operation so the audit entry can record exactly
 *  what corpus produced the verdict. Read errors on individual lists become
 *  `null` entries; a wholesale store outage is surfaced via storeUnavailable. */
export async function captureListVersions(
  store: ListVersionStore | null,
  listIds: readonly string[] = SNAPSHOT_LIST_IDS,
): Promise<CapturedListVersions> {
  const capturedAt = new Date().toISOString();
  if (!store) {
    return { versions: {}, capturedAt, storeUnavailable: true };
  }
  const entries = await Promise.all(
    listIds.map(async (id) => [id, await snapshotOne(store, id)] as const),
  );
  const versions: Record<string, ListVersionSnapshot | null> = {};
  for (const [id, snap] of entries) {
    versions[id] = snap;
  }
  return { versions, capturedAt, storeUnavailable: false };
}

/** Normalise a match threshold supplied by a caller. Anything outside [0, 1]
 *  is clamped (defensive) and an absent / non-numeric value falls back to the
 *  documented system default. The default is also exported so callers can
 *  reuse it without duplicating the magic number. */
export const DEFAULT_MATCH_THRESHOLD = 0.85;

export function normaliseMatchThreshold(value: unknown): number {
  const n = readNumber(value);
  if (n === null) return DEFAULT_MATCH_THRESHOLD;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Build the audit-chain body fragment that screening routes spread into
 *  their writeAuditChainEntry call. Centralised so the shape stays consistent
 *  across every screening route. */
export interface ListVersionAuditFields {
  listVersions: Record<string, ListVersionSnapshot | null>;
  listVersionsCapturedAt: string;
  listVersionsStoreUnavailable: boolean;
  matchThreshold: number;
}

export function buildListVersionAuditFields(
  capture: CapturedListVersions,
  matchThreshold: unknown,
): ListVersionAuditFields {
  return {
    listVersions: capture.versions,
    listVersionsCapturedAt: capture.capturedAt,
    listVersionsStoreUnavailable: capture.storeUnavailable,
    matchThreshold: normaliseMatchThreshold(matchThreshold),
  };
}
