/**
 * Compliance Analyzer Claude Memory System -- Public API
 *
 * Persistent memory for Claude Code sessions. Captures compliance
 * decisions, screening results, threshold alerts, supply chain events,
 * and workflow notes across sessions.
 */

import { randomUUID } from 'node:crypto';
import * as db from './db/sqlite.mjs';
import { loadTieredContext } from './context/hierarchy.mjs';
import { compressSession } from './context/compressor.mjs';
import { hybridSearch } from './search/hybrid.mjs';
import { CATEGORIES, COMPRESS_THRESHOLD } from './config.mjs';

let _currentSessionId = null;

const mem = {
  startSession(id) {
    _currentSessionId = id || randomUUID();
    db.createSession(_currentSessionId);
    return _currentSessionId;
  },

  get sessionId() { return _currentSessionId; },

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

  observe({ category, content, toolName, filePath, entityName, importance = 5 }) {
    if (!_currentSessionId) {
      throw new Error('No active session. Call mem.startSession() first.');
    }
    if (!CATEGORIES.includes(category)) {
      throw new Error(`Invalid category "${category}". Must be one of: ${CATEGORIES.join(', ')}`);
    }
    return db.addObservation({
      sessionId: _currentSessionId,
      category, content, toolName, filePath, entityName, importance,
      tokens: Math.ceil((content || '').length / 4),
    });
  },

  loadContext(opts = {}) {
    return loadTieredContext({
      sessionId: opts.sessionId || _currentSessionId,
      query: opts.query,
    });
  },

  search(query, opts = {}) { return hybridSearch(query, opts); },

  getObservations(ids) {
    const dbInstance = db.getDb();
    const placeholders = ids.map(() => '?').join(',');
    return dbInstance.prepare(
      `SELECT * FROM observations WHERE id IN (${placeholders}) ORDER BY created_at`
    ).all(...ids);
  },

  addSummary({ tier, content, category }) {
    return db.addSummary({
      sessionId: _currentSessionId, tier, category, content,
      tokens: Math.ceil((content || '').length / 4),
    });
  },

  stats() { return db.getStats(); },
  recentSessions(limit = 5) { return db.listRecentSessions(limit); },
  close() { db.closeDb(); },
};

export default mem;
