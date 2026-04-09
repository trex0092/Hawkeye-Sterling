/**
 * Rad-Mem Bridge — Advanced Memory System Upgrade.
 *
 * Bridges Hawkeye-Sterling's existing claude-mem system with rad-mem
 * capabilities for enhanced compliance memory:
 *
 *   1. SEMANTIC SEARCH — Concept-based memory retrieval beyond keyword matching
 *   2. PROGRESSIVE DISCLOSURE — Layered context injection with token budgets
 *   3. SESSION COMPRESSION — Summarize long sessions into compact observations
 *   4. MEMORY VIEWER — HTTP endpoint serving memory visualization data
 *   5. ENDLESS MODE — Compress tool outputs to extend session length ~20x
 *
 * This module wraps the existing SQLite-based claude-mem and adds:
 *   - TF-IDF scoring for semantic-like retrieval (no external vector DB)
 *   - Relevance-ranked progressive disclosure with token estimation
 *   - Session summary generation from observation sequences
 *   - JSON API for the memory web viewer
 *
 * Inspired by: https://github.com/thedotmack/rad-mem
 * Uses existing: claude-mem/db/sqlite.mjs, claude-mem/search/hybrid.mjs
 *
 * Zero external dependencies beyond what claude-mem already uses.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── TF-IDF Semantic Search ─────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'has', 'have', 'had', 'this', 'that', 'it', 'its', 'not', 'no',
]);

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

function termFrequency(tokens) {
  const tf = {};
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  const max = Math.max(...Object.values(tf), 1);
  for (const t in tf) tf[t] /= max;
  return tf;
}

/**
 * Build a TF-IDF index from a set of documents.
 */
export class TfIdfIndex {
  constructor() {
    this.documents = [];
    this.idf = {};
    this.built = false;
  }

  add(id, text, metadata = {}) {
    const tokens = tokenize(text);
    this.documents.push({ id, text, tokens, tf: termFrequency(tokens), metadata });
    this.built = false;
  }

  build() {
    const N = this.documents.length;
    const df = {};
    for (const doc of this.documents) {
      const seen = new Set(doc.tokens);
      for (const t of seen) df[t] = (df[t] || 0) + 1;
    }
    for (const t in df) this.idf[t] = Math.log(N / df[t]);
    this.built = true;
  }

  /**
   * Search with TF-IDF scoring.
   * @param {string} query
   * @param {number} [limit=20]
   * @returns {Array<{ id, score, text, metadata }>}
   */
  search(query, limit = 20) {
    if (!this.built) this.build();
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const scores = [];
    for (const doc of this.documents) {
      let score = 0;
      for (const qt of queryTokens) {
        const tf = doc.tf[qt] || 0;
        const idf = this.idf[qt] || 0;
        score += tf * idf;
      }
      if (score > 0) scores.push({ id: doc.id, score, text: doc.text, metadata: doc.metadata });
    }

    return scores.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

// ── Progressive Disclosure ─────────────────────────────────────

const TOKENS_PER_CHAR = 0.25; // Rough estimate: 4 chars per token

/**
 * Progressive disclosure — return memory in layers with token budgets.
 *
 * Layer 0 (L0): Core context — most important, always included (~600 tokens)
 * Layer 1 (L1): Session context — recent relevant items (~800 tokens)
 * Layer 2 (L2): Archive context — historical matches (~600 tokens)
 *
 * @param {Array} results - Search results sorted by relevance
 * @param {object} [budgets] - Token budgets per layer
 * @returns {{ layers: Layer[], totalTokens: number }}
 */
export function progressiveDisclose(results, budgets = {}) {
  const L0_BUDGET = budgets.l0 || 600;
  const L1_BUDGET = budgets.l1 || 800;
  const L2_BUDGET = budgets.l2 || 600;

  const layers = [
    { level: 'L0', label: 'Core Context', budget: L0_BUDGET, items: [], tokens: 0 },
    { level: 'L1', label: 'Session Context', budget: L1_BUDGET, items: [], tokens: 0 },
    { level: 'L2', label: 'Archive Context', budget: L2_BUDGET, items: [], tokens: 0 },
  ];

  for (const result of results) {
    const estTokens = Math.ceil(result.text.length * TOKENS_PER_CHAR);

    // High-importance items (score > 0.7 or importance >= 8) → L0
    const importance = result.metadata?.importance || 5;
    let targetLayer;
    if (importance >= 8 || result.score > 0.7) targetLayer = 0;
    else if (importance >= 5 || result.score > 0.3) targetLayer = 1;
    else targetLayer = 2;

    // Try to fit in target layer, or bump down
    let placed = false;
    for (let l = targetLayer; l < 3; l++) {
      if (layers[l].tokens + estTokens <= layers[l].budget) {
        layers[l].items.push({
          id: result.id,
          text: result.text.slice(0, 500),
          score: Math.round(result.score * 1000) / 1000,
          tokens: estTokens,
          metadata: result.metadata,
        });
        layers[l].tokens += estTokens;
        placed = true;
        break;
      }
    }

    if (!placed) break; // All layers full
  }

  return {
    layers,
    totalTokens: layers.reduce((s, l) => s + l.tokens, 0),
    totalItems: layers.reduce((s, l) => s + l.items.length, 0),
  };
}

// ── Session Compression ────────────────────────────────────────

/**
 * Compress a sequence of observations into a concise session summary.
 * Reduces token usage for future context injection.
 *
 * @param {Array} observations - Observation records from a session
 * @returns {string} Compressed summary
 */
export function compressSession(observations) {
  if (!observations || observations.length === 0) return '';

  const byCategory = {};
  for (const obs of observations) {
    const cat = obs.category || 'general';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(obs);
  }

  const lines = [];
  lines.push(`Session: ${observations.length} observations`);

  for (const [cat, items] of Object.entries(byCategory)) {
    lines.push(`  ${cat} (${items.length}):`);
    // Take top 3 by importance
    const top = items.sort((a, b) => (b.importance || 5) - (a.importance || 5)).slice(0, 3);
    for (const item of top) {
      const content = (item.content || '').slice(0, 120);
      lines.push(`    - ${content}`);
    }
  }

  return lines.join('\n');
}

// ── Memory Viewer API ──────────────────────────────────────────

/**
 * Generate memory viewer data for the web UI.
 * Returns structured data suitable for React visualization.
 *
 * @param {object} memSystem - The claude-mem module
 * @returns {object} Viewer-compatible data
 */
export function generateViewerData(memSystem) {
  try {
    const stats = typeof memSystem.stats === 'function' ? memSystem.stats() : {};
    const recentSearch = typeof memSystem.search === 'function'
      ? memSystem.search('', { limit: 50 })
      : [];

    // Group by category for timeline view
    const byCategory = {};
    for (const obs of recentSearch) {
      const cat = obs.category || 'general';
      if (!byCategory[cat]) byCategory[cat] = { count: 0, recent: [] };
      byCategory[cat].count++;
      if (byCategory[cat].recent.length < 5) {
        byCategory[cat].recent.push({
          content: (obs.content || '').slice(0, 200),
          timestamp: obs.timestamp,
          importance: obs.importance,
          entity: obs.entityName,
        });
      }
    }

    return {
      stats,
      categories: byCategory,
      totalObservations: recentSearch.length,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { error: err.message, generatedAt: new Date().toISOString() };
  }
}

// ── Endless Mode (Session Extension) ───────────────────────────

/**
 * Compress tool output to extend session length.
 * Replaces verbose tool results with compact summaries.
 *
 * @param {string} toolOutput - Raw tool output
 * @param {number} [maxTokens=500] - Target compressed size in tokens
 * @returns {string} Compressed output
 */
export function compressToolOutput(toolOutput, maxTokens = 500) {
  if (!toolOutput) return '';
  const maxChars = maxTokens * 4;

  if (toolOutput.length <= maxChars) return toolOutput;

  // Try to extract key information
  const lines = toolOutput.split('\n');

  // Keep first line (usually a header/summary)
  const kept = [lines[0]];
  let charCount = lines[0].length;

  // Keep lines with numbers, scores, decisions, or key patterns
  const importantPatterns = /score|band|decision|alert|match|risk|grade|total|count|error|fail|pass|critical|high|medium/i;

  for (let i = 1; i < lines.length; i++) {
    if (charCount >= maxChars) break;
    if (importantPatterns.test(lines[i])) {
      kept.push(lines[i]);
      charCount += lines[i].length;
    }
  }

  // Add truncation notice
  if (kept.length < lines.length) {
    kept.push(`[... ${lines.length - kept.length} lines compressed]`);
  }

  return kept.join('\n');
}
