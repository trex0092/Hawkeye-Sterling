/**
 * HTTP download helper with on-disk caching, conditional requests, and
 * retries. Designed for fetching sanctions list dumps (XML/CSV/JSON) from
 * official sources in a polite and restartable way.
 *
 * - Uses global fetch (Node 20+).
 * - Stores payloads under `<cacheDir>/<hash>.bin` and metadata under
 *   `<cacheDir>/<hash>.json` (etag, last-modified, fetched_at, url).
 * - Honours ETag / Last-Modified on subsequent calls so a daily refresh
 *   cron doesn't re-download unchanged lists.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const DEFAULT_UA = 'Hawkeye-Sterling-Screening/1.0 (+https://github.com/trex0092/Hawkeye-Sterling)';

function hashUrl(url) {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

async function ensureDir(dir) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

async function readMeta(metaPath) {
  try { return JSON.parse(await readFile(metaPath, 'utf8')); }
  catch { return null; }
}

/**
 * Fetch a URL with caching. Returns { body: Buffer, fromCache, meta }.
 *
 * Options:
 *   cacheDir      directory for cached payloads (required)
 *   maxAgeMs      if cached copy is younger, skip network entirely
 *   retries       number of retry attempts on network failure (default 3)
 *   backoffMs     initial backoff, doubles each retry (default 1000)
 *   headers       extra request headers
 *   decompress    auto-gunzip if Content-Encoding or .gz extension (default true)
 */
export async function fetchCached(url, opts = {}) {
  const {
    cacheDir,
    maxAgeMs = 0,
    retries = 3,
    backoffMs = 1000,
    headers = {},
    decompress = true,
  } = opts;
  if (!cacheDir) throw new Error('fetchCached: cacheDir required');

  await ensureDir(cacheDir);
  const h = hashUrl(url);
  const bodyPath = join(cacheDir, `${h}.bin`);
  const metaPath = join(cacheDir, `${h}.json`);
  const existingMeta = await readMeta(metaPath);

  // Fresh enough? Serve straight from cache.
  if (existingMeta && maxAgeMs > 0 && existsSync(bodyPath)) {
    const age = Date.now() - (existingMeta.fetched_at || 0);
    if (age < maxAgeMs) {
      return { body: await readFile(bodyPath), fromCache: true, meta: existingMeta };
    }
  }

  const reqHeaders = {
    'User-Agent': DEFAULT_UA,
    'Accept-Encoding': 'gzip, identity',
    ...headers,
  };
  if (existingMeta?.etag) reqHeaders['If-None-Match'] = existingMeta.etag;
  if (existingMeta?.last_modified) reqHeaders['If-Modified-Since'] = existingMeta.last_modified;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: reqHeaders, redirect: 'follow' });
      if (res.status === 304 && existsSync(bodyPath)) {
        const meta = { ...existingMeta, fetched_at: Date.now(), status: 304 };
        await writeFile(metaPath, JSON.stringify(meta, null, 2));
        return { body: await readFile(bodyPath), fromCache: true, meta };
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      let body = Buffer.from(await res.arrayBuffer());
      const encoding = res.headers.get('content-encoding') || '';
      if (decompress && (encoding.includes('gzip') || url.endsWith('.gz'))) {
        try { body = gunzipSync(body); }
        catch { /* was not actually gzip — leave as-is */ }
      }
      const meta = {
        url,
        etag: res.headers.get('etag') || null,
        last_modified: res.headers.get('last-modified') || null,
        content_type: res.headers.get('content-type') || null,
        size: body.length,
        fetched_at: Date.now(),
        status: res.status,
      };
      await writeFile(bodyPath, body);
      await writeFile(metaPath, JSON.stringify(meta, null, 2));
      return { body, fromCache: false, meta };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const wait = backoffMs * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  // All attempts failed — if we have a stale cached copy, return it with a warning flag.
  if (existsSync(bodyPath) && existingMeta) {
    return {
      body: await readFile(bodyPath),
      fromCache: true,
      meta: { ...existingMeta, stale: true, error: String(lastErr) },
    };
  }
  throw lastErr;
}

/**
 * Compute a content hash for diffing list versions across refreshes.
 */
export function contentHash(buf) {
  return createHash('sha256').update(buf).digest('hex');
}
