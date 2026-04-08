#!/usr/bin/env node
/**
 * Verify the integrity of the Claude memory database.
 *
 * Checks:
 *   1. Database file exists and is readable
 *   2. Schema tables are present
 *   3. FTS index is consistent
 *   4. Foreign key constraints hold
 */

import { existsSync } from 'node:fs';
import { PATHS } from '../config.mjs';
import * as db from './sqlite.mjs';

console.log('Claude Memory Database Verification');
console.log('====================================\n');

let ok = true;

// 1. File check
if (!existsSync(PATHS.dbFile)) {
  console.log('FAIL: Database file not found at', PATHS.dbFile);
  console.log('      Run: cd claude-mem && npm run setup');
  process.exit(1);
}
console.log('OK: Database file exists');

// 2. Schema check
try {
  const dbInstance = db.getDb();
  const tables = dbInstance.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all().map(r => r.name);

  const required = ['sessions', 'observations', 'summaries', 'context_injections', 'observations_fts'];
  for (const t of required) {
    if (tables.includes(t)) {
      console.log(`OK: Table '${t}' exists`);
    } else {
      console.log(`FAIL: Table '${t}' missing`);
      ok = false;
    }
  }
} catch (err) {
  console.log(`FAIL: Cannot read schema: ${err.message}`);
  ok = false;
}

// 3. Integrity check
try {
  const dbInstance = db.getDb();
  const result = dbInstance.pragma('integrity_check');
  if (result[0]?.integrity_check === 'ok') {
    console.log('OK: Integrity check passed');
  } else {
    console.log('FAIL: Integrity check failed:', result);
    ok = false;
  }
} catch (err) {
  console.log(`FAIL: Integrity check error: ${err.message}`);
  ok = false;
}

// 4. Foreign key check
try {
  const dbInstance = db.getDb();
  const fkErrors = dbInstance.pragma('foreign_key_check');
  if (fkErrors.length === 0) {
    console.log('OK: Foreign key constraints hold');
  } else {
    console.log(`FAIL: ${fkErrors.length} foreign key violations`);
    ok = false;
  }
} catch (err) {
  console.log(`FAIL: FK check error: ${err.message}`);
  ok = false;
}

// 5. Stats
try {
  const stats = db.getStats();
  console.log(`\nStats: ${stats.sessions} sessions, ${stats.observations} observations, ${stats.summaries} summaries`);
  if (stats.categories.length > 0) {
    console.log('Categories:');
    for (const c of stats.categories) {
      console.log(`  ${c.category}: ${c.cnt}`);
    }
  }
} catch (err) {
  console.log(`WARN: Could not read stats: ${err.message}`);
}

db.closeDb();
console.log(ok ? '\nAll checks passed.' : '\nSome checks FAILED.');
process.exit(ok ? 0 : 1);
