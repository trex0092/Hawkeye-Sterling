/**
 * Hawkeye-Sterling Claude Memory System — Public API
 *
 * Persistent memory for Claude Code sessions. Captures compliance
 * decisions, screening results, regulatory observations, and workflow
 * notes. Injects relevant context into future sessions via a tiered
 * hierarchy (L0 core / L1 session / L2 archive).
 *
 * Usage:
 *   import mem from './claude-mem/index.mjs';
 *   mem.startSession('session-abc');
 *   mem.observe({ category: 'screening_result', content: '...' });
 *   const ctx = mem.loadContext();
 *   mem.endSession();
 */

import { randomUUID } from 'node:crypto';
import * as db from './db/sqlite.mjs';
import { loadTieredContext } from './context/hierarchy.mjs';
import { compressSession } from './context/compressor.mjs';
import { hybridSearch } from './search/hybrid.mjs';
import { CATEGORIES, COMPRESS_THRESHOLD } from './config.mjs';

let _currentSessionId = null;

const mem = {
  // ── Session lifecycle ─────────────────────────────────────

  /**
   * Begin a new memory session.
   * @param {string} [id] - Session ID (auto-generated if omitted).
   * @returns {string} The session ID.
   */
  startSession(id) {
    _currentSessionId = id || randomUUID();
    db.createSession(_currentSessionId);
    return _currentSessionId;
  },

  /** @returns {string|null} Current session ID. */
  get sessionId() {
    return _currentSessionId;
  },

  /**
   * End the current session. Compresses if above threshold.
   * @param {string} [summary] - Optional session summary.
   */
  async endSession(summary) {
    if (!_currentSessionId) return;

    const count = db.countSessionObservations(_currentSessionId);
    if (count >= COMPRESS_THRESHOLD) {
      const compressed = await compressSession(_currentSessionId);
      summary = summary || compressed;
    }

    db.endSession(_currentSessionId, summary || null);
    _currentSessionId = null;
  },

  // ── Observations ──────────────────────────────────────────

  /**
   * Record an observation in the current session.
   *
   * @param {object} opts
   * @param {string} opts.category   - One of CATEGORIES.
   * @param {string} opts.content    - The observation text.
   * @param {string} [opts.toolName] - Tool that produced this observation.
   * @param {string} [opts.filePath] - Relevant file path.
   * @param {string} [opts.entityName] - Entity (counterparty) name.
   * @param {number} [opts.importance=5] - 1-10 importance score.
   * @returns {number} Observation row ID.
   */
  observe({ category, content, toolName, filePath, entityName, importance = 5 }) {
    if (!_currentSessionId) {
      throw new Error('No active session. Call mem.startSession() first.');
    }
    if (!CATEGORIES.includes(category)) {
      throw new Error(`Invalid category "${category}". Must be one of: ${CATEGORIES.join(', ')}`);
    }
    return db.addObservation({
      sessionId: _currentSessionId,
      category,
      content,
      toolName,
      filePath,
      entityName,
      importance,
      tokens: estimateTokens(content),
    });
  },

  // ── Context loading (L0/L1/L2) ───────────────────────────

  /**
   * Load tiered context for injection into a Claude Code session.
   * @param {object} [opts]
   * @param {string} [opts.sessionId] - Session to build context for.
   * @param {string} [opts.query]     - Optional query to bias L2 retrieval.
   * @returns {{ l0: string, l1: string, l2: string, combined: string, tokens: number }}
   */
  loadContext(opts = {}) {
    return loadTieredContext({
      sessionId: opts.sessionId || _currentSessionId,
      query: opts.query,
    });
  },

  // ── Search ────────────────────────────────────────────────

  /**
   * Search memory with hybrid keyword + relevance scoring.
   *
   * @param {string} query           - Natural language or keyword query.
   * @param {object} [opts]
   * @param {string} [opts.category] - Filter by category.
   * @param {number} [opts.limit=20] - Max results.
   * @returns {Array<object>} Matching observations ranked by relevance.
   */
  search(query, opts = {}) {
    return hybridSearch(query, opts);
  },

  /**
   * Get observations by ID list (the "get_observations" layer from
   * claude-mem's 3-layer search pattern).
   *
   * @param {number[]} ids - Observation IDs to fetch.
   * @returns {Array<object>}
   */
  getObservations(ids) {
    const dbInstance = db.getDb();
    const placeholders = ids.map(() => '?').join(',');
    return dbInstance.prepare(
      `SELECT * FROM observations WHERE id IN (${placeholders}) ORDER BY created_at`
    ).all(...ids);
  },

  // ── Summaries ─────────────────────────────────────────────

  /**
   * Add a manual summary to a tier.
   * @param {object} opts
   * @param {'L0'|'L1'|'L2'} opts.tier
   * @param {string} opts.content
   * @param {string} [opts.category]
   */
  addSummary({ tier, content, category }) {
    return db.addSummary({
      sessionId: _currentSessionId,
      tier,
      category,
      content,
      tokens: estimateTokens(content),
    });
  },

  // ── Utilities ─────────────────────────────────────────────

  /** Get memory system statistics. */
  stats() {
    return db.getStats();
  },

  /** List recent sessions. */
  recentSessions(limit = 5) {
    return db.listRecentSessions(limit);
  },

  /** Cleanly shut down the database. */
  close() {
    db.closeDb();
  },
};

/**
 * Rough token estimate: ~4 chars per token for English text.
 * Good enough for budget tracking — not used for billing.
 */
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

export default mem;
