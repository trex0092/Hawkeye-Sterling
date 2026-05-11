// Item 14 — OpenSanctions full ingestion adapter (Control 10.03 / 12.04)
//
// OpenSanctions (opensanctions.org) publishes a free consolidated dataset of
// sanctioned individuals and entities from 100+ sources (OFAC, EU, UN, etc.).
// This adapter:
//   1. Fetches the OpenSanctions /entities API (dataset=default) in pages
//   2. Normalises entries to our internal SanctionsCandidate format
//   3. Caches the full dataset to Netlify Blobs under "os-full-dataset"
//   4. Provides a searchable index (name tokens → entity IDs)
//
// The free API tier allows ~1,000 req/day. Full dataset sync runs nightly
// via the pkyc-monitor Netlify function.  Real-time entity lookups hit the
// /match API for speed; this module handles the bulk snapshot.

export interface OSEntity {
  id: string;
  schema: string;           // "Person" | "Organization" | "Vessel" | ...
  caption: string;          // best display name
  properties: {
    name?: string[];
    alias?: string[];
    birthDate?: string[];
    nationality?: string[];
    country?: string[];
    program?: string[];
    topics?: string[];       // "sanction", "pep", "crime", etc.
    dataset?: string[];
    modifiedAt?: string[];
    address?: string[];
    passportNumber?: string[];
    idNumber?: string[];
  };
  datasets: string[];        // originating datasets
  referents: string[];       // IDs this entity references
  first_seen: string;
  last_seen: string;
  last_change: string;
}

export interface SanctionsCandidate {
  id: string;
  listId: string;           // e.g. "OS-OFAC" | "OS-UN" | "OS-EU"
  listRef: string;          // original list reference
  candidateName: string;
  aliases: string[];
  schema: string;
  score: number;            // will be set by fuzzy matcher, 0 here
  method: "exact" | "fuzzy" | "phonetic" | "alias" | "opensanctions";
  programs: string[];
  nationality?: string;
  country?: string;
  dob?: string;
  topics: string[];
  firstSeen: string;
  lastChange: string;
}

const OS_API_BASE = "https://api.opensanctions.org";
const OS_DATASET = "default"; // consolidated cross-source dataset
const BLOB_KEY_INDEX = "os-sanctions/index.json";
const BLOB_KEY_UPDATED = "os-sanctions/last-updated.json";

function osEntityToCandidate(entity: OSEntity): SanctionsCandidate {
  const p = entity.properties;
  const names = p.name ?? [];
  const primaryName = entity.caption || names[0] || entity.id;
  const aliases = [...new Set([...names, ...(p.alias ?? [])].filter((n) => n !== primaryName))];
  const listSources = entity.datasets.map((ds) => `OS-${ds.toUpperCase().slice(0, 12)}`);
  const listId = listSources[0] ?? "OS-DEFAULT";

  return {
    id: entity.id,
    listId,
    listRef: entity.id,
    candidateName: primaryName,
    aliases,
    schema: entity.schema,
    score: 0,
    method: "opensanctions",
    programs: p.program ?? [],
    nationality: (p.nationality ?? [])[0],
    country: (p.country ?? [])[0],
    dob: (p.birthDate ?? [])[0],
    topics: p.topics ?? [],
    firstSeen: entity.first_seen,
    lastChange: entity.last_change,
  };
}

// ── Blob helpers ─────────────────────────────────────────────────────────────

async function getBlobs(): Promise<any | null> {
  try {
    const mod = await import("@netlify/blobs").catch(() => null);
    if (!mod) return null;
    return mod.getStore({ name: "os-sanctions" });
  } catch {
    return null;
  }
}

// ── Freshness check ──────────────────────────────────────────────────────────

export async function getLastUpdated(): Promise<string | null> {
  const store = await getBlobs();
  if (!store) return null;
  const rec = await store.get(BLOB_KEY_UPDATED, { type: "json" }).catch(() => null) as { updatedAt?: string } | null;
  return rec?.updatedAt ?? null;
}

// ── Incremental fetch from OpenSanctions API ─────────────────────────────────

export interface SyncResult {
  fetched: number;
  stored: number;
  updatedAt: string;
  error?: string;
}

export async function syncOpenSanctions(apiKey?: string): Promise<SyncResult> {
  const store = await getBlobs();
  if (!store) return { fetched: 0, stored: 0, updatedAt: new Date().toISOString(), error: "Blobs unavailable" };

  const headers: Record<string, string> = { "Accept": "application/json" };
  if (apiKey) headers["Authorization"] = `ApiKey ${apiKey}`;

  let fetched = 0;
  let offset = 0;
  const limit = 500;
  const all: SanctionsCandidate[] = [];

  try {
    while (true) {
      const url = `${OS_API_BASE}/entities/?dataset=${OS_DATASET}&limit=${limit}&offset=${offset}&topics=sanction&topics=pep&schema=Person&schema=Organization`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`OpenSanctions API ${res.status}: ${errText.slice(0, 200)}`);
      }
      const data = (await res.json()) as { results: OSEntity[]; total: { value: number }; next?: string };
      const candidates = data.results.map(osEntityToCandidate);
      all.push(...candidates);
      fetched += candidates.length;
      if (!data.next || candidates.length < limit) break;
      offset += limit;
      // Safety cap: stop at 50k entities for MVP
      if (fetched >= 50_000) break;
    }

    // Build lightweight name-token index: token → [entity IDs]
    const nameIndex: Record<string, string[]> = {};
    for (const c of all) {
      const tokens = [c.candidateName, ...c.aliases]
        .flatMap((n) => n.toLowerCase().split(/\s+/))
        .filter((t) => t.length >= 3);
      for (const tok of tokens) {
        if (!nameIndex[tok]) nameIndex[tok] = [];
        if (!nameIndex[tok].includes(c.id)) nameIndex[tok].push(c.id);
      }
    }

    // Persist paginated chunks (Blobs 8MB/value limit)
    const CHUNK = 2_000;
    for (let i = 0; i < all.length; i += CHUNK) {
      await store.setJSON(`os-sanctions/entities-${Math.floor(i / CHUNK)}.json`, all.slice(i, i + CHUNK));
    }
    await store.setJSON(BLOB_KEY_INDEX, { index: nameIndex, chunkCount: Math.ceil(all.length / CHUNK), totalEntities: all.length });
    const updatedAt = new Date().toISOString();
    await store.setJSON(BLOB_KEY_UPDATED, { updatedAt, totalEntities: all.length });

    return { fetched, stored: all.length, updatedAt };
  } catch (err) {
    return {
      fetched,
      stored: 0,
      updatedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Real-time entity match via OpenSanctions /match API ─────────────────────

export interface MatchQuery {
  name: string;
  schema?: string;
  dob?: string;
  nationality?: string;
}

export interface MatchResult {
  id: string;
  score: number;
  caption: string;
  match: boolean;
  datasets: string[];
  topics: string[];
  properties: OSEntity["properties"];
}

export async function matchEntity(query: MatchQuery, apiKey?: string): Promise<MatchResult[]> {
  const headers: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json" };
  if (apiKey) headers["Authorization"] = `ApiKey ${apiKey}`;

  const body = {
    queries: {
      q: {
        schema: query.schema ?? "Person",
        properties: {
          name: [query.name],
          ...(query.dob ? { birthDate: [query.dob] } : {}),
          ...(query.nationality ? { nationality: [query.nationality] } : {}),
        },
      },
    },
  };

  try {
    const res = await fetch(`${OS_API_BASE}/match/${OS_DATASET}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { responses?: { q?: { results?: MatchResult[] } } };
    return data?.responses?.q?.results ?? [];
  } catch {
    return [];
  }
}

// ── Cached lookup by name tokens ─────────────────────────────────────────────

export async function lookupByName(name: string): Promise<SanctionsCandidate[]> {
  const store = await getBlobs();
  if (!store) return [];

  try {
    const indexRecord = await store.get(BLOB_KEY_INDEX, { type: "json" }).catch(() => null) as {
      index: Record<string, string[]>;
      chunkCount: number;
      totalEntities: number;
    } | null;

    if (!indexRecord?.index) return [];

    const tokens = name.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
    const candidateIds = new Set<string>();
    for (const tok of tokens) {
      for (const id of indexRecord.index[tok] ?? []) candidateIds.add(id);
    }

    if (candidateIds.size === 0) return [];

    // Load all chunks and find matching entities
    const results: SanctionsCandidate[] = [];
    for (let c = 0; c < indexRecord.chunkCount; c++) {
      const chunk = await store.get(`os-sanctions/entities-${c}.json`, { type: "json" }).catch(() => null) as SanctionsCandidate[] | null;
      if (!chunk) continue;
      for (const entity of chunk) {
        if (candidateIds.has(entity.id)) results.push(entity);
      }
    }
    return results;
  } catch {
    return [];
  }
}
