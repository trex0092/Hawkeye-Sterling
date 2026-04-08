-- Hawkeye-Sterling Claude Memory System — SQLite Schema
-- Tracks sessions, observations, summaries, and context tiers.
-- All timestamps are ISO-8601 UTC strings for audit-trail compatibility.

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  started_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ended_at      TEXT,
  summary       TEXT,
  token_count   INTEGER DEFAULT 0,
  compressed    INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS observations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL REFERENCES sessions(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  category      TEXT NOT NULL,
  content       TEXT NOT NULL,
  tool_name     TEXT,
  file_path     TEXT,
  entity_name   TEXT,
  importance    INTEGER DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  tokens        INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS summaries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT REFERENCES sessions(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  tier          TEXT NOT NULL CHECK (tier IN ('L0', 'L1', 'L2')),
  category      TEXT,
  content       TEXT NOT NULL,
  tokens        INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS context_injections (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL REFERENCES sessions(id),
  injected_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  tier          TEXT NOT NULL,
  content       TEXT NOT NULL,
  tokens        INTEGER DEFAULT 0
);

-- Indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_obs_session    ON observations(session_id);
CREATE INDEX IF NOT EXISTS idx_obs_category   ON observations(category);
CREATE INDEX IF NOT EXISTS idx_obs_entity     ON observations(entity_name);
CREATE INDEX IF NOT EXISTS idx_obs_created    ON observations(created_at);
CREATE INDEX IF NOT EXISTS idx_obs_importance ON observations(importance DESC);
CREATE INDEX IF NOT EXISTS idx_sum_tier       ON summaries(tier);
CREATE INDEX IF NOT EXISTS idx_sum_category   ON summaries(category);
CREATE INDEX IF NOT EXISTS idx_inj_session    ON context_injections(session_id);

-- FTS5 full-text search on observation content
CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
  content,
  category,
  entity_name,
  content=observations,
  content_rowid=id,
  tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS obs_ai AFTER INSERT ON observations BEGIN
  INSERT INTO observations_fts(rowid, content, category, entity_name)
  VALUES (new.id, new.content, new.category, new.entity_name);
END;

CREATE TRIGGER IF NOT EXISTS obs_ad AFTER DELETE ON observations BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, content, category, entity_name)
  VALUES ('delete', old.id, old.content, old.category, old.entity_name);
END;

CREATE TRIGGER IF NOT EXISTS obs_au AFTER UPDATE ON observations BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, content, category, entity_name)
  VALUES ('delete', old.id, old.content, old.category, old.entity_name);
  INSERT INTO observations_fts(rowid, content, category, entity_name)
  VALUES (new.id, new.content, new.category, new.entity_name);
END;
