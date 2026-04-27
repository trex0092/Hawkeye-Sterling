// Hawkeye Sterling — Taranis AI adverse-media REST API client.
// taranis-ai/taranis-ai is an AI-powered OSINT aggregation platform:
// automated news collection, NLP enrichment (NER, classification,
// summarisation), and analyst workflow management.
//
// Deploy Taranis AI as a separate Docker service (EUPL-1.2 licence
// requires API-boundary separation for proprietary products). This client
// polls the Taranis AI Core REST API for intelligence items matching a
// subject name and returns AML-relevant adverse media findings.
//
// Env vars:
//   TARANIS_URL     — base URL of self-hosted Taranis AI instance (required)
//   TARANIS_API_KEY — API key for Taranis AI authentication (required)

import { fetchJsonWithRetry } from './httpRetry.js';

declare const process: { env?: Record<string, string | undefined> } | undefined;

export interface TaranisItem {
  id: string;
  title: string;
  content: string;
  source: string;
  published: string;             // ISO 8601 timestamp
  url?: string;
  language?: string;
  tags: string[];
  entities: TaranisEntity[];
  relevanceScore?: number;       // 0–1, set by NLP bot if configured
  attributes?: Record<string, string>;
}

export interface TaranisEntity {
  name: string;
  type: 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'MONEY' | 'DATE' | string;
  value?: string;
}

export interface TaranisSearchResult {
  ok: boolean;
  subject: string;
  items: TaranisItem[];
  totalCount: number;
  adverseCount: number;         // items with adverse tags (sanction/crime/fraud)
  highRelevanceCount: number;   // items with relevanceScore >= 0.7
  error?: string;
}

export interface TaranisSearchOptions {
  endpoint?: string;
  apiKey?: string;
  /** Date range — ISO date string e.g. '2025-01-01'. Defaults to past 90 days. */
  dateFrom?: string;
  dateTo?: string;
  /** Max items to return. Default 50. */
  limit?: number;
  /** Minimum relevance score (0–1) to include. Default 0 (all). */
  minRelevance?: number;
  timeoutMs?: number;
}

function env(key: string): string | undefined {
  return typeof process !== 'undefined' ? process.env?.[key] : undefined;
}

// Tags considered adverse for AML purposes
const ADVERSE_TAGS = new Set([
  'sanction', 'sanctions', 'fraud', 'money laundering', 'aml', 'corruption',
  'bribery', 'crime', 'criminal', 'arrest', 'conviction', 'indictment',
  'investigation', 'lawsuit', 'fine', 'penalty', 'enforcement',
  'terrorist', 'terrorism', 'drug trafficking', 'human trafficking',
  'cybercrime', 'hack', 'breach', 'scam', 'ponzi', 'embezzlement',
]);

function isAdverse(item: TaranisItem): boolean {
  const lower = item.tags.map((t) => t.toLowerCase());
  return lower.some((t) => ADVERSE_TAGS.has(t));
}

interface TaranisApiResponse {
  items?: Array<{
    id?: string;
    title?: string;
    content?: string;
    source?: string;
    published?: string;
    url?: string;
    language?: string;
    tags?: string[];
    entities?: Array<{ name?: string; type?: string; value?: string }>;
    relevance_score?: number;
    attributes?: Record<string, string>;
  }>;
  total_count?: number;
  count?: number;
}

export async function searchAdverseMedia(
  subject: string,
  options: TaranisSearchOptions = {},
): Promise<TaranisSearchResult> {
  const baseUrl = options.endpoint ?? env('TARANIS_URL');
  const apiKey = options.apiKey ?? env('TARANIS_API_KEY');

  if (!baseUrl) {
    return { ok: false, subject, items: [], totalCount: 0, adverseCount: 0, highRelevanceCount: 0, error: 'TARANIS_URL not configured' };
  }
  if (!apiKey) {
    return { ok: false, subject, items: [], totalCount: 0, adverseCount: 0, highRelevanceCount: 0, error: 'TARANIS_API_KEY not configured' };
  }

  const timeoutMs = options.timeoutMs ?? 15_000;
  const limit = options.limit ?? 50;
  const dateFrom = options.dateFrom ?? new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);

  const url = new URL(`${baseUrl.replace(/\/$/, '')}/api/v1/osint-items`);
  url.searchParams.set('search', subject);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', '0');
  if (dateFrom) url.searchParams.set('date_from', dateFrom);
  if (options.dateTo) url.searchParams.set('date_to', options.dateTo);

  const result = await fetchJsonWithRetry<TaranisApiResponse>(
    url.toString(),
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
      },
    },
    { perAttemptMs: timeoutMs, maxAttempts: 2 },
  );

  if (!result.ok || !result.json) {
    return {
      ok: false, subject, items: [], totalCount: 0, adverseCount: 0, highRelevanceCount: 0,
      error: result.error ?? `Taranis API HTTP ${result.status ?? 'unknown'}`,
    };
  }

  const raw = result.json;
  const minRelevance = options.minRelevance ?? 0;

  const items: TaranisItem[] = (raw.items ?? [])
    .filter((r) => (r.relevance_score ?? 1) >= minRelevance)
    .map((r) => ({
      id: r.id ?? '',
      title: r.title ?? '',
      content: r.content ?? '',
      source: r.source ?? '',
      published: r.published ?? new Date().toISOString(),
      ...(r.url !== undefined ? { url: r.url } : {}),
      ...(r.language !== undefined ? { language: r.language } : {}),
      tags: r.tags ?? [],
      entities: (r.entities ?? []).map((e) => ({
        name: e.name ?? '',
        type: e.type ?? 'UNKNOWN',
        ...(e.value !== undefined ? { value: e.value } : {}),
      })),
      ...(r.relevance_score !== undefined ? { relevanceScore: r.relevance_score } : {}),
      ...(r.attributes !== undefined ? { attributes: r.attributes } : {}),
    }));

  const adverseCount = items.filter(isAdverse).length;
  const highRelevanceCount = items.filter((it) => (it.relevanceScore ?? 0) >= 0.7).length;

  return {
    ok: true,
    subject,
    items,
    totalCount: raw.total_count ?? raw.count ?? items.length,
    adverseCount,
    highRelevanceCount,
  };
}

// Convenience: screen a subject and return only adverse items sorted by relevance.
export async function getAdverseItems(
  subject: string,
  options: TaranisSearchOptions = {},
): Promise<TaranisItem[]> {
  const result = await searchAdverseMedia(subject, options);
  if (!result.ok) return [];
  return result.items
    .filter(isAdverse)
    .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
}
