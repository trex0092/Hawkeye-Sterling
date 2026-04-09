/**
 * Knowledge Agent — Queryable Compliance Intelligence Brain.
 *
 * Builds searchable knowledge corpora from Hawkeye-Sterling's compliance
 * history and enables natural-language Q&A over screening results,
 * filing decisions, risk assessments, and regulatory observations.
 *
 * Inspired by claude-mem v12.1.0 Knowledge Agent system.
 * Adapted for AML/CFT compliance with domain-specific corpus types.
 *
 * Architecture:
 *   1. CorpusBuilder — Compiles filtered compliance data into corpora
 *   2. CorpusIndex — Full-text search index over corpus entries
 *   3. KnowledgeAgent — Manages query sessions with context priming
 *
 * Corpus types:
 *   - screening_history: All screening results and decisions
 *   - filing_archive: STR/SAR/DPMSR filing history
 *   - entity_profiles: Entity risk profiles and CDD records
 *   - regulatory_changes: Regulatory update timeline
 *   - mlro_decisions: MLRO decision register
 *   - intelligence_feed: World Monitor intelligence archive
 *
 * Storage: ~/.hawkeye/corpora/ (or configurable)
 *
 * Reference: https://github.com/thedotmack/claude-mem/releases/tag/v12.1.0
 */

import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const DEFAULT_CORPORA_DIR = resolve(process.env.HOME || '/tmp', '.hawkeye', 'corpora');

const CORPUS_TYPES = {
  screening_history: {
    name: 'Screening History',
    description: 'All sanctions/PEP screening results, decisions, and overrides',
    sources: ['screening audit log', 'decision register'],
  },
  filing_archive: {
    name: 'Filing Archive',
    description: 'STR/SAR/DPMSR/CNMR filing drafts, approvals, and submissions',
    sources: ['filing register', 'goAML exports'],
  },
  entity_profiles: {
    name: 'Entity Profiles',
    description: 'Counterparty risk profiles, CDD records, and UBO declarations',
    sources: ['counterparty register', 'CDD refresh tracker'],
  },
  regulatory_changes: {
    name: 'Regulatory Changes',
    description: 'Timeline of regulatory updates, FATF decisions, and supervisory guidance',
    sources: ['regulatory cache', 'World Monitor intelligence'],
  },
  mlro_decisions: {
    name: 'MLRO Decisions',
    description: 'MLRO decision register with rationale and outcomes',
    sources: ['decision tracker', 'filing workflow'],
  },
  intelligence_feed: {
    name: 'Intelligence Feed',
    description: 'World Monitor geopolitical intelligence and early warnings',
    sources: ['World Monitor', 'GDELT', 'adverse media'],
  },
};

// ── Corpus Builder ─────────────────────────────────────────────

export class CorpusBuilder {
  constructor(opts = {}) {
    this.corporaDir = opts.corporaDir || DEFAULT_CORPORA_DIR;
    this.projectRoot = opts.projectRoot || process.cwd();
  }

  /**
   * Build a corpus from compliance data.
   *
   * @param {object} params
   * @param {string} params.type - Corpus type (screening_history, filing_archive, etc.)
   * @param {string} [params.name] - Custom corpus name
   * @param {object} [params.filter] - Filter criteria
   * @param {string} [params.filter.entity] - Filter by entity name
   * @param {string} [params.filter.since] - Filter by date (ISO string)
   * @param {string} [params.filter.until] - Filter by date
   * @param {string[]} [params.filter.categories] - Filter observation categories
   * @returns {Corpus}
   */
  async build(params) {
    const { type, name, filter = {} } = params;
    if (!CORPUS_TYPES[type]) {
      throw new Error(`Unknown corpus type: ${type}. Available: ${Object.keys(CORPUS_TYPES).join(', ')}`);
    }

    await mkdir(this.corporaDir, { recursive: true });

    const corpusId = `${type}-${Date.now().toString(36)}`;
    const corpusPath = join(this.corporaDir, `${corpusId}.json`);

    // Gather observations from memory system
    const observations = await this._gatherObservations(type, filter);

    // Render into corpus entries
    const entries = observations.map((obs, i) => ({
      id: `${corpusId}:${i}`,
      content: typeof obs === 'string' ? obs : JSON.stringify(obs),
      metadata: {
        type,
        timestamp: obs.timestamp || obs.date || new Date().toISOString(),
        entity: obs.entity || obs.entityName || null,
        category: obs.category || type,
      },
      tokens: tokenize(typeof obs === 'string' ? obs : JSON.stringify(obs)),
    }));

    const corpus = {
      id: corpusId,
      type,
      name: name || CORPUS_TYPES[type].name,
      description: CORPUS_TYPES[type].description,
      entryCount: entries.length,
      filter,
      entries,
      builtAt: new Date().toISOString(),
      hash: createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 16),
    };

    await writeFile(corpusPath, JSON.stringify(corpus, null, 2), 'utf8');

    return {
      id: corpus.id,
      type: corpus.type,
      name: corpus.name,
      entryCount: corpus.entryCount,
      path: corpusPath,
      builtAt: corpus.builtAt,
      hash: corpus.hash,
    };
  }

  async _gatherObservations(type, filter) {
    const observations = [];

    // Try to load from memory system
    try {
      const memPath = resolve(this.projectRoot, 'claude-mem', 'index.mjs');
      if (existsSync(memPath)) {
        const mem = (await import(memPath)).default;
        const results = mem.search(type.replace('_', ' '), {
          category: filter.categories?.[0],
          entity: filter.entity,
          limit: 1000,
        });
        observations.push(...results);
        mem.close();
      }
    } catch (err) {
      console.warn(`[knowledge-agent] Memory search failed: ${err.message}`);
    }

    // Load from history files based on type
    try {
      const historyDirs = {
        screening_history: ['history/registers/sanctions-screening'],
        filing_archive: ['history/filings'],
        entity_profiles: ['history/registers'],
        regulatory_changes: ['history/registers/regulatory-updates'],
        mlro_decisions: ['history/mlro-weekly', 'history/mlro-monthly'],
        intelligence_feed: ['history/registers/adverse-media'],
      };

      const dirs = historyDirs[type] || [];
      for (const dir of dirs) {
        const fullPath = resolve(this.projectRoot, dir);
        if (!existsSync(fullPath)) continue;

        const files = await readdir(fullPath);
        for (const file of files.slice(-100)) { // Last 100 files
          try {
            const content = await readFile(join(fullPath, file), 'utf8');
            const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
            observations.push({
              content: content.slice(0, 5000), // Cap per entry
              date: dateMatch?.[1] || null,
              source: file,
              category: type,
            });
          } catch { /* skip unreadable files */ }
        }
      }
    } catch (err) {
      console.warn(`[knowledge-agent] History load failed: ${err.message}`);
    }

    // Apply date filters
    if (filter.since || filter.until) {
      return observations.filter(obs => {
        const date = obs.date || obs.timestamp;
        if (!date) return true;
        if (filter.since && date < filter.since) return false;
        if (filter.until && date > filter.until) return false;
        return true;
      });
    }

    return observations;
  }

  /** List all built corpora. */
  async list() {
    if (!existsSync(this.corporaDir)) return [];

    const files = await readdir(this.corporaDir);
    const corpora = [];

    for (const file of files.filter(f => f.endsWith('.json'))) {
      try {
        const data = JSON.parse(await readFile(join(this.corporaDir, file), 'utf8'));
        corpora.push({
          id: data.id,
          type: data.type,
          name: data.name,
          entryCount: data.entryCount,
          builtAt: data.builtAt,
          hash: data.hash,
        });
      } catch { /* skip corrupt files */ }
    }

    return corpora.sort((a, b) => b.builtAt.localeCompare(a.builtAt));
  }

  /** Delete a corpus. */
  async delete(corpusId) {
    const files = await readdir(this.corporaDir);
    const match = files.find(f => f.startsWith(corpusId));
    if (match) {
      await unlink(join(this.corporaDir, match));
      return { deleted: true, id: corpusId };
    }
    return { deleted: false, id: corpusId };
  }

  /** Rebuild a corpus with fresh data. */
  async rebuild(corpusId) {
    const files = await readdir(this.corporaDir);
    const match = files.find(f => f.startsWith(corpusId));
    if (!match) throw new Error(`Corpus not found: ${corpusId}`);

    const existing = JSON.parse(await readFile(join(this.corporaDir, match), 'utf8'));
    await unlink(join(this.corporaDir, match));
    return this.build({ type: existing.type, name: existing.name, filter: existing.filter });
  }
}

// ── Corpus Index (Full-Text Search) ────────────────────────────

export class CorpusIndex {
  constructor() {
    this.entries = [];
    this.invertedIndex = new Map(); // term -> Set<entryIdx>
  }

  /** Load a corpus into the index. */
  load(corpus) {
    for (const entry of corpus.entries) {
      const idx = this.entries.length;
      this.entries.push(entry);

      for (const token of entry.tokens) {
        if (!this.invertedIndex.has(token)) {
          this.invertedIndex.set(token, new Set());
        }
        this.invertedIndex.get(token).add(idx);
      }
    }
  }

  /**
   * Search the corpus using BM25-inspired ranking.
   *
   * @param {string} query - Natural language query
   * @param {number} [limit=20] - Max results
   * @returns {Array<{ entry, score, highlights }>}
   */
  search(query, limit = 20) {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const scores = new Map(); // entryIdx -> score
    const N = this.entries.length;
    const k1 = 1.2;
    const b = 0.75;
    const avgDl = N > 0 ? this.entries.reduce((s, e) => s + e.tokens.length, 0) / N : 1;

    for (const qt of queryTokens) {
      const postings = this.invertedIndex.get(qt);
      if (!postings) continue;

      const df = postings.size;
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

      for (const idx of postings) {
        const dl = this.entries[idx].tokens.length;
        const tf = this.entries[idx].tokens.filter(t => t === qt).length;
        const score = idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgDl));

        scores.set(idx, (scores.get(idx) || 0) + score);
      }
    }

    // Sort by score
    return [...scores.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([idx, score]) => ({
        entry: this.entries[idx],
        score: Math.round(score * 1000) / 1000,
        snippet: this.entries[idx].content.slice(0, 200),
      }));
  }
}

// ── Knowledge Agent ────────────────────────────────────────────

export class KnowledgeAgent {
  constructor(opts = {}) {
    this.builder = new CorpusBuilder(opts);
    this.index = new CorpusIndex();
    this.sessions = new Map();
    this._primed = false;
  }

  /**
   * Prime the agent with one or more corpora.
   *
   * @param {string[]} corpusIds - IDs of corpora to load
   */
  async prime(corpusIds) {
    const corporaDir = this.builder.corporaDir;
    if (!existsSync(corporaDir)) throw new Error('No corpora directory found. Build a corpus first.');

    const files = await readdir(corporaDir);

    for (const corpusId of corpusIds) {
      const match = files.find(f => f.startsWith(corpusId));
      if (!match) throw new Error(`Corpus not found: ${corpusId}`);

      const corpus = JSON.parse(await readFile(join(corporaDir, match), 'utf8'));
      this.index.load(corpus);
    }

    this._primed = true;
    return { primed: true, corpora: corpusIds.length, totalEntries: this.index.entries.length };
  }

  /**
   * Query the knowledge agent.
   *
   * @param {string} question - Natural language question
   * @param {object} [opts]
   * @param {number} [opts.contextSize=10] - Number of context entries to use
   * @returns {QueryResult}
   */
  async query(question, opts = {}) {
    if (!this._primed) throw new Error('Agent not primed. Call prime() first.');

    const contextSize = opts.contextSize || 10;
    const results = this.index.search(question, contextSize);

    if (results.length === 0) {
      return {
        question,
        answer: 'No relevant compliance records found for this query.',
        sources: [],
        confidence: 0,
      };
    }

    // Build context-grounded answer
    const context = results.map(r => r.snippet).join('\n---\n');
    const topScore = results[0].score;
    const confidence = Math.min(1, topScore / 10);

    // Generate synthesized answer from sources
    const entityMentions = new Set();
    const dateMentions = new Set();
    const categories = new Set();

    for (const r of results) {
      if (r.entry.metadata?.entity) entityMentions.add(r.entry.metadata.entity);
      if (r.entry.metadata?.timestamp) dateMentions.add(r.entry.metadata.timestamp.slice(0, 10));
      if (r.entry.metadata?.category) categories.add(r.entry.metadata.category);
    }

    const answer = [
      `Found ${results.length} relevant records.`,
      entityMentions.size > 0 ? `Entities mentioned: ${[...entityMentions].join(', ')}` : '',
      dateMentions.size > 0 ? `Date range: ${[...dateMentions].sort()[0]} to ${[...dateMentions].sort().pop()}` : '',
      categories.size > 0 ? `Categories: ${[...categories].join(', ')}` : '',
      '',
      'Top relevant excerpts:',
      ...results.slice(0, 5).map((r, i) =>
        `${i + 1}. [Score: ${r.score}] ${r.snippet}`
      ),
    ].filter(Boolean).join('\n');

    return {
      question,
      answer,
      sources: results.map(r => ({
        score: r.score,
        snippet: r.snippet,
        entity: r.entry.metadata?.entity,
        date: r.entry.metadata?.timestamp,
        category: r.entry.metadata?.category,
      })),
      confidence: Math.round(confidence * 100) / 100,
      queriedAt: new Date().toISOString(),
    };
  }

  /**
   * Build and immediately prime a corpus.
   */
  async buildAndPrime(params) {
    const corpus = await this.builder.build(params);
    await this.prime([corpus.id]);
    return { corpus, primed: true };
  }
}

// ── Tokenizer ──────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'this', 'that', 'these', 'those', 'it', 'its',
]);

function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

export { CORPUS_TYPES, DEFAULT_CORPORA_DIR, tokenize };
