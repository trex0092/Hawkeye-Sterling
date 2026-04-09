/**
 * Unified screening API — the one module the rest of Hawkeye-Sterling
 * should import when it wants to know whether a name hits sanctions,
 * PEP, or adverse-media watchlists.
 *
 * Public surface:
 *   await Screening.init(opts?)                — load store + audit log
 *   await Screening.refreshAll(opts?)          — fetch every enabled source
 *   await Screening.refreshOne(sourceId, opts?)
 *   await Screening.screen(query, opts?)       — screen a single subject
 *   await Screening.batch(queries, opts?)      — screen many subjects
 *   await Screening.decision(caseId, decision, reason, actor?)
 *   await Screening.verify()                   — verify the audit chain
 *   Screening.stats()                          — store + source metadata
 *
 * Query shape:
 *   {
 *     name:       string               // required
 *     aliases?:   string[]             // additional variants to check
 *     type?:      'person' | 'entity'  // default inferred from tokens
 *     dob?:       string               // ISO date or YYYY
 *     countries?: string[]             // ISO-2 or free-text nationalities
 *     subjectId?: string               // caller's customer id for audit
 *     includeAdverseMedia?: boolean    // default true for medium+ bands
 *   }
 *
 * Result shape:
 *   {
 *     caseId:      string              // stable hash of query + timestamp
 *     query:       { ... }             // echoed
 *     decision:    'clear' | 'review' | 'block'
 *     topBand:     'reject' | 'low' | 'medium' | 'high' | 'exact'
 *     hits: [{
 *       id, source, schema, matchedName, score, band, signals, topics,
 *       programs, dob, countries, identifiers
 *     }],
 *     adverseMedia?: [ { title, url, domain, tone, ... } ],
 *     auditSeq:    number              // sequence number in the audit chain
 *   }
 */

import { EntityStore } from './lib/store.js';
import { AuditLog } from './lib/audit.js';
import { scoreMatch, DEFAULT_THRESHOLDS } from './lib/score.js';
import { normalize } from './lib/normalize.js';
import { enforceFreshness, checkFreshness } from './lib/staleness.mjs';
import { createHash } from 'node:crypto';
import { PATHS, SOURCES, THRESHOLDS, CACHE_TTL_MS } from './config.js';
import { search as adverseSearch, scoreAdverseMedia } from './sources/adverse-media.js';

let _store = null;
let _audit = null;
let _initialized = false;

function caseId(query) {
  const canonical = JSON.stringify({
    name: query.name,
    aliases: query.aliases || [],
    dob: query.dob || null,
    countries: query.countries || [],
    ts: Date.now(),
  });
  return 'case_' + createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

function inferType(query) {
  if (query.type) return query.type;
  const norm = normalize(query.name);
  // Heuristic: 2-4 tokens with no company suffix → person; else entity.
  if (norm.tokens.length >= 2 && norm.tokens.length <= 4) return 'person';
  return 'entity';
}

function decideOutcome(topBand) {
  if (topBand === 'high' || topBand === 'exact') return 'block';
  if (topBand === 'medium' || topBand === 'low') return 'review';
  return 'clear';
}

export async function init(opts = {}) {
  if (_initialized) return { store: _store, audit: _audit };
  _store = new EntityStore(opts.storeFile || PATHS.storeFile);
  await _store.load();
  _audit = new AuditLog(opts.auditFile || PATHS.auditFile);
  await _audit.init();
  _initialized = true;
  return { store: _store, audit: _audit };
}

export async function refreshOne(sourceId, opts = {}) {
  await init(opts);
  const source = SOURCES.find(s => s.id === sourceId);
  if (!source) throw new Error(`Unknown source: ${sourceId}`);
  if (!source.enabled && !opts.force) throw new Error(`Source ${sourceId} is disabled`);
  if (source.runtime) throw new Error(`Source ${sourceId} is a runtime source, not bulk`);
  const mod = await import(source.module);
  const ctx = {
    source,
    store: _store,
    audit: _audit,
    cacheDir: PATHS.cacheDir,
    maxAgeMs: opts.force ? 0 : CACHE_TTL_MS.sanctions,
    logger: opts.logger || (() => {}),
  };
  const result = await mod.ingest(ctx);
  await _store.save();
  return result;
}

export async function refreshAll(opts = {}) {
  await init(opts);
  const logger = opts.logger || (() => {});
  const ordered = [...SOURCES]
    .filter(s => s.enabled && !s.runtime)
    .sort((a, b) => b.priority - a.priority);
  const results = {};
  for (const s of ordered) {
    try {
      results[s.id] = await refreshOne(s.id, opts);
      logger(`[${s.id}] ok: total=${results[s.id].total} added=${results[s.id].added.length} removed=${results[s.id].removed.length}`);
    } catch (err) {
      logger(`[${s.id}] FAILED: ${err.message}`);
      results[s.id] = { error: err.message };
      await _audit.append('refresh.error', { source: s.id, error: err.message });
    }
  }
  await _store.save();
  return results;
}

/**
 * Core screening operation. Runs in four stages:
 *   1. candidate retrieval (blocking via phonetic + trigram index)
 *   2. scoring (composite fuzzy + phonetic + dob + country)
 *   3. optional adverse-media enrichment for medium/high hits
 *   4. audit log append with the full result
 */
export async function screen(query, opts = {}) {
  await init(opts);
  if (!query || !query.name) throw new Error('screen: query.name required');
  // Staleness circuit-breaker: block screening if lists are too old
  await enforceFreshness({ force: opts.force, cacheDir: PATHS.cacheDir });
  const thresholds = { ...THRESHOLDS, ...(opts.thresholds || {}) };
  const type = inferType(query);

  // 1. Candidate retrieval across every name the caller gave us.
  const candidateIds = new Set();
  for (const name of [query.name, ...(query.aliases || [])]) {
    for (const id of _store.candidates(name, { maxCandidates: 500 })) candidateIds.add(id);
  }

  // 2. Score each candidate.
  const scored = [];
  for (const id of candidateIds) {
    const cand = _store.get(id);
    if (!cand) continue;
    const res = scoreMatch({ ...query, type }, cand, thresholds);
    if (res.band === 'reject') continue;
    scored.push({
      id: cand.id,
      source: cand.source,
      schema: cand.schema,
      matchedName: res.matchedName,
      score: res.score,
      band: res.band,
      signals: res.signals,
      topics: cand.topics,
      programs: cand.programs,
      dob: cand.dob,
      countries: cand.countries,
      identifiers: cand.identifiers,
    });
  }
  scored.sort((a, b) => b.score - a.score);

  const topBand = scored[0]?.band || 'reject';

  // 3. Adverse-media enrichment. Always for medium+; optional for low/clear.
  let adverseMedia = null;
  const wantAdverse = opts.includeAdverseMedia ?? query.includeAdverseMedia;
  const shouldEnrich =
    wantAdverse === true ||
    (wantAdverse !== false && (topBand === 'medium' || topBand === 'high' || topBand === 'exact'));
  if (shouldEnrich) {
    adverseMedia = await adverseSearch(query.name, {
      cacheDir: PATHS.cacheDir,
      maxAgeMs: CACHE_TTL_MS.adverseMedia,
      logger: opts.logger,
    });
    const am = scoreAdverseMedia(adverseMedia);
    // Lift the top hit's score (cosmetic; decision still driven by band).
    if (scored[0] && am.lift > 0) {
      scored[0].adverseMediaLift = am.lift;
      scored[0].adverseMediaCount = am.count;
    }
  }

  const decision = decideOutcome(topBand);
  const id = caseId(query);
  const result = {
    caseId: id,
    query: { ...query, type },
    decision,
    topBand,
    hits: scored.slice(0, 50),
    adverseMedia: adverseMedia || undefined,
  };

  // 4. Audit log — persist full query + top 10 hits + decision trail.
  const entry = await _audit.append('screen', {
    caseId: id,
    subject_id: query.subjectId || null,
    query: result.query,
    decision,
    topBand,
    hits_preview: result.hits.slice(0, 10),
    adverse_count: adverseMedia ? adverseMedia.length : 0,
  }, opts.actor || 'system');
  result.auditSeq = entry.seq;
  return result;
}

export async function batch(queries, opts = {}) {
  await init(opts);
  const out = [];
  for (const q of queries) out.push(await screen(q, opts));
  return out;
}

/**
 * Record a reviewer decision on a prior screening case. This does NOT
 * modify the original screen entry — it appends a new 'decision' entry
 * referencing the caseId, which preserves the immutable trail.
 */
export async function decision(caseId, outcome, reason, actor = 'mlro') {
  await init();
  if (!['false-positive', 'true-positive', 'escalate', 'block', 'clear'].includes(outcome)) {
    throw new Error(`Invalid decision outcome: ${outcome}`);
  }
  return _audit.append('decision', { caseId, outcome, reason }, actor);
}

export async function override(entityId, action, reason, actor = 'mlro') {
  await init();
  if (!['whitelist', 'unwhitelist'].includes(action)) throw new Error(`Invalid override: ${action}`);
  return _audit.append('override', { entityId, action, reason }, actor);
}

export async function verify() {
  await init();
  return _audit.verify();
}

export function stats() {
  if (!_initialized) return { initialized: false };
  return {
    initialized: true,
    entities: _store.size(),
    sources: _store.sources(),
    auditHead: _audit.head,
  };
}

/**
 * Convenience: run a screen against the FATF jurisdiction risk lists
 * using just a country code. Used by risk-rating code paths.
 */
export { FATF_LISTS } from './config.js';

// Default export for ergonomic `import Screening from '...'` usage.
export default {
  init, refreshOne, refreshAll, screen, batch, decision, override, verify, stats, checkFreshness,
};
