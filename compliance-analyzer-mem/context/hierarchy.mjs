/**
 * Hierarchical context loader for Compliance Analyzer.
 *
 * L0 (core)    -- Always loaded. Regulatory thresholds, key legislation,
 *                 constants architecture, active alerts. ~600 tokens.
 * L1 (session) -- Recent session context. Screening results, approval
 *                 workflows, filings, risk assessments. ~800 tokens.
 * L2 (archive) -- On-demand deep retrieval. Historical decisions,
 *                 audit trail, past screenings. ~600 tokens.
 */

import * as db from '../db/sqlite.mjs';
import { TIERS, RECENT_SESSION_COUNT } from '../config.mjs';

/**
 * Load tiered context for Claude Code session injection.
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

  if (sessionId) {
    try {
      db.logInjection({ sessionId, tier: 'L0+L1+L2', content: combined, tokens });
    } catch { /* non-critical */ }
  }

  return { l0, l1, l2, combined, tokens };
}

// -- L0: Core context (always loaded) --

function buildL0() {
  const parts = [];

  // Project identity
  parts.push('Project: Hawkeye Sterling V2 (Compliance Analyzer)');
  parts.push('Focus: UAE AML/CFT/CPF compliance management suite');
  parts.push('Stack: TypeScript/React frontend, Netlify Functions backend');
  parts.push('Constants source of truth: src/domain/constants.ts');

  // Critical regulatory thresholds
  parts.push('');
  parts.push('Key thresholds:');
  parts.push('- Transaction reporting: AED 55,000');
  parts.push('- Cross-border declaration: AED 60,000');
  parts.push('- UBO identification: 25% ownership');
  parts.push('- Sanctions freeze deadline: 24 hours');
  parts.push('');
  parts.push('Key legislation:');
  parts.push('- Federal Decree-Law No. 10 of 2025 (primary AML/CFT)');
  parts.push('- FORBIDDEN: Never cite Federal Decree-Law No. 20 of 2018');
  parts.push('- Cabinet Resolution No. 10 of 2019 (implementing regulations)');
  parts.push('- LBMA Responsible Gold Guidance');

  // Active high-importance observations
  const alerts = db.getHighImportanceObservations(8, 5);
  if (alerts.length > 0) {
    parts.push('');
    parts.push('Active alerts:');
    for (const a of alerts) {
      parts.push(`- [${a.category}] ${truncate(a.content, 120)} (importance: ${a.importance})`);
    }
  }

  return truncateToTokens(parts.join('\n'), TIERS.L0.maxTokens);
}

// -- L1: Session-relevant context --

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

  // Threshold alerts
  const thresholds = db.getObservationsByCategory('threshold_alert', 3);
  if (thresholds.length > 0) {
    parts.push('');
    parts.push('Threshold alerts:');
    for (const t of thresholds) {
      parts.push(`- ${truncate(t.content, 120)}`);
    }
  }

  // MLRO directives
  const directives = db.getObservationsByCategory('mlro_directive', 3);
  if (directives.length > 0) {
    parts.push('');
    parts.push('MLRO directives:');
    for (const d of directives) {
      parts.push(`- ${truncate(d.content, 120)}`);
    }
  }

  if (parts.length === 0) {
    return 'No recent session context available.';
  }

  return truncateToTokens(parts.join('\n'), TIERS.L1.maxTokens);
}

// -- L2: Deep archive retrieval --

function buildL2(query) {
  if (!query) return '';

  const results = db.searchObservations(query, 10);
  if (results.length === 0) return 'No matching archived observations.';

  const parts = [`Query: "${query}"`, ''];
  for (const r of results) {
    const date = r.created_at?.split('T')[0];
    const entity = r.entity_name ? ` [${r.entity_name}]` : '';
    parts.push(`- [${date}] (${r.category}${entity}) ${truncate(r.content, 150)}`);
  }

  return truncateToTokens(parts.join('\n'), TIERS.L2.maxTokens);
}

// -- Helpers --

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
