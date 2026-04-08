/**
 * SQLite storage backend for the Claude memory system.
 *
 * Uses better-sqlite3 for synchronous, transactional access.
 * Automatically initialises the schema on first run.
 */

import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATHS } from '../config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, 'schema.sql');

let _db = null;

/**
 * Load better-sqlite3 via createRequire (CJS interop from ESM).
 * Fails fast with a clear message if the package is missing.
 */
function loadSqlite() {
  try {
    const require = createRequire(import.meta.url);
    return require('better-sqlite3');
  } catch {
    throw new Error(
      'better-sqlite3 is not installed. Run: cd claude-mem && npm install'
    );
  }
}

/**
 * Open (or create) the memory database. Idempotent.
 * @returns {import('better-sqlite3').Database}
 */
export function getDb() {
  if (_db) return _db;

  // Ensure data directory exists
  const dir = dirname(PATHS.dbFile);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const Database = loadSqlite();
  _db = new Database(PATHS.dbFile);

  // Performance pragmas
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');
  _db.pragma('foreign_keys = ON');

  // Run schema
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  _db.exec(schema);

  return _db;
}

/** Close the database connection. */
export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ── Session CRUD ──────────────────────────────────────────────

export function createSession(id) {
  const db = getDb();
  db.prepare('INSERT INTO sessions (id) VALUES (?)').run(id);
  return id;
}

export function endSession(id, summary = null) {
  const db = getDb();
  db.prepare(
    `UPDATE sessions
       SET ended_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
           summary  = ?
     WHERE id = ?`
  ).run(summary, id);
}

export function getSession(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
}

export function listRecentSessions(limit = 5) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?'
  ).all(limit);
}

// ── Observation CRUD ──────────────────────────────────────────

export function addObservation({
  sessionId,
  category,
  content,
  toolName = null,
  filePath = null,
  entityName = null,
  importance = 5,
  tokens = 0,
}) {
  const db = getDb();
  const info = db.prepare(
    `INSERT INTO observations
       (session_id, category, content, tool_name, file_path, entity_name, importance, tokens)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(sessionId, category, content, toolName, filePath, entityName, importance, tokens);
  return info.lastInsertRowid;
}

export function getObservations(sessionId) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM observations WHERE session_id = ? ORDER BY created_at'
  ).all(sessionId);
}

export function getObservationsByCategory(category, limit = 50) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM observations WHERE category = ? ORDER BY created_at DESC LIMIT ?'
  ).all(category, limit);
}

export function getHighImportanceObservations(minImportance = 7, limit = 30) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM observations WHERE importance >= ? ORDER BY importance DESC, created_at DESC LIMIT ?'
  ).all(minImportance, limit);
}

export function countSessionObservations(sessionId) {
  const db = getDb();
  const row = db.prepare(
    'SELECT COUNT(*) AS cnt FROM observations WHERE session_id = ?'
  ).get(sessionId);
  return row.cnt;
}

// ── Summary CRUD ──────────────────────────────────────────────

export function addSummary({ sessionId = null, tier, category = null, content, tokens = 0 }) {
  const db = getDb();
  const info = db.prepare(
    `INSERT INTO summaries (session_id, tier, category, content, tokens)
     VALUES (?, ?, ?, ?, ?)`
  ).run(sessionId, tier, category, content, tokens);
  return info.lastInsertRowid;
}

export function getSummariesByTier(tier, limit = 20) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM summaries WHERE tier = ? ORDER BY created_at DESC LIMIT ?'
  ).all(tier, limit);
}

// ── Context Injection Log ─────────────────────────────────────

export function logInjection({ sessionId, tier, content, tokens = 0 }) {
  const db = getDb();
  db.prepare(
    `INSERT INTO context_injections (session_id, tier, content, tokens)
     VALUES (?, ?, ?, ?)`
  ).run(sessionId, tier, content, tokens);
}

// ── Full-Text Search ──────────────────────────────────────────

export function searchObservations(query, limit = 20) {
  const db = getDb();
  return db.prepare(
    `SELECT o.*, bm25(observations_fts) AS rank
       FROM observations_fts f
       JOIN observations o ON o.id = f.rowid
      WHERE observations_fts MATCH ?
      ORDER BY rank
      LIMIT ?`
  ).all(query, limit);
}

// ── Stats ─────────────────────────────────────────────────────

export function getStats() {
  const db = getDb();
  const sessions = db.prepare('SELECT COUNT(*) AS cnt FROM sessions').get().cnt;
  const observations = db.prepare('SELECT COUNT(*) AS cnt FROM observations').get().cnt;
  const summaries = db.prepare('SELECT COUNT(*) AS cnt FROM summaries').get().cnt;
  const categories = db.prepare(
    'SELECT category, COUNT(*) AS cnt FROM observations GROUP BY category ORDER BY cnt DESC'
  ).all();
  return { sessions, observations, summaries, categories };
}
