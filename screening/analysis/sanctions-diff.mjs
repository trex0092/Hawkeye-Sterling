/**
 * Sanctions List Diff Reporter — Shows exactly WHO was added, removed,
 * or modified when a sanctions list changes.
 *
 * The Sanctions Webhook detects THAT a list changed.
 * This module shows WHAT changed.
 *
 * Compares two snapshots of the screening store to produce:
 *   - New designations (entities added to lists)
 *   - Delistings (entities removed)
 *   - Modifications (alias changes, address updates, status changes)
 *   - Impact assessment (which of YOUR counterparties are affected)
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname || '.', '..');
const SNAPSHOT_DIR = resolve(PROJECT_ROOT, '.screening', 'snapshots');
const HISTORY_DIR = resolve(PROJECT_ROOT, 'history', 'daily-ops');

/**
 * Compare current screening store against the previous snapshot.
 *
 * @param {object} [opts]
 * @param {string} [opts.source] - Filter by source (e.g., 'opensanctions-default')
 * @returns {{ added, removed, modified, impacted, report }}
 */
export async function generateDiff(opts = {}) {
  const currentStore = await loadCurrentStore();
  const previousSnapshot = await loadPreviousSnapshot();

  if (!currentStore) {
    return { error: 'No current screening store found. Run: cd screening && node bin/refresh.mjs' };
  }

  if (!previousSnapshot) {
    // First run — save snapshot and return
    await saveSnapshot(currentStore);
    return { firstRun: true, message: 'First snapshot saved. Run again after next list refresh to see changes.' };
  }

  const currentEntities = extractEntities(currentStore, opts.source);
  const previousEntities = extractEntities(previousSnapshot, opts.source);

  // Build lookup maps
  const currentMap = new Map(currentEntities.map(e => [entityKey(e), e]));
  const previousMap = new Map(previousEntities.map(e => [entityKey(e), e]));

  // Compute diff
  const added = [];
  const removed = [];
  const modified = [];

  // New entities (in current but not previous)
  for (const [key, entity] of currentMap) {
    if (!previousMap.has(key)) {
      added.push({
        name: entity.name || entity.caption,
        type: entity.schema || entity.type || 'Unknown',
        source: entity.source || 'unknown',
        country: entity.country || null,
        lists: entity.datasets || entity.lists || [],
      });
    }
  }

  // Removed entities (in previous but not current)
  for (const [key, entity] of previousMap) {
    if (!currentMap.has(key)) {
      removed.push({
        name: entity.name || entity.caption,
        type: entity.schema || entity.type || 'Unknown',
        source: entity.source || 'unknown',
        country: entity.country || null,
      });
    }
  }

  // Modified (same key, different data)
  for (const [key, current] of currentMap) {
    const previous = previousMap.get(key);
    if (!previous) continue;

    const changes = detectChanges(previous, current);
    if (changes.length > 0) {
      modified.push({
        name: current.name || current.caption,
        source: current.source || 'unknown',
        changes,
      });
    }
  }

  // Impact assessment — check against counterparty register
  const impacted = await assessImpact(added, removed);

  // Save new snapshot
  await saveSnapshot(currentStore);

  // Generate report
  const report = formatReport(added, removed, modified, impacted);

  // Archive
  await archiveReport(report);

  // Record in memory
  await recordInMemory(added, removed, modified);

  return {
    added: added.length,
    removed: removed.length,
    modified: modified.length,
    impacted: impacted.length,
    details: { added, removed, modified, impacted },
    report,
  };
}

/**
 * Detect field-level changes between two entity records.
 */
function detectChanges(previous, current) {
  const changes = [];
  const fields = ['name', 'caption', 'aliases', 'country', 'address', 'notes', 'status', 'datasets', 'lists'];

  for (const field of fields) {
    const prev = JSON.stringify(previous[field] || '');
    const curr = JSON.stringify(current[field] || '');
    if (prev !== curr) {
      changes.push({ field, from: previous[field], to: current[field] });
    }
  }

  return changes;
}

/**
 * Check if any newly designated entities match our counterparty register.
 */
async function assessImpact(added, removed) {
  const impacted = [];
  const registerDir = resolve(PROJECT_ROOT, 'history', 'registers');

  if (!existsSync(registerDir)) return impacted;

  try {
    const files = readdirSync(registerDir).filter(f => f.endsWith('.csv')).sort().reverse();
    if (files.length === 0) return impacted;

    const csv = await readFile(resolve(registerDir, files[0]), 'utf8');
    const rows = csv.split('\n').filter(r => r.trim());
    const counterparties = rows.slice(1).map(r => {
      const cols = r.split(',');
      return (cols[0] || '').trim().toLowerCase();
    }).filter(Boolean);

    // Check new designations against counterparty names
    for (const entity of added) {
      const entityName = (entity.name || '').toLowerCase();
      for (const cp of counterparties) {
        if (cp.includes(entityName) || entityName.includes(cp)) {
          impacted.push({
            counterparty: cp,
            matchedDesignation: entity.name,
            source: entity.source,
            action: 'URGENT: New sanctions designation matches existing counterparty. Initiate TFS freeze procedure.',
          });
        }
      }
    }
  } catch { /* skip */ }

  return impacted;
}

function formatReport(added, removed, modified, impacted) {
  const today = new Date().toISOString().split('T')[0];
  const lines = [];

  lines.push('SANCTIONS LIST CHANGE REPORT');
  lines.push(`Date: ${today}`);
  lines.push(`New designations: ${added.length}`);
  lines.push(`Delistings: ${removed.length}`);
  lines.push(`Modifications: ${modified.length}`);
  lines.push(`Counterparty impact: ${impacted.length}`);
  lines.push('');

  if (impacted.length > 0) {
    lines.push('*** COUNTERPARTY IMPACT — IMMEDIATE ACTION REQUIRED ***');
    for (const i of impacted) {
      lines.push(`  ${i.counterparty} matches new designation: ${i.matchedDesignation}`);
      lines.push(`  Action: ${i.action}`);
    }
    lines.push('');
  }

  if (added.length > 0) {
    lines.push('NEW DESIGNATIONS');
    for (const a of added.slice(0, 50)) {
      lines.push(`  + ${a.name} (${a.type}, ${a.source}) ${a.country || ''}`);
    }
    if (added.length > 50) lines.push(`  ... and ${added.length - 50} more`);
    lines.push('');
  }

  if (removed.length > 0) {
    lines.push('DELISTINGS');
    for (const r of removed.slice(0, 50)) {
      lines.push(`  - ${r.name} (${r.type}, ${r.source})`);
    }
    if (removed.length > 50) lines.push(`  ... and ${removed.length - 50} more`);
    lines.push('');
  }

  if (modified.length > 0) {
    lines.push('MODIFICATIONS');
    for (const m of modified.slice(0, 30)) {
      lines.push(`  ~ ${m.name}: ${m.changes.map(c => c.field).join(', ')} changed`);
    }
    lines.push('');
  }

  lines.push('For review by the MLRO.');
  return lines.join('\n');
}

// ── Helpers ─────────────────────────────────────────────────

function entityKey(e) {
  return ((e.name || e.caption || '') + '|' + (e.source || '')).toLowerCase().trim();
}

function extractEntities(store, sourceFilter) {
  const entities = [];
  if (Array.isArray(store)) return store;
  if (typeof store === 'object') {
    for (const [source, items] of Object.entries(store)) {
      if (sourceFilter && source !== sourceFilter) continue;
      if (Array.isArray(items)) {
        for (const item of items) {
          entities.push({ ...item, source });
        }
      }
    }
  }
  return entities;
}

async function loadCurrentStore() {
  const path = resolve(PROJECT_ROOT, '.screening', 'store.json');
  if (!existsSync(path)) return null;
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

async function loadPreviousSnapshot() {
  if (!existsSync(SNAPSHOT_DIR)) return null;
  try {
    const files = readdirSync(SNAPSHOT_DIR).filter(f => f.endsWith('.json')).sort().reverse();
    if (files.length === 0) return null;
    return JSON.parse(await readFile(resolve(SNAPSHOT_DIR, files[0]), 'utf8'));
  } catch { return null; }
}

async function saveSnapshot(store) {
  if (!existsSync(SNAPSHOT_DIR)) await mkdir(SNAPSHOT_DIR, { recursive: true });
  const filename = `${new Date().toISOString().split('T')[0]}-snapshot.json`;
  await writeFile(resolve(SNAPSHOT_DIR, filename), JSON.stringify(store), 'utf8');
}

async function archiveReport(report) {
  try {
    if (!existsSync(HISTORY_DIR)) await mkdir(HISTORY_DIR, { recursive: true });
    const today = new Date().toISOString().split('T')[0];
    await writeFile(resolve(HISTORY_DIR, `${today}-sanctions-diff.txt`), report, 'utf8');
  } catch { /* non-critical */ }
}

async function recordInMemory(added, removed, modified) {
  try {
    const mem = (await import(resolve(PROJECT_ROOT, 'claude-mem', 'index.mjs'))).default;
    mem.startSession(`sanctions-diff-${Date.now().toString(36)}`);
    if (added.length > 0) {
      mem.observe({
        category: 'regulatory_observation',
        content: `Sanctions diff: ${added.length} new designations (${added.slice(0, 5).map(a => a.name).join(', ')}${added.length > 5 ? '...' : ''})`,
        importance: 8,
      });
    }
    if (removed.length > 0) {
      mem.observe({
        category: 'regulatory_observation',
        content: `Sanctions diff: ${removed.length} delistings`,
        importance: 6,
      });
    }
    await mem.endSession(`Sanctions diff: +${added.length} -${removed.length} ~${modified.length}`);
    mem.close();
  } catch { /* optional */ }
}
