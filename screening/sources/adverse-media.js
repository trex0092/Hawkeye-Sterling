/**
 * Adverse media screening via the GDELT 2.0 DOC API.
 *
 * API:     https://api.gdeltproject.org/api/v2/doc/doc
 * License: GDELT Project — free for research and commercial use with
 *          attribution. No API key required. Rate limit: soft, be polite.
 * Docs:    https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
 *
 * Unlike sanctions adapters, adverse-media is a runtime source: we do
 * NOT bulk-ingest the whole internet. Instead the orchestrator calls
 * `search(query)` per subject at screening time.
 *
 * The search query combines the subject's name with a list of
 * negative-signal keywords ("laundering", "bribery", "fraud", "arrest",
 * "sanction", "terror", "trafficking", ...) to skew results towards
 * genuinely adverse coverage. Returned articles are post-filtered by
 * requiring at least one adverse keyword in the title.
 */

import { fetchCached } from '../lib/http.js';

const GDELT = 'https://api.gdeltproject.org/api/v2/doc/doc';

const ADVERSE_TERMS = [
  'arrest', 'arrested', 'indict', 'indicted', 'convicted', 'convict',
  'fraud', 'bribery', 'bribe', 'corruption', 'laundering', 'embezzle',
  'sanction', 'sanctions', 'terror', 'terrorism', 'terrorist',
  'trafficking', 'smuggling', 'scheme', 'scandal', 'kickback',
  'guilty', 'jailed', 'prison', 'fugitive', 'wanted', 'charges',
  'investigation', 'probe', 'raid', 'seized',
];

const ADVERSE_RE = new RegExp(`\\b(${ADVERSE_TERMS.join('|')})\\b`, 'i');

function buildQuery(name) {
  // Quote the name so GDELT treats it as a phrase; add a near-match to any
  // adverse term. GDELT supports `"name" AND (term1 OR term2 ...)`.
  const terms = ADVERSE_TERMS.slice(0, 12).join(' OR ');
  return `"${name}" (${terms})`;
}

/**
 * Search GDELT for adverse media about a subject. Returns an array of
 * { title, url, seendate, domain, language, tone } with tone being the
 * GDELT "v2tone" score (negative = more negative coverage).
 */
export async function search(name, opts = {}) {
  const { cacheDir, maxAgeMs = 60 * 60 * 1000, limit = 20, logger } = opts;
  const url = new URL(GDELT);
  url.searchParams.set('query', buildQuery(name));
  url.searchParams.set('mode', 'ArtList');
  url.searchParams.set('format', 'json');
  url.searchParams.set('maxrecords', String(limit));
  url.searchParams.set('sort', 'hybridrel');

  try {
    const { body, fromCache } = await fetchCached(url.toString(), {
      cacheDir: cacheDir || '.screening/cache',
      maxAgeMs,
    });
    logger?.(`[adverse-media] ${fromCache ? 'cache' : 'fresh'} ${name}`);
    const text = body.toString('utf8');
    let parsed;
    try { parsed = JSON.parse(text); }
    catch {
      // GDELT occasionally returns HTML on error — treat as zero results.
      return [];
    }
    const articles = parsed.articles || [];
    const filtered = [];
    for (const a of articles) {
      const title = a.title || '';
      if (!ADVERSE_RE.test(title)) continue; // require keyword in title, not just body
      filtered.push({
        title,
        url: a.url,
        seendate: a.seendate,
        domain: a.domain,
        language: a.language,
        tone: typeof a.tone === 'number' ? a.tone : null,
        socialimage: a.socialimage || null,
      });
    }
    return filtered;
  } catch (err) {
    logger?.(`[adverse-media] error for "${name}": ${err.message}`);
    return [];
  }
}

/**
 * Score an adverse-media result set into a 0..1 risk lift applied to the
 * sanctions match score. A single credible article with negative tone
 * adds ~0.02; ten articles cap the lift at 0.15.
 *
 * This is deliberately conservative — adverse media alone should never
 * drive a "high" sanctions classification; it is a signal for EDD.
 */
export function scoreAdverseMedia(articles) {
  if (!articles || !articles.length) return { lift: 0, count: 0, avgTone: null };
  let tone = 0;
  let toned = 0;
  for (const a of articles) {
    if (typeof a.tone === 'number') { tone += a.tone; toned++; }
  }
  const avgTone = toned ? tone / toned : null;
  // GDELT tone runs roughly from -10 (very negative) to +10 (very positive).
  // Scale negative tone into 0..1 and combine with article count.
  const toneLift = avgTone !== null ? Math.max(0, Math.min(1, (-avgTone) / 8)) : 0.3;
  const countLift = Math.min(1, articles.length / 10);
  const lift = Math.min(0.15, 0.02 + 0.10 * (0.6 * countLift + 0.4 * toneLift));
  return { lift: Number(lift.toFixed(4)), count: articles.length, avgTone };
}

// Exported so other modules can reuse the adverse-term regex.
export { ADVERSE_RE, ADVERSE_TERMS };
