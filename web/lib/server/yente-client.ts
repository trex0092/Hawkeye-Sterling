// Yente API client — self-hostable OpenSanctions screening endpoint.
//
// Covers:
//   opensanctions/yente        (136 ⭐, Python) — self-hosted entity search & bulk match
//   opensanctions/opensanctions (740 ⭐, Python) — upstream open database
//   alephdata/followthemoney   (271 ⭐, Python) — FTM entity schema used by both
//
// Configuration:
//   YENTE_URL       — base URL of your yente instance, e.g. http://yente:8000
//                     Falls back to the public OpenSanctions API when not set.
//   YENTE_API_KEY   — optional; required by the commercial OpenSanctions API
//
// Deployment: see docker-compose.sanctions.yml at the repo root.
//
// API reference: https://github.com/opensanctions/yente
// FTM schema:    https://github.com/alephdata/followthemoney

const DEFAULT_YENTE_URL = "https://api.opensanctions.org";
const YENTE_TIMEOUT_MS = 10_000;

function getBase(): string {
  return (process.env["YENTE_URL"] ?? DEFAULT_YENTE_URL).replace(/\/$/, "");
}

function getHeaders(): Record<string, string> {
  const key = process.env["YENTE_API_KEY"];
  return {
    "content-type": "application/json",
    "accept": "application/json",
    ...(key ? { "authorization": `ApiKey ${key}` } : {}),
  };
}

// ── FollowTheMoney entity schema (subset) ─────────────────────────────────────
// https://github.com/alephdata/followthemoney
export interface FtmEntity {
  id: string;
  schema: string; // "Person" | "Organization" | "Vessel" | etc.
  caption: string;
  properties: Record<string, string[]>;
  datasets: string[];
  first_seen?: string;
  last_seen?: string;
  last_change?: string;
  score?: number; // returned by /match endpoint
  match?: boolean;
}

export interface YenteSearchResult {
  query: string;
  total: { value: number; relation: string };
  results: FtmEntity[];
}

export interface YenteMatchResult {
  query: {
    id: string;
    schema: string;
    properties: Record<string, string[] | undefined>;
  };
  results: FtmEntity[];
  total: { value: number; relation: string };
}

// ── Entity search ─────────────────────────────────────────────────────────────
// GET /search/{dataset}?q={query}&schema={schema}&limit={n}
// dataset: "default" covers all lists; or specific list ID like "sanctions"

export async function searchEntities(
  query: string,
  options: {
    dataset?: string;
    schema?: string; // "Person" | "Organization" | etc.
    limit?: number;
    fuzzy?: boolean;
  } = {},
): Promise<YenteSearchResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), YENTE_TIMEOUT_MS);
  try {
    const dataset = options.dataset ?? "default";
    const params = new URLSearchParams({
      q: query,
      limit: String(options.limit ?? 10),
      ...(options.schema ? { schema: options.schema } : {}),
      ...(options.fuzzy !== false ? { fuzzy: "true" } : {}),
    });
    const res = await fetch(`${getBase()}/search/${dataset}?${params}`, {
      headers: getHeaders(),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return { query, total: { value: 0, relation: "eq" }, results: [] };
    }
    return await res.json() as YenteSearchResult;
  } catch (err) {
    console.warn("[yente] searchEntities failed:", err instanceof Error ? err.message : String(err));
    return { query, total: { value: 0, relation: "eq" }, results: [] };
  } finally {
    clearTimeout(t);
  }
}

// ── Entity matching (bulk reconciliation) ────────────────────────────────────
// POST /match/{dataset}
// Structured name+dob+nationality matching — higher precision than text search.

export interface MatchQuery {
  id?: string;
  schema?: string;
  properties: {
    name?: string[];
    alias?: string[];
    birthDate?: string[];
    nationality?: string[];
    country?: string[];
    registrationNumber?: string[];
    [key: string]: string[] | undefined;
  };
}

export async function matchEntity(
  query: MatchQuery,
  options: { dataset?: string; limit?: number; threshold?: number } = {},
): Promise<YenteMatchResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), YENTE_TIMEOUT_MS);
  try {
    const dataset = options.dataset ?? "default";
    const body = {
      queries: {
        q1: {
          id: query.id ?? "q1",
          schema: query.schema ?? "Thing",
          properties: query.properties,
        },
      },
      ...(options.limit ? { limit: options.limit } : {}),
      ...(options.threshold !== undefined ? { threshold: options.threshold } : {}),
    };
    const res = await fetch(`${getBase()}/match/${dataset}`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return { query: body.queries.q1, results: [], total: { value: 0, relation: "eq" } };
    }
    const data = await res.json() as { responses?: Record<string, YenteMatchResult> };
    return data.responses?.["q1"] ?? { query: body.queries.q1, results: [], total: { value: 0, relation: "eq" } };
  } catch (err) {
    console.warn("[yente] matchEntity failed:", err instanceof Error ? err.message : String(err));
    return { query: { id: "q1", schema: "Thing", properties: query.properties }, results: [], total: { value: 0, relation: "eq" } };
  } finally {
    clearTimeout(t);
  }
}

// ── Entity retrieval ─────────────────────────────────────────────────────────
// GET /entities/{entity_id}

export async function getEntity(entityId: string, dataset = "default"): Promise<FtmEntity | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), YENTE_TIMEOUT_MS);
  try {
    const res = await fetch(`${getBase()}/entities/${entityId}?dataset=${dataset}`, {
      headers: getHeaders(),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json() as FtmEntity;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ── Dataset listing ───────────────────────────────────────────────────────────
// GET /datasets — returns available sanctions lists and their metadata

export interface YenteDataset {
  name: string;
  title: string;
  summary?: string;
  entity_count?: number;
  last_change?: string;
}

export async function listDatasets(): Promise<YenteDataset[]> {
  try {
    const res = await fetch(`${getBase()}/datasets`, { headers: getHeaders() });
    if (!res.ok) return [];
    const data = await res.json() as { datasets?: YenteDataset[] };
    return data.datasets ?? [];
  } catch {
    return [];
  }
}

// ── Health check ─────────────────────────────────────────────────────────────
export async function yenteHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${getBase()}/healthz`, {
      headers: getHeaders(),
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
