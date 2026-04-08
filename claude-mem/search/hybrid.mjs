/**
 * Hybrid search — combines FTS5 keyword search with category/entity
 * filtering and importance-weighted scoring.
 *
 * Implements the 3-layer search pattern from claude-mem:
 *   1. search()           — compact index with IDs (~50-100 tokens)
 *   2. timeline()         — chronological context around results
 *   3. getObservations()  — full details for filtered IDs
 *
 * This module handles layer 1 (search) and layer 2 (timeline).
 * Layer 3 is in the main index.mjs via mem.getObservations().
 */

import * as db from '../db/sqlite.mjs';
import { SEARCH_DEFAULTS } from '../config.mjs';

/**
 * Layer 1: Compact search returning IDs and snippets.
 *
 * @param {string} query
 * @param {object} [opts]
 * @param {string} [opts.category]   - Filter by observation category.
 * @param {string} [opts.entity]     - Filter by entity name.
 * @param {number} [opts.minImportance] - Minimum importance score.
 * @param {number} [opts.limit]      - Max results.
 * @returns {Array<{ id: number, category: string, entity: string|null, date: string, snippet: string, importance: number, score: number }>}
 */
export function hybridSearch(query, opts = {}) {
  const limit = opts.limit || SEARCH_DEFAULTS.maxResults;

  // Start with FTS results
  let results = [];
  if (query && query.trim()) {
    // Sanitise FTS5 query: wrap in quotes for phrase match, OR split terms
    const ftsQuery = sanitiseFtsQuery(query);
    try {
      results = db.searchObservations(ftsQuery, limit * 2);
    } catch {
      // FTS query syntax error — fall back to LIKE
      results = likeFallback(query, limit * 2);
    }
  } else {
    // No query text — return recent high-importance observations
    results = db.getHighImportanceObservations(opts.minImportance || 5, limit);
  }

  // Apply filters
  if (opts.category) {
    results = results.filter(r => r.category === opts.category);
  }
  if (opts.entity) {
    const entityLower = opts.entity.toLowerCase();
    results = results.filter(r =>
      r.entity_name && r.entity_name.toLowerCase().includes(entityLower)
    );
  }
  if (opts.minImportance) {
    results = results.filter(r => r.importance >= opts.minImportance);
  }

  // Score and rank
  const scored = results.map(r => ({
    id: r.id,
    category: r.category,
    entity: r.entity_name,
    date: r.created_at?.split('T')[0],
    snippet: truncate(r.content, 100),
    importance: r.importance,
    score: computeScore(r, query),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Layer 2: Timeline view showing chronological context around results.
 *
 * @param {number[]} ids - Observation IDs from layer 1.
 * @param {number} [windowMinutes=60] - Time window around each result.
 * @returns {Array<object>}
 */
export function timeline(ids, windowMinutes = 60) {
  if (ids.length === 0) return [];

  const dbInstance = db.getDb();
  const observations = dbInstance.prepare(
    `SELECT * FROM observations WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at`
  ).all(...ids);

  if (observations.length === 0) return [];

  // Get surrounding observations within the time window
  const windowMs = windowMinutes * 60 * 1000;
  const allNeighbours = [];

  for (const obs of observations) {
    const t = new Date(obs.created_at).getTime();
    const from = new Date(t - windowMs).toISOString();
    const to = new Date(t + windowMs).toISOString();

    const neighbours = dbInstance.prepare(
      `SELECT * FROM observations
       WHERE session_id = ? AND created_at BETWEEN ? AND ?
       ORDER BY created_at`
    ).all(obs.session_id, from, to);

    allNeighbours.push({
      anchor: obs.id,
      anchorDate: obs.created_at,
      context: neighbours.map(n => ({
        id: n.id,
        date: n.created_at,
        category: n.category,
        entity: n.entity_name,
        content: truncate(n.content, 200),
        isAnchor: n.id === obs.id,
      })),
    });
  }

  return allNeighbours;
}

// ── Internal helpers ────────────────────────────────────────

/**
 * Sanitise a user query for FTS5.
 * Splits into tokens and joins with OR for broad matching.
 */
function sanitiseFtsQuery(query) {
  const tokens = query
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .split(/\s+/)
    .filter(t => t.length > 1)
    .map(t => `"${t}"`);

  return tokens.length > 0 ? tokens.join(' OR ') : query;
}

/** Fallback LIKE-based search when FTS query fails. */
function likeFallback(query, limit) {
  const dbInstance = db.getDb();
  const pattern = `%${query}%`;
  return dbInstance.prepare(
    `SELECT * FROM observations
     WHERE content LIKE ? OR entity_name LIKE ? OR category LIKE ?
     ORDER BY importance DESC, created_at DESC
     LIMIT ?`
  ).all(pattern, pattern, pattern, limit);
}

/**
 * Compute a relevance score combining FTS rank, importance, and recency.
 */
function computeScore(obs, query) {
  let score = 0;

  // FTS rank (if available, lower = better match in BM25)
  if (obs.rank != null) {
    score += Math.max(0, 10 + obs.rank); // BM25 returns negative
  }

  // Importance boost
  score += (obs.importance || 5) * 1.5;

  // Recency boost (observations in last 7 days get up to +5)
  if (obs.created_at) {
    const ageMs = Date.now() - new Date(obs.created_at).getTime();
    const ageDays = ageMs / 86400000;
    if (ageDays < 7) score += 5 * (1 - ageDays / 7);
  }

  // Exact entity name match boost
  if (query && obs.entity_name) {
    if (obs.entity_name.toLowerCase().includes(query.toLowerCase())) {
      score += 8;
    }
  }

  // Category boost for compliance-critical categories
  const criticalCategories = ['compliance_decision', 'mlro_directive', 'filing_activity'];
  if (criticalCategories.includes(obs.category)) {
    score += 3;
  }

  return Math.round(score * 100) / 100;
}

function truncate(text, maxLen) {
  if (!text) return '';
  const clean = text.replace(/\n/g, ' ').trim();
  return clean.length <= maxLen ? clean : clean.slice(0, maxLen - 3) + '...';
}
