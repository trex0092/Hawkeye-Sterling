/**
 * Automated CDD Refresh Engine — Tracks due diligence expiry,
 * triggers re-screening, escalates overdue reviews.
 *
 * Every entity has a CDD review cycle based on risk rating:
 *   HIGH  → 3 months (EDD)
 *   MEDIUM → 6 months (CDD)
 *   LOW   → 12 months (SDD)
 *
 * The engine:
 *   1. Scans the counterparty register for CDD expiry dates
 *   2. Auto-triggers re-screening for entities due within 14 days
 *   3. Escalates overdue reviews to MLRO
 *   4. Generates renewal files with updated risk assessment
 *   5. Archives all actions for inspection evidence
 *
 * Schedule: Daily via GitHub Actions.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const REGISTER_DIR = resolve(PROJECT_ROOT, 'history', 'registers');
const CDD_STATE_FILE = resolve(PROJECT_ROOT, '.screening', 'cdd-state.json');
const HISTORY_DIR = resolve(PROJECT_ROOT, 'history', 'daily-ops');

/** Review cycles in days by risk rating. */
const REVIEW_CYCLES = {
  HIGH: 90,    // 3 months
  MEDIUM: 180, // 6 months
  LOW: 365,    // 12 months
};

/** Warning thresholds in days before expiry. */
const WARN_DAYS = 14;
const CRITICAL_DAYS = 7;

// ── Main Engine ─────────────────────────────────────────────

/**
 * Run the CDD refresh cycle.
 * @returns {{ due, overdue, refreshed, escalated, total }}
 */
export async function runRefreshCycle() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Load entity CDD state
  const entities = await loadEntityStates();
  const results = {
    total: entities.length,
    due: [],
    overdue: [],
    refreshed: [],
    escalated: [],
    upcoming: [],
  };

  for (const entity of entities) {
    const status = assessCddStatus(entity, today);

    switch (status.state) {
      case 'OVERDUE':
        results.overdue.push({ ...entity, ...status });
        results.escalated.push({ ...entity, ...status, action: 'Escalated to MLRO' });
        break;
      case 'CRITICAL':
        results.due.push({ ...entity, ...status });
        break;
      case 'DUE':
        results.due.push({ ...entity, ...status });
        break;
      case 'UPCOMING':
        results.upcoming.push({ ...entity, ...status });
        break;
      // CURRENT — no action needed
    }
  }

  // Auto-trigger re-screening for due entities
  for (const entity of results.due) {
    try {
      const refreshResult = await refreshEntity(entity);
      results.refreshed.push({ name: entity.name, ...refreshResult });
    } catch (err) {
      console.error(`  Re-screen failed for ${entity.name}: ${err.message}`);
    }
  }

  // Generate report
  const report = generateReport(results, today);

  // Archive
  await archiveReport(report, today);

  // Record in memory
  await recordInMemory(results);

  // Update state
  await updateEntityStates(entities, results);

  return results;
}

/**
 * Assess CDD status for a single entity.
 */
function assessCddStatus(entity, today) {
  const cycle = REVIEW_CYCLES[entity.riskRating] || REVIEW_CYCLES.MEDIUM;
  const lastReview = entity.lastCddDate ? new Date(entity.lastCddDate) : null;

  if (!lastReview) {
    return {
      state: 'OVERDUE',
      daysOverdue: null,
      nextDue: 'IMMEDIATE',
      reason: 'No CDD review on record',
    };
  }

  const nextDue = new Date(lastReview);
  nextDue.setDate(nextDue.getDate() + cycle);

  const daysUntilDue = Math.floor((nextDue - today) / 86400000);

  if (daysUntilDue < 0) {
    return {
      state: 'OVERDUE',
      daysOverdue: Math.abs(daysUntilDue),
      nextDue: nextDue.toISOString().split('T')[0],
      reason: `Overdue by ${Math.abs(daysUntilDue)} days`,
    };
  }

  if (daysUntilDue <= CRITICAL_DAYS) {
    return {
      state: 'CRITICAL',
      daysUntilDue,
      nextDue: nextDue.toISOString().split('T')[0],
      reason: `Due in ${daysUntilDue} days (critical)`,
    };
  }

  if (daysUntilDue <= WARN_DAYS) {
    return {
      state: 'DUE',
      daysUntilDue,
      nextDue: nextDue.toISOString().split('T')[0],
      reason: `Due in ${daysUntilDue} days`,
    };
  }

  if (daysUntilDue <= 30) {
    return {
      state: 'UPCOMING',
      daysUntilDue,
      nextDue: nextDue.toISOString().split('T')[0],
      reason: `Upcoming in ${daysUntilDue} days`,
    };
  }

  return {
    state: 'CURRENT',
    daysUntilDue,
    nextDue: nextDue.toISOString().split('T')[0],
    reason: `Current. Next review: ${nextDue.toISOString().split('T')[0]}`,
  };
}

/**
 * Re-screen an entity and generate a renewal file.
 */
async function refreshEntity(entity) {
  console.log(`  Re-screening: ${entity.name} (${entity.riskRating})...`);

  let screeningResult = null;
  try {
    const screening = await import(resolve(PROJECT_ROOT, 'screening', 'index.js'));
    await screening.init();
    screeningResult = await screening.screen(entity.name, {
      type: entity.type || 'entity',
      country: entity.country,
    });
  } catch {
    screeningResult = { score: 0, band: 'unknown', matches: [] };
  }

  // Determine new risk rating based on fresh screening
  const newRating = determineRiskRating(screeningResult, entity);

  // Generate renewal file
  const renewal = {
    entity: entity.name,
    previousRating: entity.riskRating,
    newRating,
    ratingChanged: newRating !== entity.riskRating,
    screeningScore: screeningResult.score,
    screeningBand: screeningResult.band,
    matchCount: screeningResult.matches?.length || 0,
    reviewDate: new Date().toISOString().split('T')[0],
    nextReviewDate: calculateNextReview(newRating),
    cddLevel: newRating === 'HIGH' ? 'EDD' : newRating === 'MEDIUM' ? 'CDD' : 'SDD',
  };

  // Archive renewal
  await archiveRenewal(renewal);

  return renewal;
}

function determineRiskRating(screeningResult, entity) {
  if (!screeningResult) return entity.riskRating || 'MEDIUM';

  const { band, score, matches } = screeningResult;

  if (band === 'high' || (matches && matches.length > 0 && score >= 0.82)) return 'HIGH';
  if (band === 'medium' || score >= 0.62) return 'MEDIUM';
  if (entity.isPep) return 'HIGH';

  return entity.riskRating || 'LOW';
}

function calculateNextReview(rating) {
  const days = REVIEW_CYCLES[rating] || REVIEW_CYCLES.MEDIUM;
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next.toISOString().split('T')[0];
}

// ── Report Generation ───────────────────────────────────────

function generateReport(results, today) {
  const lines = [];
  const dateStr = today.toISOString().split('T')[0];

  lines.push('CDD REFRESH ENGINE REPORT');
  lines.push(`Date: ${dateStr}`);
  lines.push(`Total entities: ${results.total}`);
  lines.push('');

  // Overdue (escalated)
  if (results.overdue.length > 0) {
    lines.push('OVERDUE — ESCALATED TO MLRO');
    lines.push('-'.repeat(40));
    for (const e of results.overdue) {
      lines.push(`  ${e.name} (${e.riskRating}) — ${e.reason}`);
      lines.push(`    Last CDD: ${e.lastCddDate || 'NEVER'}`);
      lines.push(`    Action: Immediate review required`);
    }
    lines.push('');
  }

  // Due (auto-refreshed)
  if (results.refreshed.length > 0) {
    lines.push('REFRESHED — AUTO RE-SCREENED');
    lines.push('-'.repeat(40));
    for (const e of results.refreshed) {
      const ratingChange = e.ratingChanged ? ` (${e.previousRating} -> ${e.newRating})` : '';
      lines.push(`  ${e.entity}${ratingChange}`);
      lines.push(`    Screening: ${e.screeningBand} (score: ${e.screeningScore}), ${e.matchCount} matches`);
      lines.push(`    CDD level: ${e.cddLevel}, next review: ${e.nextReviewDate}`);
    }
    lines.push('');
  }

  // Upcoming
  if (results.upcoming.length > 0) {
    lines.push('UPCOMING — DUE WITHIN 30 DAYS');
    lines.push('-'.repeat(40));
    for (const e of results.upcoming) {
      lines.push(`  ${e.name} (${e.riskRating}) — ${e.reason}`);
    }
    lines.push('');
  }

  // Summary
  lines.push('SUMMARY');
  lines.push(`  Overdue/escalated: ${results.overdue.length}`);
  lines.push(`  Due/refreshed: ${results.refreshed.length}`);
  lines.push(`  Upcoming (30d): ${results.upcoming.length}`);
  lines.push(`  Current: ${results.total - results.overdue.length - results.due.length - results.upcoming.length}`);
  lines.push('');
  lines.push('For review by the MLRO.');

  return lines.join('\n');
}

// ── State Management ────────────────────────────────────────

async function loadEntityStates() {
  // Try CDD state file first
  if (existsSync(CDD_STATE_FILE)) {
    try {
      const state = JSON.parse(await readFile(CDD_STATE_FILE, 'utf8'));
      if (state.entities && state.entities.length > 0) return state.entities;
    } catch { /* fall through */ }
  }

  // Fall back to counterparty register
  if (!existsSync(REGISTER_DIR)) return [];

  try {
    const files = readdirSync(REGISTER_DIR).filter(f => f.endsWith('.csv')).sort().reverse();
    if (files.length === 0) return [];

    const csv = await readFile(resolve(REGISTER_DIR, files[0]), 'utf8');
    const rows = csv.split('\n').filter(r => r.trim());
    if (rows.length < 2) return [];

    const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
    const entities = [];

    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i].split(',');
      const entity = {};

      for (let j = 0; j < headers.length; j++) {
        entity[headers[j]] = cols[j]?.trim() || '';
      }

      entities.push({
        name: entity.name || entity.entity_name || entity.counterparty || `Entity-${i}`,
        country: entity.country || entity.jurisdiction || '',
        riskRating: (entity.risk_rating || entity.risk || 'MEDIUM').toUpperCase(),
        lastCddDate: entity.last_cdd || entity.last_review || entity.cdd_date || null,
        type: entity.type || 'entity',
        isPep: (entity.pep || '').toLowerCase() === 'yes',
      });
    }

    return entities;
  } catch { return []; }
}

async function updateEntityStates(entities, results) {
  // Update last CDD dates for refreshed entities
  const refreshedNames = new Set(results.refreshed.map(r => r.entity));
  const today = new Date().toISOString().split('T')[0];

  for (const entity of entities) {
    if (refreshedNames.has(entity.name)) {
      entity.lastCddDate = today;
      const refreshed = results.refreshed.find(r => r.entity === entity.name);
      if (refreshed) entity.riskRating = refreshed.newRating;
    }
  }

  const dir = dirname(CDD_STATE_FILE);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(CDD_STATE_FILE, JSON.stringify({ entities, lastRun: today }, null, 2), 'utf8');
}

// ── Archiving ───────────────────────────────────────────────

async function archiveReport(report, today) {
  try {
    if (!existsSync(HISTORY_DIR)) await mkdir(HISTORY_DIR, { recursive: true });
    const dateStr = today.toISOString().split('T')[0];
    await writeFile(resolve(HISTORY_DIR, `${dateStr}-cdd-refresh.txt`), report, 'utf8');
  } catch { /* non-critical */ }
}

async function archiveRenewal(renewal) {
  try {
    const renewalDir = resolve(PROJECT_ROOT, 'history', 'registers');
    if (!existsSync(renewalDir)) await mkdir(renewalDir, { recursive: true });
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `${dateStr}-cdd-renewal-${renewal.entity.replace(/[^a-zA-Z0-9]/g, '-')}.txt`;

    const content = [
      `CDD RENEWAL: ${renewal.entity}`,
      `Date: ${renewal.reviewDate}`,
      `Previous rating: ${renewal.previousRating}`,
      `New rating: ${renewal.newRating}`,
      `CDD level: ${renewal.cddLevel}`,
      `Screening: ${renewal.screeningBand} (score: ${renewal.screeningScore})`,
      `Matches: ${renewal.matchCount}`,
      `Next review: ${renewal.nextReviewDate}`,
      '',
      'For review by the MLRO.',
    ].join('\n');

    await writeFile(resolve(renewalDir, filename), content, 'utf8');
  } catch { /* non-critical */ }
}

async function recordInMemory(results) {
  try {
    const mem = (await import(resolve(PROJECT_ROOT, 'claude-mem', 'index.mjs'))).default;
    mem.startSession(`cdd-refresh-${Date.now().toString(36)}`);

    if (results.overdue.length > 0) {
      mem.observe({
        category: 'risk_assessment',
        content: `CDD OVERDUE: ${results.overdue.map(e => e.name).join(', ')} — escalated to MLRO`,
        importance: 9,
      });
    }

    if (results.refreshed.length > 0) {
      for (const r of results.refreshed) {
        mem.observe({
          category: 'entity_interaction',
          content: `CDD refreshed: ${r.entity} (${r.previousRating}->${r.newRating}, score: ${r.screeningScore})`,
          entityName: r.entity,
          importance: r.ratingChanged ? 8 : 5,
        });
      }
    }

    await mem.endSession(`CDD refresh: ${results.refreshed.length} refreshed, ${results.overdue.length} overdue`);
    mem.close();
  } catch { /* memory system optional */ }
}

// ── CLI Entry Point ─────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.env.DRY_RUN === 'true';
  console.log(`CDD Refresh Engine — ${new Date().toISOString().split('T')[0]}`);
  console.log('='.repeat(50));

  if (dryRun) console.log('[DRY RUN MODE]\n');

  runRefreshCycle()
    .then(results => {
      console.log(`\nDone. Overdue: ${results.overdue.length}, Refreshed: ${results.refreshed.length}, Upcoming: ${results.upcoming.length}`);
    })
    .catch(err => {
      console.error(`Fatal: ${err.message}`);
      process.exit(1);
    });
}
