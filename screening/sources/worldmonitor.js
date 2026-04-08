/**
 * World Monitor intelligence feed adapter.
 *
 * Connects to a self-hosted or remote World Monitor instance to pull
 * geopolitical intelligence, sanctions-related events, FATF plenary
 * outcomes, and jurisdiction risk signals relevant to AML/CFT screening.
 *
 * World Monitor aggregates 435+ curated news feeds and 65+ data sources.
 * This adapter taps into its API to extract compliance-relevant signals
 * and feed them into the Hawkeye-Sterling screening pipeline and memory
 * system.
 *
 * This is a runtime source (like adverse-media): queried on-demand,
 * not bulk-ingested. No API key required for self-hosted instances.
 *
 * Reference: https://github.com/koala73/worldmonitor
 */

import { fetchCached } from '../lib/http.js';

/**
 * Default endpoint — override via WORLDMONITOR_URL env var.
 * Falls back to GDELT (publicly accessible, same data many World Monitor
 * feeds aggregate) if no self-hosted instance is available.
 */
const WORLDMONITOR_URL = process.env.WORLDMONITOR_URL || null;
const GDELT_GEO = 'https://api.gdeltproject.org/api/v2/geo/geo';
const GDELT_DOC = 'https://api.gdeltproject.org/api/v2/doc/doc';

/**
 * Intelligence signal categories relevant to AML/CFT compliance.
 */
const SIGNAL_CATEGORIES = {
  sanctions: [
    'sanctions', 'sanctioned', 'designated', 'blacklist', 'asset freeze',
    'travel ban', 'OFAC', 'OFSI', 'EOCN', 'targeted financial sanctions',
  ],
  fatf: [
    'FATF', 'grey list', 'greylist', 'black list', 'blacklist',
    'mutual evaluation', 'increased monitoring', 'high-risk jurisdictions',
    'money laundering', 'terrorist financing', 'plenary',
  ],
  jurisdiction_risk: [
    'coup', 'civil war', 'conflict', 'regime change', 'political instability',
    'capital controls', 'currency crisis', 'hyperinflation', 'failed state',
  ],
  regulatory: [
    'AML', 'CFT', 'anti-money laundering', 'regulatory action', 'enforcement',
    'fine', 'penalty', 'suspension', 'revocation', 'compliance failure',
    'central bank', 'financial intelligence unit', 'FIU',
  ],
  precious_metals: [
    'gold smuggling', 'precious metals', 'precious stones', 'diamonds',
    'gold trade', 'bullion', 'gemstone', 'DPMS', 'dealer precious metals',
    'gold laundering', 'conflict minerals',
  ],
};

/**
 * Flatten all signal terms into a single regex for quick matching.
 */
const ALL_TERMS = Object.values(SIGNAL_CATEGORIES).flat();
const SIGNAL_RE = new RegExp(`\\b(${ALL_TERMS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');

/**
 * Fetch geopolitical intelligence events from World Monitor or GDELT.
 *
 * @param {object} opts
 * @param {string} [opts.query]     - Focus query (e.g., country name, topic).
 * @param {string} [opts.theme]     - GDELT theme code (e.g., 'TAX_FNCACT_SANCTIONS').
 * @param {string} [opts.country]   - ISO 2-letter country code.
 * @param {number} [opts.hours=24]  - Lookback window in hours.
 * @param {number} [opts.limit=50]  - Max articles to return.
 * @param {string} [opts.cacheDir]  - HTTP cache directory.
 * @param {function} [opts.logger]  - Diagnostic logger.
 * @returns {Promise<Array<{ title, url, date, domain, tone, category, country, signals }>>}
 */
export async function fetchIntelligence(opts = {}) {
  const {
    query,
    theme,
    country,
    hours = 24,
    limit = 50,
    cacheDir = '.screening/cache',
    logger,
  } = opts;

  // If World Monitor self-hosted instance is configured, use its API
  if (WORLDMONITOR_URL) {
    return fetchFromWorldMonitor(opts);
  }

  // Otherwise, use GDELT's public API (same underlying data)
  return fetchFromGdelt({ query, theme, country, hours, limit, cacheDir, logger });
}

/**
 * Fetch from a self-hosted World Monitor instance.
 */
async function fetchFromWorldMonitor(opts) {
  const { query, country, hours = 24, limit = 50, cacheDir, logger } = opts;

  const url = new URL(`${WORLDMONITOR_URL}/api/intelligence`);
  if (query) url.searchParams.set('q', query);
  if (country) url.searchParams.set('country', country);
  url.searchParams.set('hours', String(hours));
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('categories', 'geopolitical,sanctions,financial,disaster');

  try {
    const { body, fromCache } = await fetchCached(url.toString(), {
      cacheDir: cacheDir || '.screening/cache',
      maxAgeMs: 30 * 60 * 1000, // 30-minute cache
    });
    logger?.(`[worldmonitor] ${fromCache ? 'cache' : 'fresh'} ${url.pathname}`);

    const data = JSON.parse(body.toString('utf8'));
    const events = data.events || data.articles || data.items || [];

    return events
      .map(e => classifyEvent(e))
      .filter(e => e.signals.length > 0)
      .slice(0, limit);
  } catch (err) {
    logger?.(`[worldmonitor] self-hosted error: ${err.message}, falling back to GDELT`);
    return fetchFromGdelt(opts);
  }
}

/**
 * Fetch from GDELT's public API as a fallback intelligence source.
 * GDELT is one of the primary feeds World Monitor aggregates.
 */
async function fetchFromGdelt({ query, theme, country, hours, limit, cacheDir, logger }) {
  const articles = [];

  // Fetch sanctions/AML-relevant articles
  const queries = buildGdeltQueries(query, country);

  for (const q of queries) {
    try {
      const url = new URL(GDELT_DOC);
      url.searchParams.set('query', q.query);
      url.searchParams.set('mode', 'ArtList');
      url.searchParams.set('format', 'json');
      url.searchParams.set('maxrecords', String(Math.min(limit, 75)));
      url.searchParams.set('sort', 'datedesc');
      if (hours <= 72) {
        url.searchParams.set('timespan', `${hours}h`);
      }

      const { body, fromCache } = await fetchCached(url.toString(), {
        cacheDir: cacheDir || '.screening/cache',
        maxAgeMs: 30 * 60 * 1000,
      });
      logger?.(`[worldmonitor/gdelt] ${fromCache ? 'cache' : 'fresh'} category=${q.category}`);

      let parsed;
      try { parsed = JSON.parse(body.toString('utf8')); }
      catch { continue; }

      const items = parsed.articles || [];
      for (const a of items) {
        const classified = classifyGdeltArticle(a, q.category);
        if (classified.signals.length > 0) {
          articles.push(classified);
        }
      }
    } catch (err) {
      logger?.(`[worldmonitor/gdelt] error for ${q.category}: ${err.message}`);
    }
  }

  // Deduplicate by URL
  const seen = new Set();
  const deduped = [];
  for (const a of articles) {
    if (!seen.has(a.url)) {
      seen.add(a.url);
      deduped.push(a);
    }
  }

  // Sort by relevance (signal count * tone negativity)
  deduped.sort((a, b) => b.relevance - a.relevance);
  return deduped.slice(0, limit);
}

/**
 * Build GDELT queries for each compliance-relevant signal category.
 */
function buildGdeltQueries(baseQuery, country) {
  const queries = [];
  const countryClause = country ? ` sourcecountry:${country}` : '';

  // Sanctions-related events
  queries.push({
    category: 'sanctions',
    query: `(sanctions OR "asset freeze" OR designated OR OFAC OR "travel ban")${countryClause}`,
  });

  // FATF / AML regulatory
  queries.push({
    category: 'fatf',
    query: `(FATF OR "grey list" OR "mutual evaluation" OR "money laundering" OR "terrorist financing")${countryClause}`,
  });

  // Precious metals and stones (DPMS-specific)
  queries.push({
    category: 'precious_metals',
    query: `("gold smuggling" OR "gold laundering" OR "precious metals" OR "conflict minerals" OR "blood diamonds")${countryClause}`,
  });

  // Regulatory enforcement actions
  queries.push({
    category: 'regulatory',
    query: `("regulatory action" OR "compliance failure" OR "AML fine" OR "enforcement action" OR "license revocation")${countryClause}`,
  });

  // If a specific query was given, add it too
  if (baseQuery) {
    queries.push({
      category: 'custom',
      query: `${baseQuery}${countryClause}`,
    });
  }

  return queries;
}

/**
 * Classify a GDELT article into compliance signal categories.
 */
function classifyGdeltArticle(article, primaryCategory) {
  const title = article.title || '';
  const url = article.url || '';
  const domain = article.domain || '';
  const tone = typeof article.tone === 'number' ? article.tone : 0;

  const signals = [];
  const titleLower = title.toLowerCase();

  for (const [cat, terms] of Object.entries(SIGNAL_CATEGORIES)) {
    for (const term of terms) {
      if (titleLower.includes(term.toLowerCase())) {
        if (!signals.includes(cat)) signals.push(cat);
        break;
      }
    }
  }

  // If no specific signal matched but we got it from a category query, use that
  if (signals.length === 0 && primaryCategory !== 'custom') {
    signals.push(primaryCategory);
  }

  // Compute relevance score
  const signalWeight = signals.length * 3;
  const toneWeight = Math.max(0, -tone / 3); // More negative = more relevant
  const relevance = signalWeight + toneWeight;

  return {
    title,
    url,
    date: article.seendate || null,
    domain,
    tone,
    country: article.sourcecountry || null,
    category: signals[0] || primaryCategory,
    signals,
    relevance: Math.round(relevance * 100) / 100,
  };
}

/**
 * Classify a World Monitor event into compliance signal categories.
 */
function classifyEvent(event) {
  const title = event.title || event.headline || '';
  const signals = [];
  const titleLower = title.toLowerCase();

  for (const [cat, terms] of Object.entries(SIGNAL_CATEGORIES)) {
    for (const term of terms) {
      if (titleLower.includes(term.toLowerCase())) {
        if (!signals.includes(cat)) signals.push(cat);
        break;
      }
    }
  }

  return {
    title,
    url: event.url || event.link || '',
    date: event.date || event.published || event.seendate || null,
    domain: event.domain || event.source || '',
    tone: event.tone || event.sentiment || 0,
    country: event.country || event.sourcecountry || null,
    category: signals[0] || 'geopolitical',
    signals,
    relevance: signals.length * 3 + Math.max(0, -(event.tone || 0) / 3),
  };
}

/**
 * Score the intelligence feed results for a specific jurisdiction.
 *
 * Returns a risk signal that can be combined with the screening score.
 * Similar to adverse-media scoring but focused on geopolitical signals.
 *
 * @param {Array} events - Intelligence events for the jurisdiction.
 * @returns {{ lift: number, count: number, categories: string[], topSignal: string|null }}
 */
export function scoreIntelligence(events) {
  if (!events || events.length === 0) {
    return { lift: 0, count: 0, categories: [], topSignal: null };
  }

  const categories = [...new Set(events.flatMap(e => e.signals))];
  let totalRelevance = 0;
  for (const e of events) totalRelevance += e.relevance;

  // Sanctions-specific events carry more weight
  const sanctionEvents = events.filter(e => e.signals.includes('sanctions'));
  const fatfEvents = events.filter(e => e.signals.includes('fatf'));
  const preciousMetalEvents = events.filter(e => e.signals.includes('precious_metals'));

  // Compute lift: capped at 0.20 (slightly higher than adverse media's 0.15
  // because geopolitical intelligence is a stronger signal)
  let lift = 0.02; // Base
  lift += Math.min(0.08, sanctionEvents.length * 0.02);
  lift += Math.min(0.05, fatfEvents.length * 0.02);
  lift += Math.min(0.03, preciousMetalEvents.length * 0.01);
  lift += Math.min(0.02, (events.length - sanctionEvents.length - fatfEvents.length) * 0.005);
  lift = Math.min(0.20, lift);

  // Top signal by frequency
  const signalCounts = {};
  for (const e of events) {
    for (const s of e.signals) {
      signalCounts[s] = (signalCounts[s] || 0) + 1;
    }
  }
  const topSignal = Object.entries(signalCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || null;

  return {
    lift: Number(lift.toFixed(4)),
    count: events.length,
    categories,
    topSignal,
  };
}

/**
 * Fetch a jurisdiction risk briefing — combines intelligence events
 * with FATF list status for a country.
 *
 * @param {string} countryCode - ISO 2-letter country code.
 * @param {object} [opts]      - Options passed to fetchIntelligence.
 * @returns {Promise<{ country, fatfStatus, events, score, briefing }>}
 */
export async function jurisdictionBriefing(countryCode, opts = {}) {
  const events = await fetchIntelligence({
    ...opts,
    country: countryCode,
    hours: opts.hours || 72,
  });

  const score = scoreIntelligence(events);

  // Build a plain-text briefing for the MLRO
  const lines = [];
  lines.push(`Jurisdiction intelligence briefing: ${countryCode}`);
  lines.push(`Period: last ${opts.hours || 72} hours`);
  lines.push(`Events: ${events.length} compliance-relevant signals`);
  lines.push(`Risk lift: ${score.lift} (categories: ${score.categories.join(', ') || 'none'})`);

  if (events.length > 0) {
    lines.push('');
    lines.push('Top signals:');
    for (const e of events.slice(0, 10)) {
      const date = e.date ? e.date.split('T')[0] : 'unknown';
      lines.push(`  [${date}] (${e.category}) ${e.title.slice(0, 120)}`);
      lines.push(`    Source: ${e.domain} | Tone: ${e.tone}`);
    }
  }

  lines.push('');
  lines.push('For review by the MLRO.');

  return {
    country: countryCode,
    events,
    score,
    briefing: lines.join('\n'),
  };
}

export { SIGNAL_CATEGORIES, SIGNAL_RE };
