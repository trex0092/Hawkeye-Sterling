import { getJson, setJson, del, listKeys } from "@/lib/server/store";
import type { CaseRecord } from "@/lib/types";

// Server-side case vault — tenant-scoped, per-case Blob storage.
//
// Storage layout:
//   hawkeye-cases/<tenant>/_index.json         lightweight index for listing
//   hawkeye-cases/<tenant>/cases/<caseId>.json full CaseRecord
//   hawkeye-cases/<tenant>/_meta.json          { lastChangeAt } — bumped on
//                                                every write so SSE pollers
//                                                detect changes without
//                                                fetching the index
//
// The index carries only { id, lastActivity, subject } so listing remains
// cheap as case count grows. The full record fetch is one blob read per
// case open, which is acceptable for the typical workflow (operator
// browses the index, opens one case at a time).
//
// Migration: on first read of a tenant's vault, if the legacy single-blob
// format exists at hawkeye-cases/all.v1.json, it's split into per-case
// blobs under the "portal" tenant and the legacy blob is deleted. Idempotent.

const LEGACY_KEY = "hawkeye-cases/all.v1.json";

interface IndexEntry {
  id: string;
  lastActivity: string;
  subject: string;
}

interface IndexFile {
  version: 2;
  updatedAt: string;
  entries: IndexEntry[];
}

interface MetaFile {
  lastChangeAt: string;
  lastChangeKind?: "write" | "delete" | "merge";
}

interface LegacyVaultPayload {
  version: 1;
  updatedAt: string;
  cases: CaseRecord[];
}

function tenantPrefix(tenantId: string): string {
  // Strip path-unsafe characters; truncate so the blob key stays under
  // the platform's typical 1024-byte limit even with long case ids.
  const safe = tenantId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64);
  return `hawkeye-cases/${safe}`;
}

function indexKey(tenant: string): string {
  return `${tenantPrefix(tenant)}/_index.json`;
}

function metaKey(tenant: string): string {
  return `${tenantPrefix(tenant)}/_meta.json`;
}

function caseKey(tenant: string, caseId: string): string {
  const safe = caseId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128);
  return `${tenantPrefix(tenant)}/cases/${safe}.json`;
}

function entryFromCase(c: CaseRecord): IndexEntry {
  return { id: c.id, lastActivity: c.lastActivity, subject: c.subject };
}

async function readIndex(tenant: string): Promise<IndexFile> {
  const idx = await getJson<IndexFile>(indexKey(tenant));
  if (idx && Array.isArray(idx.entries)) return idx;
  return { version: 2, updatedAt: new Date(0).toISOString(), entries: [] };
}

async function writeIndex(tenant: string, entries: IndexEntry[]): Promise<void> {
  const sorted = [...entries].sort((a, b) =>
    a.lastActivity < b.lastActivity ? 1 : -1,
  );
  const idx: IndexFile = {
    version: 2,
    updatedAt: new Date().toISOString(),
    entries: sorted,
  };
  await setJson(indexKey(tenant), idx);
}

async function bumpMeta(
  tenant: string,
  kind: MetaFile["lastChangeKind"],
): Promise<void> {
  const meta: MetaFile = {
    lastChangeAt: new Date().toISOString(),
    lastChangeKind: kind,
  };
  await setJson(metaKey(tenant), meta);
}

// Read the lastChange timestamp without fetching every case — used by the
// SSE poll loop to know whether anything's moved.
export async function readLastChangeAt(tenant: string): Promise<string> {
  const meta = await getJson<MetaFile>(metaKey(tenant));
  return meta?.lastChangeAt ?? new Date(0).toISOString();
}

// One-shot legacy migration: if hawkeye-cases/all.v1.json exists, split it
// into per-case blobs under the "portal" tenant. Runs at most once per
// process — re-running is cheap (no-op if the legacy blob is gone).
let legacyMigrationDone = false;

async function maybeMigrateLegacy(): Promise<void> {
  if (legacyMigrationDone) return;
  legacyMigrationDone = true;
  try {
    const legacy = await getJson<LegacyVaultPayload>(LEGACY_KEY);
    if (!legacy || !Array.isArray(legacy.cases)) return;
    const tenant = "portal";
    for (const c of legacy.cases) {
      await setJson(caseKey(tenant, c.id), c);
    }
    await writeIndex(tenant, legacy.cases.map(entryFromCase));
    await bumpMeta(tenant, "merge");
    await del(LEGACY_KEY).catch(() => {});
  } catch (err) {
    console.warn("[case-vault] legacy migration failed", err);
  }
}

export async function loadAllCases(tenant: string): Promise<CaseRecord[]> {
  await maybeMigrateLegacy();
  const idx = await readIndex(tenant);
  if (idx.entries.length === 0) return [];
  // Fan-out reads: one blob per case. Capped at 200 cases per fetch to
  // bound function runtime — beyond that the operator should paginate
  // (or the index API should evolve to surface lazy fetches).
  const cap = 200;
  const fetched = await Promise.all(
    idx.entries.slice(0, cap).map((e) => getJson<CaseRecord>(caseKey(tenant, e.id))),
  );
  return fetched.filter((c): c is CaseRecord => c != null);
}

export async function loadCase(
  tenant: string,
  id: string,
): Promise<CaseRecord | null> {
  await maybeMigrateLegacy();
  const c = await getJson<CaseRecord>(caseKey(tenant, id));
  return c ?? null;
}

// Merge `incoming` (client state) with the existing per-case storage.
// Strategy: per-case last-write-wins on lastActivity. Cases present
// only on one side are preserved. Uses individual blob writes so a
// failure on one case doesn't roll back the rest of the merge.
export async function mergeCases(
  tenant: string,
  incoming: CaseRecord[],
): Promise<CaseRecord[]> {
  await maybeMigrateLegacy();
  const idx = await readIndex(tenant);
  const indexById = new Map(idx.entries.map((e) => [e.id, e]));
  const incomingById = new Map(incoming.map((c) => [c.id, c]));

  const writes: Promise<unknown>[] = [];
  // Merge: for every incoming record, decide if it's newer than the
  // existing index entry, and only write when it is.
  for (const c of incoming) {
    const prior = indexById.get(c.id);
    if (!prior || c.lastActivity >= prior.lastActivity) {
      writes.push(setJson(caseKey(tenant, c.id), c));
      indexById.set(c.id, entryFromCase(c));
    }
  }

  await Promise.all(writes);

  // Resolve full records for the response: refetch any case the
  // client didn't send so the merged set is complete.
  const merged: CaseRecord[] = [];
  for (const e of indexById.values()) {
    const incomingRec = incomingById.get(e.id);
    if (incomingRec && incomingRec.lastActivity >= e.lastActivity) {
      merged.push(incomingRec);
    } else {
      const existing = await getJson<CaseRecord>(caseKey(tenant, e.id));
      if (existing) merged.push(existing);
    }
  }
  await writeIndex(tenant, Array.from(indexById.values()));
  await bumpMeta(tenant, "merge");
  return merged.sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));
}

export async function saveAllCases(
  tenant: string,
  cases: CaseRecord[],
): Promise<void> {
  await maybeMigrateLegacy();
  // Authoritative replace — writes every case + the index. Used by PUT
  // (admin reset). Doesn't delete cases that exist server-side but not
  // in `cases`; for that path use deleteCaseById per-id or call PUT
  // with the full intended set.
  await Promise.all(
    cases.map((c) => setJson(caseKey(tenant, c.id), c)),
  );
  await writeIndex(tenant, cases.map(entryFromCase));
  await bumpMeta(tenant, "write");
}

export async function deleteCaseById(
  tenant: string,
  id: string,
): Promise<CaseRecord[]> {
  await maybeMigrateLegacy();
  await del(caseKey(tenant, id)).catch(() => {});
  const idx = await readIndex(tenant);
  const next = idx.entries.filter((e) => e.id !== id);
  if (next.length !== idx.entries.length) {
    await writeIndex(tenant, next);
    await bumpMeta(tenant, "delete");
  }
  return loadAllCases(tenant);
}

// Best-effort tenant listing for ops / regulator audits. Streams blob
// keys under hawkeye-cases/* and de-dupes the tenant slug. Capped at
// 1k tenants to bound runtime.
export async function listTenants(): Promise<string[]> {
  const keys = await listKeys("hawkeye-cases/");
  const tenants = new Set<string>();
  for (const k of keys) {
    const m = k.match(/^hawkeye-cases\/([^/]+)\//);
    if (m && m[1] && m[1] !== "all.v1.json") tenants.add(m[1]);
  }
  return Array.from(tenants).slice(0, 1000);
}
