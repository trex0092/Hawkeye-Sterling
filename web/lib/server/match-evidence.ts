// J-07 — match-evidence archiving at resolve time.
//
// When an MLRO dispositions a hit, the audit chain must record the FULL
// sanctions list entry as it appeared at that exact moment. The caller's
// hitContext (sourceList, matchedName, matchStrength, listRef) tells us
// WHICH entry to fetch; this helper does the fetch and projects to a
// stable audit-shaped record. If a regulator later asks "what did the
// list show for that entity on that date", the snapshot stored alongside
// the disposition is the answer — no need to reconstruct from list history.
//
// Schema written into AuditChainEvent.body.matchEvidence:
//
//   {
//     listId:      "ofac_sdn",
//     listRef:     "12345",
//     fetchedAt:   "2026-05-19T03:00:00.000Z",   // when the list itself was last refreshed
//     snapshottedAt: "2026-05-20T15:00:00.000Z", // when this disposition fired
//     entity: {
//       id, name, aliases[], type, nationalities[], dateOfBirth?,
//       identifiers{}, addresses[],
//       listings: [{ source, program?, reference?, designatedAt?, authorityUrl? }],
//     } | null     // null = listRef not found in the list at snapshot time
//                  //        (already-removed designation, or wrong listRef)
//   }

export interface MatchEvidenceStore {
  /** Returns the parsed JSON blob for the given key, or null when absent.
   *  Must not throw on missing keys — return null instead. */
  get(_key: string, _opts: { type: "json" }): Promise<unknown>;
}

export interface MatchEvidenceEntity {
  id?: string;
  name?: string;
  aliases?: string[];
  type?: string;
  nationalities?: string[];
  dateOfBirth?: string;
  identifiers?: Record<string, string>;
  addresses?: string[];
  listings?: Array<{
    source?: string;
    program?: string;
    reference?: string;
    designatedAt?: string;
    authorityUrl?: string;
  }>;
}

export interface MatchEvidenceSnapshot {
  /** The list the hit came from. Mirrored from the resolve-route hitContext
   *  so a reader doesn't need to cross-reference. */
  listId: string;
  /** The list-specific reference (SDN entry number, EU FSF id, etc.) the
   *  hit was matched against. Pass-through from hitContext. */
  listRef: string;
  /** When the underlying list blob was last refreshed by the ingestion
   *  pipeline. Null when the blob lacked a fetchedAt metadata field. */
  fetchedAt: string | null;
  /** When this snapshot was captured — at disposition time. */
  snapshottedAt: string;
  /** The canonical sanctions entry as it appeared in the list at
   *  snapshot time. Null means listRef did not match any entry in the
   *  list (typically: the designation was removed between the original
   *  screen and the disposition). */
  entity: MatchEvidenceEntity | null;
}

interface ListBlobShape {
  metadata?: { fetchedAt?: unknown };
  entities?: unknown;
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function pickStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((x): x is string => typeof x === "string" && x.length > 0);
  return out.length > 0 ? out : undefined;
}

function pickStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function pickListings(value: unknown): MatchEvidenceEntity["listings"] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: NonNullable<MatchEvidenceEntity["listings"]> = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const l = raw as Record<string, unknown>;
    const entry: NonNullable<MatchEvidenceEntity["listings"]>[number] = {};
    const source = pickString(l.source); if (source !== undefined) entry.source = source;
    const program = pickString(l.program); if (program !== undefined) entry.program = program;
    const reference = pickString(l.reference); if (reference !== undefined) entry.reference = reference;
    const designatedAt = pickString(l.designatedAt); if (designatedAt !== undefined) entry.designatedAt = designatedAt;
    const authorityUrl = pickString(l.authorityUrl); if (authorityUrl !== undefined) entry.authorityUrl = authorityUrl;
    if (Object.keys(entry).length > 0) out.push(entry);
  }
  return out.length > 0 ? out : undefined;
}

/** Project an arbitrary list-entity record (from Blobs) to the audit-shaped
 *  MatchEvidenceEntity. Defensive against malformed shapes — every field
 *  falls back gracefully so a single corrupt key never blocks the snapshot. */
export function projectEntity(raw: unknown): MatchEvidenceEntity | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const entity: MatchEvidenceEntity = {};
  const id = pickString(r.id); if (id !== undefined) entity.id = id;
  const name = pickString(r.name); if (name !== undefined) entity.name = name;
  const aliases = pickStringArray(r.aliases); if (aliases !== undefined) entity.aliases = aliases;
  const type = pickString(r.type); if (type !== undefined) entity.type = type;
  const nationalities = pickStringArray(r.nationalities); if (nationalities !== undefined) entity.nationalities = nationalities;
  const dateOfBirth = pickString(r.dateOfBirth); if (dateOfBirth !== undefined) entity.dateOfBirth = dateOfBirth;
  const identifiers = pickStringRecord(r.identifiers); if (identifiers !== undefined) entity.identifiers = identifiers;
  const addresses = pickStringArray(r.addresses); if (addresses !== undefined) entity.addresses = addresses;
  const listings = pickListings(r.listings); if (listings !== undefined) entity.listings = listings;
  return Object.keys(entity).length > 0 ? entity : null;
}

/** Find an entity in a list-blob's entities array by listRef. Looks for:
 *   1. listings[*].reference === listRef
 *   2. id === listRef
 *   3. id ends with `:${listRef}` (some adapters prefix the id with listId:)
 *  Returns the first match — never throws. */
export function findEntityByListRef(
  blob: ListBlobShape | null,
  listRef: string,
): unknown | null {
  if (!blob || !Array.isArray(blob.entities)) return null;
  const target = listRef.trim();
  if (!target) return null;
  for (const raw of blob.entities) {
    if (!raw || typeof raw !== "object") continue;
    const ent = raw as Record<string, unknown>;
    // 1. listings[*].reference match
    if (Array.isArray(ent.listings)) {
      for (const l of ent.listings) {
        const ref = (l as Record<string, unknown>)?.reference;
        if (typeof ref === "string" && ref === target) return raw;
      }
    }
    // 2. id exact match
    if (typeof ent.id === "string" && ent.id === target) return raw;
    // 3. id suffix match (e.g., ofac_sdn:12345 when listRef is 12345)
    if (typeof ent.id === "string" && ent.id.endsWith(`:${target}`)) return raw;
  }
  return null;
}

/** Capture the canonical match-evidence snapshot for a single hit at
 *  disposition time. Returns a fully-formed MatchEvidenceSnapshot whose
 *  `entity` may be null if the listRef cannot be located (already-removed
 *  designation, wrong reference, list unavailable). Never throws. */
export async function captureMatchEvidence(
  store: MatchEvidenceStore | null,
  listId: string,
  listRef: string,
  now: Date = new Date(),
): Promise<MatchEvidenceSnapshot> {
  const snap: MatchEvidenceSnapshot = {
    listId,
    listRef,
    fetchedAt: null,
    snapshottedAt: now.toISOString(),
    entity: null,
  };
  if (!store) return snap;
  let raw: unknown;
  try {
    raw = await store.get(`${listId}/latest.json`, { type: "json" });
  } catch {
    return snap;
  }
  if (!raw || typeof raw !== "object") return snap;
  const blob = raw as ListBlobShape;
  const fetched = pickString(blob.metadata?.fetchedAt);
  if (fetched !== undefined) snap.fetchedAt = fetched;
  const match = findEntityByListRef(blob, listRef);
  snap.entity = projectEntity(match);
  return snap;
}
