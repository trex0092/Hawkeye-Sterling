/**
 * Batch Portfolio Screener — Re-screen entire counterparty register,
 * compare against last run, surface only the CHANGES.
 *
 * Output:
 *   - New matches (entities that are now flagged)
 *   - Cleared matches (entities that were flagged, now clear)
 *   - Score movements (significant score changes up or down)
 *   - Delta report for MLRO review
 *
 * Schedule: Weekly via GitHub Actions, or on-demand after sanctions list change.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname || '.', '..');
const HISTORY_DIR = resolve(PROJECT_ROOT, 'history', 'daily-ops');
const STATE_FILE = resolve(PROJECT_ROOT, '.screening', 'portfolio-screen-state.json');

/**
 * Run a full portfolio screen and delta comparison.
 */
export async function runPortfolioScreen() {
  const entities = await loadCounterparties();
  if (entities.length === 0) {
    return { error: 'No counterparties found in register' };
  }

  const previousState = await loadPreviousState();
  const currentResults = {};
  const delta = { newMatches: [], cleared: [], scoreChanges: [], errors: [] };

  console.log(`Screening ${entities.length} counterparties...`);

  for (const entity of entities) {
    try {
      const result = await screenEntity(entity);
      currentResults[entity.name] = result;

      const previous = previousState[entity.name];

      if (!previous) {
        // First screen for this entity
        if (result.band !== 'clear' && result.band !== 'reject') {
          delta.newMatches.push({ entity: entity.name, band: result.band, score: result.score, matchCount: result.matchCount });
        }
        continue;
      }

      // Compare with previous
      if (previous.band === 'clear' && result.band !== 'clear' && result.band !== 'reject') {
        delta.newMatches.push({
          entity: entity.name,
          previousBand: previous.band,
          currentBand: result.band,
          score: result.score,
          matchCount: result.matchCount,
        });
      }

      if (previous.band !== 'clear' && previous.band !== 'reject' && (result.band === 'clear' || result.band === 'reject')) {
        delta.cleared.push({
          entity: entity.name,
          previousBand: previous.band,
          previousScore: previous.score,
        });
      }

      const scoreDiff = Math.abs((result.score || 0) - (previous.score || 0));
      if (scoreDiff > 0.1) {
        delta.scoreChanges.push({
          entity: entity.name,
          previousScore: previous.score,
          currentScore: result.score,
          change: result.score - previous.score,
          direction: result.score > previous.score ? 'UP' : 'DOWN',
        });
      }
    } catch (err) {
      delta.errors.push({ entity: entity.name, error: err.message });
    }
  }

  // Save current state
  await saveState(currentResults);

  // Generate report
  const report = generateReport(entities.length, delta);

  // Archive
  await archiveReport(report);

  // Record in memory
  await recordInMemory(delta);

  return {
    screened: entities.length,
    newMatches: delta.newMatches.length,
    cleared: delta.cleared.length,
    scoreChanges: delta.scoreChanges.length,
    errors: delta.errors.length,
    delta,
    report,
  };
}

async function screenEntity(entity) {
  try {
    const screening = await import(resolve(PROJECT_ROOT, 'screening', 'index.js'));
    await screening.init();
    const result = await screening.screen(entity.name, { type: entity.type || 'entity', country: entity.country });
    return {
      score: result.score || 0,
      band: result.band || 'clear',
      matchCount: result.matches?.length || 0,
      timestamp: new Date().toISOString(),
    };
  } catch {
    return { score: 0, band: 'unknown', matchCount: 0, timestamp: new Date().toISOString() };
  }
}

async function loadCounterparties() {
  const registerDir = resolve(PROJECT_ROOT, 'history', 'registers');
  if (!existsSync(registerDir)) return [];

  try {
    const files = readdirSync(registerDir).filter(f => f.endsWith('.csv')).sort().reverse();
    if (files.length === 0) return [];

    const csv = await readFile(resolve(registerDir, files[0]), 'utf8');
    const rows = csv.split('\n').filter(r => r.trim());
    if (rows.length < 2) return [];

    const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
    const nameIdx = headers.findIndex(h => h.includes('name'));
    const countryIdx = headers.findIndex(h => h.includes('country'));
    const typeIdx = headers.findIndex(h => h.includes('type'));

    return rows.slice(1).map(row => {
      const cols = row.split(',');
      return {
        name: (cols[nameIdx] || '').trim(),
        country: countryIdx >= 0 ? (cols[countryIdx] || '').trim() : '',
        type: typeIdx >= 0 ? (cols[typeIdx] || '').trim() : 'entity',
      };
    }).filter(e => e.name);
  } catch { return []; }
}

async function loadPreviousState() {
  if (!existsSync(STATE_FILE)) return {};
  try { return JSON.parse(await readFile(STATE_FILE, 'utf8')); } catch { return {}; }
}

async function saveState(results) {
  const dir = resolve(PROJECT_ROOT, '.screening');
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(results, null, 2), 'utf8');
}

function generateReport(total, delta) {
  const today = new Date().toISOString().split('T')[0];
  const lines = [];

  lines.push('PORTFOLIO SCREENING DELTA REPORT');
  lines.push(`Date: ${today}`);
  lines.push(`Entities screened: ${total}`);
  lines.push(`New matches: ${delta.newMatches.length}`);
  lines.push(`Cleared: ${delta.cleared.length}`);
  lines.push(`Score changes: ${delta.scoreChanges.length}`);
  lines.push('');

  if (delta.newMatches.length > 0) {
    lines.push('*** NEW MATCHES — IMMEDIATE REVIEW REQUIRED ***');
    for (const m of delta.newMatches) {
      lines.push(`  [NEW] ${m.entity}: ${m.currentBand || m.band} (score: ${m.score}, matches: ${m.matchCount})`);
    }
    lines.push('');
  }

  if (delta.cleared.length > 0) {
    lines.push('CLEARED (previously flagged, now clear)');
    for (const c of delta.cleared) {
      lines.push(`  [CLR] ${c.entity}: was ${c.previousBand} (score: ${c.previousScore})`);
    }
    lines.push('');
  }

  if (delta.scoreChanges.length > 0) {
    lines.push('SCORE MOVEMENTS (>10% change)');
    for (const s of delta.scoreChanges) {
      const arrow = s.direction === 'UP' ? '↑' : '↓';
      lines.push(`  ${arrow} ${s.entity}: ${s.previousScore} -> ${s.currentScore} (${s.direction})`);
    }
    lines.push('');
  }

  lines.push('For review by the MLRO.');
  return lines.join('\n');
}

async function archiveReport(report) {
  try {
    if (!existsSync(HISTORY_DIR)) await mkdir(HISTORY_DIR, { recursive: true });
    const today = new Date().toISOString().split('T')[0];
    await writeFile(resolve(HISTORY_DIR, `${today}-portfolio-screen.txt`), report, 'utf8');
  } catch { /* non-critical */ }
}

async function recordInMemory(delta) {
  try {
    const mem = (await import(resolve(PROJECT_ROOT, 'claude-mem', 'index.mjs'))).default;
    mem.startSession(`portfolio-${Date.now().toString(36)}`);
    if (delta.newMatches.length > 0) {
      mem.observe({
        category: 'screening_result',
        content: `Portfolio screen: ${delta.newMatches.length} NEW matches: ${delta.newMatches.map(m => m.entity).join(', ')}`,
        importance: 9,
      });
    }
    await mem.endSession(`Portfolio: +${delta.newMatches.length} -${delta.cleared.length} ~${delta.scoreChanges.length}`);
    mem.close();
  } catch { /* optional */ }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  runPortfolioScreen().then(r => {
    console.log(r.report || JSON.stringify(r, null, 2));
  }).catch(err => { console.error(err.message); process.exit(1); });
}
