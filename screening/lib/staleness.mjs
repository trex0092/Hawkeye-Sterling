/**
 * Sanctions list staleness circuit-breaker.
 *
 * Prevents screening against out-of-date sanctions data by checking the age
 * of cached list files before allowing a screening operation to proceed.
 * If any enabled bulk source exceeds the configured maximum age (default 24h),
 * screening is blocked unless explicitly forced.
 *
 * This addresses FATF Recommendation 6 (targeted financial sanctions) which
 * requires "without delay" implementation of sanctions designations.
 */

import { stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { SOURCES, PATHS, CACHE_TTL_MS } from '../config.js';

const DEFAULT_MAX_AGE_MS = Number(process.env.HAWKEYE_MAX_LIST_AGE_HOURS || 24) * 60 * 60 * 1000;

/**
 * Check the freshness of all enabled bulk sanctions sources.
 *
 * @param {object} [opts]
 * @param {number} [opts.maxAgeMs] - Maximum allowed age in ms (default: 24h)
 * @param {string} [opts.cacheDir] - Cache directory (default: from config)
 * @returns {{ ok: boolean, sources: SourceStatus[], staleCount: number, oldestAgeHours: number }}
 */
export async function checkFreshness(opts = {}) {
  const maxAgeMs = opts.maxAgeMs || DEFAULT_MAX_AGE_MS;
  const cacheDir = opts.cacheDir || PATHS.cacheDir;
  const bulkSources = SOURCES.filter(s => s.enabled && !s.runtime);
  const results = [];
  let staleCount = 0;
  let oldestAgeMs = 0;

  for (const source of bulkSources) {
    const hash = createHash('sha256').update(source.url).digest('hex').slice(0, 16);
    const metaPath = join(cacheDir, `${hash}.json`);
    const bodyPath = join(cacheDir, `${hash}.bin`);

    if (!existsSync(metaPath) || !existsSync(bodyPath)) {
      results.push({
        id: source.id,
        name: source.name,
        status: 'missing',
        ageMs: Infinity,
        ageHours: Infinity,
        maxAgeHours: maxAgeMs / 3600000,
        stale: true,
      });
      staleCount++;
      oldestAgeMs = Infinity;
      continue;
    }

    let meta;
    try {
      const { readFile } = await import('node:fs/promises');
      meta = JSON.parse(await readFile(metaPath, 'utf8'));
    } catch (err) {
      results.push({
        id: source.id,
        name: source.name,
        status: 'corrupt',
        ageMs: Infinity,
        ageHours: Infinity,
        maxAgeHours: maxAgeMs / 3600000,
        stale: true,
        error: err.message,
      });
      staleCount++;
      oldestAgeMs = Infinity;
      continue;
    }

    const fetchedAt = meta.fetched_at || 0;
    const ageMs = Date.now() - fetchedAt;
    const isStale = ageMs > maxAgeMs;

    if (isStale) staleCount++;
    if (ageMs > oldestAgeMs) oldestAgeMs = ageMs;

    results.push({
      id: source.id,
      name: source.name,
      status: isStale ? 'stale' : 'fresh',
      ageMs,
      ageHours: Math.round(ageMs / 3600000 * 10) / 10,
      maxAgeHours: maxAgeMs / 3600000,
      stale: isStale,
      fetchedAt: meta.fetched_at ? new Date(meta.fetched_at).toISOString() : null,
      etag: meta.etag || null,
    });
  }

  return {
    ok: staleCount === 0,
    sources: results,
    staleCount,
    totalSources: bulkSources.length,
    oldestAgeHours: oldestAgeMs === Infinity ? Infinity : Math.round(oldestAgeMs / 3600000 * 10) / 10,
    maxAgeHours: maxAgeMs / 3600000,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Guard function — throws if any sanctions list is stale.
 * Call before screening operations to enforce the circuit-breaker.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.force] - Bypass the staleness check
 * @param {number} [opts.maxAgeMs] - Maximum age override
 * @throws {Error} If any source is stale and force is not set
 */
export async function enforceFreshness(opts = {}) {
  if (opts.force) return;
  const result = await checkFreshness(opts);
  if (!result.ok) {
    const stale = result.sources.filter(s => s.stale);
    const names = stale.map(s => `${s.id} (${s.status === 'missing' ? 'not downloaded' : s.ageHours + 'h old'})`);
    throw new Error(
      `Screening blocked: ${result.staleCount} sanctions source(s) exceed maximum age of ${result.maxAgeHours}h. ` +
      `Stale: ${names.join(', ')}. ` +
      `Run 'node screening/bin/refresh.mjs' to update, or set force=true to bypass.`
    );
  }
}
