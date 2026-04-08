/**
 * Hierarchical context loader — OpenViking-inspired L0/L1/L2 tiers.
 *
 * L0 (core)    — Always loaded. Project identity, regulatory framework,
 *                active high-importance alerts. ~600 tokens.
 * L1 (session) — Recent session context. Last N sessions' summaries,
 *                recent compliance decisions, pending deadlines. ~800 tokens.
 * L2 (archive) — On-demand deep retrieval. Historical observations
 *                matching a query, past screening results. ~600 tokens.
 *
 * Total budget: ~2000 tokens injected at session start.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as db from '../db/sqlite.mjs';
import { TIERS, RECENT_SESSION_COUNT } from '../config.mjs';

const PROJECT_ROOT = join(import.meta.url.replace('file://', ''), '..', '..', '..');

/**
 * Load tiered context for Claude Code session injection.
 *
 * @param {object} opts
 * @param {string} [opts.sessionId] - Current session ID.
 * @param {string} [opts.query]     - Optional query for L2 retrieval.
 * @returns {{ l0: string, l1: string, l2: string, combined: string, tokens: number }}
 */
export function loadTieredContext({ sessionId, query } = {}) {
  const l0 = buildL0();
  const l1 = buildL1();
  const l2 = buildL2(query);

  const combined = [
    '## Memory Context (auto-injected)',
    '',
    '### Core (L0)',
    l0,
    '',
    '### Recent (L1)',
    l1,
    '',
    query ? '### Retrieved (L2)' : '',
    query ? l2 : '',
  ].filter(Boolean).join('\n');

  const tokens = estimateTokens(combined);

  // Log the injection if we have a session
  if (sessionId) {
    try {
      db.logInjection({ sessionId, tier: 'L0+L1+L2', content: combined, tokens });
    } catch {
      // Don't fail if logging fails
    }
  }

  return { l0, l1, l2, combined, tokens };
}

// ── L0: Core context (always loaded) ───────────────────────

function buildL0() {
  const parts = [];

  // Project identity
  parts.push('Project: Hawkeye-Sterling AML/CFT Compliance Automation');
  parts.push('Entity type: UAE-licensed DNFBP (Dealer in Precious Metals and Stones)');
  parts.push('Supervisor: Ministry of Economy');
  parts.push('Primary law: Federal Decree-Law No. 10 of 2025');
  parts.push('FORBIDDEN: Never cite Federal Decree-Law No. 20 of 2018');

  // Active high-importance observations
  const alerts = db.getHighImportanceObservations(8, 5);
  if (alerts.length > 0) {
    parts.push('');
    parts.push('Active alerts:');
    for (const a of alerts) {
      parts.push(`- [${a.category}] ${truncate(a.content, 120)} (importance: ${a.importance})`);
    }
  }

  // Check for pending deadlines from deadlines.json
  const deadlinesPath = join(PROJECT_ROOT, 'scripts', 'deadlines.json');
  if (existsSync(deadlinesPath)) {
    try {
      const deadlines = JSON.parse(readFileSync(deadlinesPath, 'utf8'));
      const now = new Date();
      const upcoming = Object.entries(deadlines)
        .filter(([, d]) => {
          const dt = new Date(d.date || d.next || d);
          return dt > now && dt - now < 14 * 86400000; // Within 14 days
        })
        .slice(0, 3);
      if (upcoming.length > 0) {
        parts.push('');
        parts.push('Upcoming deadlines:');
        for (const [name, d] of upcoming) {
          parts.push(`- ${name}: ${d.date || d.next || d}`);
        }
      }
    } catch {
      // Skip if deadlines.json is malformed
    }
  }

  return truncateToTokens(parts.join('\n'), TIERS.L0.maxTokens);
}

// ── L1: Session-relevant context ────────────────────────────

function buildL1() {
  const parts = [];

  // Recent session summaries
  const sessions = db.listRecentSessions(RECENT_SESSION_COUNT);
  if (sessions.length > 0) {
    parts.push('Recent session summaries:');
    for (const s of sessions) {
      if (s.summary) {
        const date = s.started_at.split('T')[0];
        parts.push(`- [${date}] ${truncate(s.summary, 150)}`);
      }
    }
  }

  // Recent compliance decisions
  const decisions = db.getObservationsByCategory('compliance_decision', 5);
  if (decisions.length > 0) {
    parts.push('');
    parts.push('Recent compliance decisions:');
    for (const d of decisions) {
      parts.push(`- ${truncate(d.content, 120)}`);
    }
  }

  // Recent MLRO directives
  const directives = db.getObservationsByCategory('mlro_directive', 3);
  if (directives.length > 0) {
    parts.push('');
    parts.push('MLRO directives:');
    for (const d of directives) {
      parts.push(`- ${truncate(d.content, 120)}`);
    }
  }

  // Recent screening results
  const screenings = db.getObservationsByCategory('screening_result', 5);
  if (screenings.length > 0) {
    parts.push('');
    parts.push('Recent screenings:');
    for (const s of screenings) {
      const entity = s.entity_name ? `[${s.entity_name}] ` : '';
      parts.push(`- ${entity}${truncate(s.content, 100)}`);
    }
  }

  if (parts.length === 0) {
    return 'No recent session context available.';
  }

  return truncateToTokens(parts.join('\n'), TIERS.L1.maxTokens);
}

// ── L2: Deep archive retrieval ──────────────────────────────

function buildL2(query) {
  if (!query) return '';

  const results = db.searchObservations(query, 10);
  if (results.length === 0) return 'No matching archived observations.';

  const parts = [`Query: "${query}"`, ''];
  for (const r of results) {
    const date = r.created_at.split('T')[0];
    const entity = r.entity_name ? ` [${r.entity_name}]` : '';
    parts.push(`- [${date}] (${r.category}${entity}) ${truncate(r.content, 150)}`);
  }

  return truncateToTokens(parts.join('\n'), TIERS.L2.maxTokens);
}

// ── Helpers ─────────────────────────────────────────────────

function truncate(text, maxLen) {
  if (!text) return '';
  const clean = text.replace(/\n/g, ' ').trim();
  return clean.length <= maxLen ? clean : clean.slice(0, maxLen - 3) + '...';
}

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function truncateToTokens(text, maxTokens) {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 3) + '...';
}
