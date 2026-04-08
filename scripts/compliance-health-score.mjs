/**
 * Compliance Health Score — Real-time 0-100 score across 8 dimensions.
 *
 * Dimensions:
 *   1. SCREENING   — Are all entities screened? Any overdue re-screens?
 *   2. CDD         — Are all CDD reviews current? Any overdue?
 *   3. FILINGS     — Are all STR/CTR/CNMR filed on time? Any pending?
 *   4. TRAINING    — Is staff training current? Any gaps?
 *   5. SANCTIONS   — Are sanctions lists up to date? Any unresolved matches?
 *   6. RISK_ASSESSMENT — Is the EWRA current? Are entity risk ratings assigned?
 *   7. RETENTION   — Are all records within retention policy? Any gaps?
 *   8. GOVERNANCE  — MLRO appointed? Audit conducted? Policies current?
 *
 * Each dimension scores 0-100. The composite score is a weighted average.
 * Weights reflect regulatory priority (sanctions/filings weighted higher).
 *
 * Output: JSON with composite score, dimension breakdown, and action items.
 *
 * Usage:
 *   node compliance-health-score.mjs
 *   import { calculateHealthScore } from './compliance-health-score.mjs';
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname || '.', '..');
const HISTORY_ROOT = resolve(PROJECT_ROOT, 'history');

/** Dimension weights (must sum to 1.0). */
const WEIGHTS = {
  SCREENING:       0.15,
  CDD:             0.15,
  FILINGS:         0.15,
  TRAINING:        0.10,
  SANCTIONS:       0.15,
  RISK_ASSESSMENT: 0.10,
  RETENTION:       0.10,
  GOVERNANCE:      0.10,
};

/**
 * Calculate the compliance health score.
 * @returns {{ composite, grade, dimensions, actions, timestamp }}
 */
export async function calculateHealthScore() {
  const dimensions = {};
  const actions = [];

  dimensions.SCREENING = await scoreScreening(actions);
  dimensions.CDD = await scoreCDD(actions);
  dimensions.FILINGS = await scoreFilings(actions);
  dimensions.TRAINING = await scoreTraining(actions);
  dimensions.SANCTIONS = await scoreSanctions(actions);
  dimensions.RISK_ASSESSMENT = await scoreRiskAssessment(actions);
  dimensions.RETENTION = await scoreRetention(actions);
  dimensions.GOVERNANCE = await scoreGovernance(actions);

  // Weighted composite
  let composite = 0;
  for (const [dim, weight] of Object.entries(WEIGHTS)) {
    composite += (dimensions[dim]?.score || 0) * weight;
  }
  composite = Math.round(composite);

  const grade = composite >= 90 ? 'A' : composite >= 75 ? 'B' : composite >= 60 ? 'C' : composite >= 40 ? 'D' : 'F';

  // Sort actions by priority
  actions.sort((a, b) => {
    const pri = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return (pri[a.priority] || 4) - (pri[b.priority] || 4);
  });

  return {
    composite,
    grade,
    dimensions,
    actions: actions.slice(0, 20), // Top 20 actions
    timestamp: new Date().toISOString(),
  };
}

// ── Dimension Scorers ───────────────────────────────────────

async function scoreScreening(actions) {
  let score = 100;
  const issues = [];

  // Check if screening store exists
  const storePath = resolve(PROJECT_ROOT, '.screening', 'store.json');
  if (!existsSync(storePath)) {
    score -= 40;
    issues.push('No screening store found');
    actions.push({ dimension: 'SCREENING', priority: 'CRITICAL', action: 'Initialize screening engine: cd screening && node bin/refresh.mjs' });
  }

  // Check audit log for recent screening activity
  const auditPath = resolve(PROJECT_ROOT, '.screening', 'audit.log');
  if (existsSync(auditPath)) {
    try {
      const content = await readFile(auditPath, 'utf8');
      const lines = content.trim().split('\n');
      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        try {
          const lastEntry = JSON.parse(lastLine);
          const lastDate = new Date(lastEntry.timestamp || lastEntry.ts);
          const daysSince = (Date.now() - lastDate.getTime()) / 86400000;
          if (daysSince > 7) {
            score -= 20;
            issues.push(`Last screening activity: ${Math.round(daysSince)} days ago`);
            actions.push({ dimension: 'SCREENING', priority: 'HIGH', action: 'Run counterparty screening refresh' });
          }
          if (daysSince > 30) score -= 20;
        } catch { /* skip malformed entries */ }
      }
    } catch { /* skip */ }
  } else {
    score -= 20;
    issues.push('No screening audit log');
  }

  // Check for recent screening evidence in history
  const screeningFiles = await countRecentFiles(resolve(HISTORY_ROOT, 'daily-ops'), /screen|sanction|pep/i, 7);
  if (screeningFiles === 0) {
    score -= 15;
    issues.push('No screening evidence in last 7 days');
  }

  return { score: Math.max(0, score), issues };
}

async function scoreCDD(actions) {
  let score = 100;
  const issues = [];

  // Check CDD state
  const cddPath = resolve(PROJECT_ROOT, '.screening', 'cdd-state.json');
  if (existsSync(cddPath)) {
    try {
      const state = JSON.parse(await readFile(cddPath, 'utf8'));
      const entities = state.entities || [];

      if (entities.length === 0) {
        score -= 30;
        issues.push('No entities in CDD register');
      }

      const overdue = entities.filter(e => {
        if (!e.lastCddDate) return true;
        const cycle = e.riskRating === 'HIGH' ? 90 : e.riskRating === 'MEDIUM' ? 180 : 365;
        const next = new Date(e.lastCddDate);
        next.setDate(next.getDate() + cycle);
        return next < new Date();
      });

      if (overdue.length > 0) {
        const pct = overdue.length / entities.length;
        score -= Math.round(pct * 60);
        issues.push(`${overdue.length}/${entities.length} entities have overdue CDD`);
        actions.push({
          dimension: 'CDD',
          priority: pct > 0.3 ? 'CRITICAL' : 'HIGH',
          action: `${overdue.length} CDD reviews overdue. Run CDD refresh engine.`,
        });
      }
    } catch {
      score -= 20;
      issues.push('CDD state file unreadable');
    }
  } else {
    // Check counterparty register as fallback
    const registerDir = resolve(HISTORY_ROOT, 'registers');
    const registerFiles = await countRecentFiles(registerDir, /\.csv$/i, 90);
    if (registerFiles === 0) {
      score -= 40;
      issues.push('No counterparty register found');
      actions.push({ dimension: 'CDD', priority: 'CRITICAL', action: 'Create counterparty register and initialize CDD tracking' });
    }
  }

  return { score: Math.max(0, score), issues };
}

async function scoreFilings(actions) {
  let score = 100;
  const issues = [];

  const filingsDir = resolve(HISTORY_ROOT, 'filings');
  if (!existsSync(filingsDir)) {
    score -= 10;
    issues.push('No filings directory (may be normal if no STRs required)');
    return { score: Math.max(0, score), issues };
  }

  // Check for recent filing activity
  const recentFilings = await countRecentFiles(filingsDir, /\.(txt|xml)$/i, 90);
  if (recentFilings > 0) {
    // Check for any DRAFT status filings (unfiled)
    try {
      const files = await readdir(filingsDir);
      const drafts = files.filter(f => f.includes('DRAFT') || f.includes('draft'));
      if (drafts.length > 0) {
        score -= 15;
        issues.push(`${drafts.length} draft filings not yet submitted`);
        actions.push({ dimension: 'FILINGS', priority: 'HIGH', action: `${drafts.length} draft filings pending submission` });
      }
    } catch { /* skip */ }
  }

  // Check weekly filings summary
  const weeklyFilings = await countRecentFiles(resolve(HISTORY_ROOT, 'weekly-filings'), /\.txt$/i, 14);
  if (weeklyFilings === 0) {
    score -= 10;
    issues.push('No weekly filings summary in last 14 days');
  }

  return { score: Math.max(0, score), issues };
}

async function scoreTraining(actions) {
  let score = 100;
  const issues = [];

  // Check for training evidence
  const annualDir = resolve(HISTORY_ROOT, 'annual');
  const trainingFiles = await countRecentFiles(annualDir, /training/i, 365);

  if (trainingFiles === 0) {
    score -= 50;
    issues.push('No training records found in last 12 months');
    actions.push({ dimension: 'TRAINING', priority: 'HIGH', action: 'Conduct AML/CFT/CPF staff training and record evidence' });
  }

  return { score: Math.max(0, score), issues };
}

async function scoreSanctions(actions) {
  let score = 100;
  const issues = [];

  // Check webhook state for list freshness
  const webhookState = resolve(PROJECT_ROOT, '.screening', 'webhook-state.json');
  if (existsSync(webhookState)) {
    try {
      const state = JSON.parse(await readFile(webhookState, 'utf8'));
      for (const [sourceId, sourceState] of Object.entries(state)) {
        if (!sourceState.lastCheck) continue;
        const daysSince = (Date.now() - new Date(sourceState.lastCheck).getTime()) / 86400000;
        if (daysSince > 1) {
          score -= 10;
          issues.push(`${sourceId}: last checked ${Math.round(daysSince)} days ago`);
        }
      }
    } catch { /* skip */ }
  } else {
    score -= 30;
    issues.push('Sanctions webhook not configured');
    actions.push({ dimension: 'SANCTIONS', priority: 'HIGH', action: 'Enable sanctions list change monitoring' });
  }

  // Check for unresolved sanctions changes
  const changeFiles = await countRecentFiles(resolve(HISTORY_ROOT, 'daily-ops'), /sanctions.?change/i, 7);
  if (changeFiles > 0) {
    score -= 10;
    issues.push(`${changeFiles} sanctions changes detected in last 7 days — verify re-screening`);
  }

  return { score: Math.max(0, score), issues };
}

async function scoreRiskAssessment(actions) {
  let score = 100;
  const issues = [];

  // Check for annual risk assessment
  const annualDir = resolve(HISTORY_ROOT, 'annual');
  const raFiles = await countRecentFiles(annualDir, /risk.?assess/i, 365);

  if (raFiles === 0) {
    score -= 50;
    issues.push('No enterprise-wide risk assessment in last 12 months');
    actions.push({ dimension: 'RISK_ASSESSMENT', priority: 'CRITICAL', action: 'Conduct annual EWRA per Cabinet Resolution 134/2025 Art.5' });
  }

  // Check quarterly jurisdiction heatmap
  const quarterlyDir = resolve(HISTORY_ROOT, 'quarterly-jurisdiction');
  const heatmapFiles = await countRecentFiles(quarterlyDir, /heatmap/i, 120);
  if (heatmapFiles === 0) {
    score -= 20;
    issues.push('No quarterly jurisdiction heatmap in last 4 months');
  }

  return { score: Math.max(0, score), issues };
}

async function scoreRetention(actions) {
  let score = 100;
  const issues = [];

  // Check history directory completeness
  const expectedDirs = [
    'daily', 'daily-ops', 'weekly', 'mlro-weekly', 'monthly-incidents',
    'mlro-monthly', 'mlro-quarterly', 'mlro-annual', 'filings', 'registers',
  ];

  let missing = 0;
  for (const dir of expectedDirs) {
    if (!existsSync(resolve(HISTORY_ROOT, dir))) missing++;
  }

  if (missing > 0) {
    score -= Math.round((missing / expectedDirs.length) * 40);
    issues.push(`${missing}/${expectedDirs.length} expected archive directories missing`);
  }

  // Check hash manifest
  const manifestFiles = await countRecentFiles(resolve(HISTORY_ROOT, 'inspections'), /MANIFEST/i, 90);
  if (manifestFiles === 0) {
    score -= 15;
    issues.push('No recent integrity manifest');
  }

  return { score: Math.max(0, score), issues };
}

async function scoreGovernance(actions) {
  let score = 100;
  const issues = [];

  // Check MLRO reports
  const mlroWeekly = await countRecentFiles(resolve(HISTORY_ROOT, 'mlro-weekly'), /\.txt$/i, 14);
  const mlroMonthly = await countRecentFiles(resolve(HISTORY_ROOT, 'mlro-monthly'), /\.txt$/i, 45);
  const mlroQuarterly = await countRecentFiles(resolve(HISTORY_ROOT, 'mlro-quarterly'), /\.txt$/i, 120);

  if (mlroWeekly === 0) { score -= 15; issues.push('No MLRO weekly report in last 14 days'); }
  if (mlroMonthly === 0) { score -= 15; issues.push('No MLRO monthly report in last 45 days'); }
  if (mlroQuarterly === 0) { score -= 15; issues.push('No MLRO quarterly report in last 4 months'); }

  // Check for recent daily ops
  const dailyOps = await countRecentFiles(resolve(HISTORY_ROOT, 'daily-ops'), /\.txt$/i, 3);
  if (dailyOps === 0) {
    score -= 10;
    issues.push('No daily operations logs in last 3 days');
    actions.push({ dimension: 'GOVERNANCE', priority: 'MEDIUM', action: 'Daily ops logging appears to have stopped' });
  }

  return { score: Math.max(0, score), issues };
}

// ── Helpers ─────────────────────────────────────────────────

async function countRecentFiles(dir, pattern, maxAgeDays) {
  if (!existsSync(dir)) return 0;
  try {
    const files = await readdir(dir);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    return files.filter(f => {
      if (!pattern.test(f)) return false;
      // Extract date from filename (YYYY-MM-DD prefix)
      const dateMatch = f.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) return dateMatch[1] >= cutoffStr;
      return true; // Count if can't determine date
    }).length;
  } catch { return 0; }
}

// ── CLI ─────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Compliance Health Score');
  console.log('======================\n');

  calculateHealthScore().then(result => {
    // Big number
    const color = result.composite >= 75 ? '\x1b[32m' : result.composite >= 50 ? '\x1b[33m' : '\x1b[31m';
    console.log(`${color}  SCORE: ${result.composite}/100 (Grade: ${result.grade})\x1b[0m\n`);

    // Dimensions
    console.log('Dimensions:');
    for (const [dim, data] of Object.entries(result.dimensions)) {
      const bar = '█'.repeat(Math.round(data.score / 5)) + '░'.repeat(20 - Math.round(data.score / 5));
      const weight = WEIGHTS[dim];
      console.log(`  ${dim.padEnd(18)} ${bar} ${String(data.score).padStart(3)}/100 (weight: ${weight})`);
      for (const issue of data.issues) {
        console.log(`    ⚠ ${issue}`);
      }
    }

    // Action items
    if (result.actions.length > 0) {
      console.log(`\nAction Items (${result.actions.length}):`);
      for (const a of result.actions) {
        const icon = a.priority === 'CRITICAL' ? '🔴' : a.priority === 'HIGH' ? '🟡' : '🔵';
        console.log(`  ${icon} [${a.priority}] ${a.dimension}: ${a.action}`);
      }
    }

    console.log(`\nTimestamp: ${result.timestamp}`);
  }).catch(err => { console.error(err.message); process.exit(1); });
}
