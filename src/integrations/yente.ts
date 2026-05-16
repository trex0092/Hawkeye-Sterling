// Hawkeye Sterling — yente (opensanctions/yente) REST API client.
// yente is a self-hosted FastAPI + ElasticSearch entity matching service built
// on FollowTheMoney (FtM) schemas. It exposes /match for batch entity
// disambiguation against 120+ sanctions/PEP/crime datasets.
//
// FIX-08 / FIX-09: defaults to the OpenSanctions public API when YENTE_URL
// is not set. The public API is free, requires no API key, covers 120+
// sanctions AND PEP datasets (UN, OFAC, EU, UK, politicians, etc.).
// Rate limit: ~60 req/min unauthenticated. Register a free API key at
// opensanctions.org and set YENTE_API_KEY for higher limits.
//
// Env vars:
//   YENTE_URL      — yente base URL (optional — defaults to OpenSanctions public API)
//   YENTE_API_KEY  — API key (optional — required only for premium rate limits)

import { fetchJsonWithRetry } from './httpRetry.js';
import type { NormalisedListEntry } from '../brain/watchlist-adapters.js';

declare const process: { env?: Record<string, string | undefined> } | undefined;

export interface YenteMatchQuery {
  /** Subject name to match. */
  name: string;
  /** ISO-3166-2 nationality (optional). */
  nationality?: string;
  /** Birth date YYYY-MM-DD (optional). */
  birthDate?: string;
  /** FtM schema type — default 'Person'. */
  schema?: 'Person' | 'Organization' | 'Company' | 'Vessel' | 'LegalEntity';
}

export interface YenteMatchOptions {
  /** yente base URL. Defaults to YENTE_URL env var. */
  endpoint?: string;
  /** Bearer token. Defaults to YENTE_API_KEY env var. */
  apiKey?: string;
  /** Minimum match score 0–1 to include in results. Default 0.5. */
  threshold?: number;
  /** Max results per query entity. Default 10. */
  limit?: number;
  /** Dataset filter e.g. 'sanctions'. Default 'default'. */
  dataset?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface YenteMatchHit {
  id: string;
  caption: string;
  schema: string;
  score: number;
  datasets: string[];
  properties: Record<string, unknown>;
}

export interface YenteMatchResult {
  ok: boolean;
  query: YenteMatchQuery;
  hits: YenteMatchHit[];
  error?: string;
}

interface YenteResponseBody {
  responses?: Record<string, {
    results?: Array<{
      id: string;
      caption: string;
      schema: string;
      score: number;
      datasets: string[];
      properties: Record<string, unknown>;
    }>;
    query?: Record<string, unknown>;
    total?: { value: number };
  }>;
}

// yente /match accepts up to 100 entities per request. For larger batches
// callers should chunk and call this function in series.
export async function yenteMatch(
  queries: YenteMatchQuery[],
  opts: YenteMatchOptions = {},
): Promise<YenteMatchResult[]> {
  // Default to the free OpenSanctions public API when no self-hosted instance is configured.
  const endpoint = opts.endpoint
    ?? (typeof process !== 'undefined' ? process.env?.YENTE_URL : undefined)
    ?? 'https://api.opensanctions.org';

  const apiKey = opts.apiKey ?? (typeof process !== 'undefined' ? process.env?.YENTE_API_KEY : undefined);
  const dataset = opts.dataset ?? 'default';
  const threshold = opts.threshold ?? 0.5;
  const limit = opts.limit ?? 10;
  const _fetchImpl = opts.fetchImpl ?? fetch;

  // Build the FtM-format match request body. yente expects a map of
  // query-id → { schema, properties }.
  const requestEntities: Record<string, { schema: string; properties: Record<string, unknown> }> = {};
  queries.slice(0, 100).forEach((q, i) => {
    const props: Record<string, unknown> = { name: [q.name] };
    if (q.nationality) props.nationality = [q.nationality];
    if (q.birthDate) props.birthDate = [q.birthDate];
    requestEntities[`q${i}`] = {
      schema: q.schema ?? 'Person',
      properties: props,
    };
  });

  const url = `${endpoint.replace(/\/$/, '')}/match/${encodeURIComponent(dataset)}`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (apiKey) headers.Authorization = `ApiKey ${apiKey}`;

  const result = await fetchJsonWithRetry<YenteResponseBody>(
    url,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ queries: requestEntities, threshold, limit }),
    },
    {
      perAttemptMs: opts.timeoutMs ?? 15_000,
      maxAttempts: 2,
    },
  );

  if (!result.ok || !result.json?.responses) {
    return queries.map((q) => ({
      ok: false,
      query: q,
      hits: [],
      error: result.error ?? `yente HTTP ${result.status ?? 'unknown'}`,
    }));
  }

  return queries.slice(0, 100).map((q, i) => {
    const key = `q${i}`;
    const resp = result.json?.responses?.[key];
    const hits: YenteMatchHit[] = (resp?.results ?? []).map((r) => ({
      id: r.id,
      caption: r.caption,
      schema: r.schema,
      score: r.score,
      datasets: r.datasets,
      properties: r.properties,
    }));
    return { ok: true, query: q, hits };
  });
}

// Convenience: match a single NormalisedListEntry candidate against yente and
// return the top hit score (0 if no match above threshold).
export async function yenteScoreEntry(
  entry: NormalisedListEntry,
  opts: YenteMatchOptions = {},
): Promise<{ score: number; matchId?: string; matchCaption?: string }> {
  const schema = entry.entityType === 'individual' ? 'Person'
    : entry.entityType === 'organisation' ? 'Organization'
    : entry.entityType === 'vessel' ? 'Vessel'
    : 'LegalEntity';
  const nat = entry.nationalities?.[0];
  const results = await yenteMatch(
    [{ name: entry.primaryName, schema, ...(nat !== undefined ? { nationality: nat } : {}) }],
    opts,
  );
  const top = results[0]?.hits[0];
  return top
    ? { score: top.score, matchId: top.id, matchCaption: top.caption }
    : { score: 0 };
}
