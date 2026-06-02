// Hawkeye Sterling — Social Media OSINT Collector (Taranis twitter_collector.py analog).
// Queries the Twitter/X v2 Recent Search API for mentions of a screened entity
// combined with AML-relevant keywords from the existing adverse-media taxonomy.
//
// Requires TWITTER_BEARER_TOKEN env var. If absent the collector returns an
// empty result — fail-open for data enrichment, not for auth or risk decisions.
//
// Output normalised to OsintItem so it feeds directly into discoverAdverseMedia.

import { createHash } from 'node:crypto';
import type { OsintItem, OsintQuery } from './osint-pipeline.js';

export interface SocialMediaOutcome {
  ok: boolean;
  platform: 'twitter' | 'none';
  items: OsintItem[];
  error?: string;
}

// AML search terms appended to every entity query.
// Drawn from the adverse-media.ts keyword taxonomy — not duplicated here,
// just the representative subset most likely to surface adverse media tweets.
const AML_FILTER_KEYWORDS = [
  'money laundering', 'fraud', 'sanctions', 'arrested', 'indicted',
  'convicted', 'investigation', 'bribery', 'corruption', 'embezzlement',
  'terrorist financing', 'financial crime', 'cybercrime',
] as const;

const MAX_RESULTS = 25;
const TIMEOUT_MS  = 15_000;

interface TwitterTweet {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  entities?: { urls?: Array<{ expanded_url?: string }> };
}

interface TwitterSearchResponse {
  data?: TwitterTweet[];
  meta?: { result_count?: number; next_token?: string };
}

function buildQuery(subjectName: string): string {
  // Truncate overly long names to keep the query within Twitter's 512-char limit
  const name = subjectName.length > 48 ? subjectName.slice(0, 48) : subjectName;
  const kwClause = AML_FILTER_KEYWORDS.slice(0, 6).map(k => `"${k}"`).join(' OR ');
  return `"${name}" (${kwClause}) -is:retweet lang:en`;
}

function tweetToItem(tweet: TwitterTweet): OsintItem {
  const url =
    tweet.entities?.urls?.[0]?.expanded_url ??
    `https://twitter.com/i/web/status/${tweet.id}`;
  return {
    id: `tw_${createHash('sha256').update(tweet.id).digest('hex').slice(0, 10)}`,
    url,
    title: tweet.text.slice(0, 200),
    content: tweet.text,
    // exactOptionalPropertyTypes: only set publishedAt when defined
    ...(tweet.created_at !== undefined ? { publishedAt: tweet.created_at } : {}),
    language: 'en',
    source: 'twitter.com',
  };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

/** Search Twitter/X v2 for AML-relevant mentions of a subject entity.
 *  Returns SocialMediaOutcome — never throws. */
export async function searchTwitter(q: OsintQuery): Promise<SocialMediaOutcome> {
  const bearer = process.env['TWITTER_BEARER_TOKEN'];
  if (!bearer) {
    return { ok: false, platform: 'none', items: [], error: 'TWITTER_BEARER_TOKEN not configured' };
  }

  const params = new URLSearchParams({
    query:       buildQuery(q.subjectName),
    max_results: String(Math.min(MAX_RESULTS, q.pageSize ?? MAX_RESULTS)),
    'tweet.fields': 'created_at,entities,author_id',
  });
  if (q.fromDate) {
    const d = new Date(q.fromDate);
    if (!isNaN(d.getTime())) params.set('start_time', d.toISOString());
  }

  try {
    const res = await fetchWithTimeout(
      `https://api.twitter.com/2/tweets/search/recent?${params.toString()}`,
      { headers: { Authorization: `Bearer ${bearer}` } },
    );

    if (res.status === 429) {
      return { ok: false, platform: 'twitter', items: [], error: 'rate limited' };
    }
    if (!res.ok) {
      return { ok: false, platform: 'twitter', items: [], error: `HTTP ${res.status}` };
    }

    const json = (await res.json()) as TwitterSearchResponse;
    const items = (json.data ?? []).map(tweetToItem);
    return { ok: true, platform: 'twitter', items };
  } catch (err) {
    return {
      ok: false,
      platform: 'twitter',
      items: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
