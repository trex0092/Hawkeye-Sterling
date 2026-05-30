// Aleph client — investigative data platform search.
//
// Covers:
//   alephdata/aleph          (2 367 ⭐, JS) — investigative entity & document search
//   alephdata/followthemoney (271 ⭐, Python) — FTM entity data model
//   alephdata/memorious      (315 ⭐, Python) — web scraping toolkit (data ingestion)
//
// Configuration:
//   ALEPH_HOST    — base URL, e.g. https://aleph.occrp.org  (default: public OCCRP instance)
//   ALEPH_API_KEY — API key for authenticated queries (higher rate limits)
//
// The OCCRP Aleph instance (aleph.occrp.org) holds investigative data on:
// financial crime networks, shell companies, leaked documents, PEP connections,
// and corporate registries from 250+ countries — directly complementary to
// Hawkeye's sanctions screening.
//
// FTM schema reference: https://github.com/alephdata/followthemoney
// Aleph API docs:       https://aleph.occrp.org/api/

const DEFAULT_ALEPH_HOST = "https://aleph.occrp.org";
const ALEPH_TIMEOUT_MS = 12_000;

function getBase(): string {
  return (process.env["ALEPH_HOST"] ?? DEFAULT_ALEPH_HOST).replace(/\/$/, "");
}

function getHeaders(): Record<string, string> {
  const key = process.env["ALEPH_API_KEY"];
  return {
    "accept": "application/json",
    "content-type": "application/json",
    ...(key ? { "authorization": `ApiKey ${key}` } : {}),
  };
}

// ── FTM entity types ──────────────────────────────────────────────────────────
// https://github.com/alephdata/followthemoney

export interface AlephEntity {
  id: string;
  schema: string;
  caption: string;
  properties: Record<string, string[]>;
  collection?: { id: string; label: string; category: string };
  score?: number;
  datasets?: string[];
}

export interface AlephSearchResult {
  status: string;
  total: { value: number; relation: string };
  results: AlephEntity[];
  offset: number;
  limit: number;
}

export interface AlephDocument {
  id: string;
  schema: string;
  caption: string;
  properties: {
    fileName?: string[];
    mimeType?: string[];
    bodyText?: string[];
    summary?: string[];
    date?: string[];
    sourceUrl?: string[];
    author?: string[];
    [key: string]: string[] | undefined;
  };
  collection: { id: string; label: string };
  score?: number;
}

// ── Entity search ─────────────────────────────────────────────────────────────
// GET /api/2/entities?q={query}&schema={schema}&filter:collection_id={col}
// Searches the full Aleph graph — entities, companies, people, documents.

export async function searchEntities(
  query: string,
  options: {
    schema?: string; // "Person" | "Organization" | "Company" | etc.
    collectionId?: string;
    limit?: number;
    offset?: number;
    filters?: Record<string, string>; // additional filter: prefix filters
  } = {},
): Promise<AlephSearchResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ALEPH_TIMEOUT_MS);
  try {
    const params = new URLSearchParams({
      q: query,
      limit: String(options.limit ?? 10),
      offset: String(options.offset ?? 0),
      ...(options.schema ? { schema: options.schema } : {}),
      ...(options.collectionId ? { "filter:collection_id": options.collectionId } : {}),
    });
    if (options.filters) {
      for (const [k, v] of Object.entries(options.filters)) {
        params.set(`filter:${k}`, v);
      }
    }
    const res = await fetch(`${getBase()}/api/2/entities?${params}`, {
      headers: getHeaders(),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return { status: "error", total: { value: 0, relation: "eq" }, results: [], offset: 0, limit: options.limit ?? 10 };
    }
    return await res.json() as AlephSearchResult;
  } catch (err) {
    console.warn("[aleph] searchEntities failed:", err instanceof Error ? err.message : String(err));
    return { status: "error", total: { value: 0, relation: "eq" }, results: [], offset: 0, limit: options.limit ?? 10 };
  } finally {
    clearTimeout(t);
  }
}

// ── Similar entity matching ───────────────────────────────────────────────────
// POST /api/2/match — structured FTM entity matching against the full graph.
// Higher precision than text search for name+dob combinations.

export interface AlephMatchQuery {
  schema: string;
  properties: Record<string, string[]>;
}

export async function matchEntities(
  queries: AlephMatchQuery[],
  options: { limit?: number } = {},
): Promise<{ results: AlephEntity[][] }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ALEPH_TIMEOUT_MS);
  try {
    const body = {
      queries: queries.map((q, i) => ({ id: `q${i}`, ...q })),
      limit: options.limit ?? 5,
    };
    const res = await fetch(`${getBase()}/api/2/match`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return { results: [] };
    const data = await res.json() as { responses?: Array<{ results: AlephEntity[] }> };
    return { results: (data.responses ?? []).map((r) => r.results) };
  } catch (err) {
    console.warn("[aleph] matchEntities failed:", err instanceof Error ? err.message : String(err));
    return { results: [] };
  } finally {
    clearTimeout(t);
  }
}

// ── Entity details ────────────────────────────────────────────────────────────
// GET /api/2/entities/{entity_id}

export async function getEntity(entityId: string): Promise<AlephEntity | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ALEPH_TIMEOUT_MS);
  try {
    const res = await fetch(`${getBase()}/api/2/entities/${entityId}`, {
      headers: getHeaders(),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json() as AlephEntity;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ── Entity neighbours (relationship graph) ───────────────────────────────────
// GET /api/2/entities/{entity_id}/similar
// Returns entities that are similar or linked to the given entity.

export async function getEntityNeighbours(
  entityId: string,
  limit = 20,
): Promise<AlephEntity[]> {
  try {
    const res = await fetch(
      `${getBase()}/api/2/entities/${entityId}/similar?limit=${limit}`,
      { headers: getHeaders(), signal: AbortSignal.timeout(ALEPH_TIMEOUT_MS) },
    );
    if (!res.ok) return [];
    const data = await res.json() as { results?: AlephEntity[] };
    return data.results ?? [];
  } catch {
    return [];
  }
}

// ── Collection listing ────────────────────────────────────────────────────────
// GET /api/2/collections — returns available data collections (leaks, registries, etc.)

export interface AlephCollection {
  id: string;
  label: string;
  category: string;
  summary?: string;
  count?: number;
  countries?: string[];
}

export async function listCollections(limit = 50): Promise<AlephCollection[]> {
  try {
    const res = await fetch(`${getBase()}/api/2/collections?limit=${limit}`, { headers: getHeaders() });
    if (!res.ok) return [];
    const data = await res.json() as { results?: AlephCollection[] };
    return data.results ?? [];
  } catch {
    return [];
  }
}

// ── Health check ─────────────────────────────────────────────────────────────
export async function alephHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${getBase()}/api/2/statistics`, {
      headers: getHeaders(),
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
