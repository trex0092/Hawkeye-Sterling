/**
 * Entity store for sanctioned / PEP / watchlisted persons and entities.
 *
 * Uses a plain JSON file on disk so the module runs on Netlify functions,
 * local laptops, and CI without a database. For workspaces with more than
 * ~250k entities, swap the backend to SQLite (better-sqlite3) — the public
 * API below is intentionally narrow so that swap is cheap.
 *
 * Indexes maintained:
 *   - id → entity              (primary)
 *   - phoneticKey → Set<id>    (for candidate blocking during screening)
 *   - ngram → Set<id>          (trigram index on normalized names)
 *
 * Entity shape (canonical):
 *   {
 *     id:          string,   // unique per source: "ofac-sdn:12345"
 *     source:      string,   // "ofac-sdn" | "un" | "eu" | "uk-ofsi" | "opensanctions" | ...
 *     schema:      string,   // "Person" | "Organization" | "Vessel" | "Aircraft" | ...
 *     names:       string[], // primary name first, then aliases
 *     dob:         string|null,
 *     countries:   string[],
 *     identifiers: string[], // passports, tax ids, IMO, etc.
 *     programs:    string[], // sanctions programs / list subsets
 *     topics:      string[], // "sanction", "pep", "crime", "wanted", ...
 *     first_seen:  string|null,
 *     last_seen:   string|null,
 *     raw:         object    // original source record (trimmed)
 *   }
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { normalize, ngrams } from './normalize.js';
import { phoneticKeys } from './phonetic.js';

const INDEX_VERSION = 1;

export class EntityStore {
  constructor(path) {
    this.path = path;
    this.entities = new Map();          // id → entity
    this.phoneticIdx = new Map();        // key → Set<id>
    this.ngramIdx = new Map();           // trigram → Set<id>
    this.meta = { version: INDEX_VERSION, sources: {}, updated_at: null };
  }

  /**
   * Load the store from disk. Creates an empty store if the file is absent.
   */
  async load() {
    if (!existsSync(this.path)) return this;
    const raw = await readFile(this.path, 'utf8');
    const data = JSON.parse(raw);
    this.meta = data.meta || this.meta;
    this.entities = new Map(data.entities || []);
    // Rebuild indexes on load. Cheaper and safer than persisting them.
    for (const [id, ent] of this.entities) this._index(id, ent);
    return this;
  }

  async save() {
    await mkdir(dirname(this.path), { recursive: true });
    this.meta.updated_at = new Date().toISOString();
    const data = {
      meta: this.meta,
      entities: [...this.entities.entries()],
    };
    await writeFile(this.path, JSON.stringify(data));
    return this;
  }

  _addToIdx(map, key, id) {
    let set = map.get(key);
    if (!set) { set = new Set(); map.set(key, set); }
    set.add(id);
  }

  _index(id, ent) {
    for (const name of ent.names || []) {
      const norm = normalize(name);
      for (const k of phoneticKeys(norm.stripped)) this._addToIdx(this.phoneticIdx, k, id);
      // 3-gram on the space-joined form; use a leading space so word starts block correctly.
      const padded = ` ${norm.stripped} `;
      for (const g of ngrams(padded, 3)) this._addToIdx(this.ngramIdx, g, id);
    }
  }

  /**
   * Upsert a single canonical entity. Caller is responsible for producing
   * the canonical shape from the source-specific parser.
   */
  upsert(ent) {
    if (!ent.id) throw new Error('EntityStore.upsert: entity.id required');
    const existing = this.entities.get(ent.id);
    if (existing) {
      // Remove old index entries. Simpler to re-index than to diff.
      this._removeFromIndex(ent.id, existing);
    }
    this.entities.set(ent.id, ent);
    this._index(ent.id, ent);
  }

  _removeFromIndex(id, ent) {
    for (const name of ent.names || []) {
      const norm = normalize(name);
      for (const k of phoneticKeys(norm.stripped)) {
        const s = this.phoneticIdx.get(k);
        if (s) { s.delete(id); if (!s.size) this.phoneticIdx.delete(k); }
      }
      const padded = ` ${norm.stripped} `;
      for (const g of ngrams(padded, 3)) {
        const s = this.ngramIdx.get(g);
        if (s) { s.delete(id); if (!s.size) this.ngramIdx.delete(g); }
      }
    }
  }

  /**
   * Remove entities belonging to a source, used during a full refresh when
   * a delta-based update isn't available. Returns removed IDs.
   */
  removeSource(source) {
    const removed = [];
    for (const [id, ent] of this.entities) {
      if (ent.source === source) {
        this._removeFromIndex(id, ent);
        this.entities.delete(id);
        removed.push(id);
      }
    }
    return removed;
  }

  /**
   * Return a candidate set of entity IDs for a query name, using phonetic
   * and trigram blocking. The matcher then scores each candidate.
   */
  candidates(queryName, opts = {}) {
    const { minTrigramOverlap = 2, maxCandidates = 2000 } = opts;
    const norm = normalize(queryName);
    if (!norm.stripped) return [];

    // 1. Phonetic hits — any key match.
    const hits = new Map(); // id → overlap count
    for (const k of phoneticKeys(norm.stripped)) {
      const s = this.phoneticIdx.get(k);
      if (!s) continue;
      for (const id of s) hits.set(id, (hits.get(id) || 0) + 10); // weight phonetic heavy
    }

    // 2. Trigram overlap — rank by how many trigrams match.
    const padded = ` ${norm.stripped} `;
    const qGrams = ngrams(padded, 3);
    const seen = new Set();
    for (const g of qGrams) {
      if (seen.has(g)) continue;
      seen.add(g);
      const s = this.ngramIdx.get(g);
      if (!s) continue;
      for (const id of s) hits.set(id, (hits.get(id) || 0) + 1);
    }

    const ranked = [...hits.entries()]
      .filter(([, overlap]) => overlap >= minTrigramOverlap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxCandidates)
      .map(([id]) => id);
    return ranked;
  }

  get(id) { return this.entities.get(id); }
  size() { return this.entities.size; }
  sources() { return this.meta.sources; }

  /**
   * Set metadata for a source after a successful refresh — version hash,
   * entity count, last refreshed timestamp. Persisted in meta.
   */
  setSourceMeta(source, info) {
    this.meta.sources[source] = {
      ...(this.meta.sources[source] || {}),
      ...info,
      refreshed_at: new Date().toISOString(),
    };
  }
}
