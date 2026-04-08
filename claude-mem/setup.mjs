#!/usr/bin/env node
/**
 * Setup script for the Hawkeye-Sterling Claude memory system.
 *
 * Initialises the database, creates required directories, and
 * verifies that dependencies are installed.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { PATHS } from './config.mjs';
import * as db from './db/sqlite.mjs';

console.log('Hawkeye-Sterling Claude Memory System — Setup');
console.log('=============================================\n');

// 1. Check dependencies
console.log('1. Checking dependencies...');
try {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  require('better-sqlite3');
  console.log('   better-sqlite3: OK');
} catch {
  console.error('   better-sqlite3: NOT FOUND');
  console.error('   Run: cd claude-mem && npm install');
  process.exit(1);
}

// 2. Create directories
console.log('\n2. Creating directories...');
for (const [name, path] of Object.entries(PATHS)) {
  if (name === 'dbFile') continue;
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
    console.log(`   Created: ${path}`);
  } else {
    console.log(`   Exists:  ${path}`);
  }
}

// 3. Initialise database
console.log('\n3. Initialising database...');
try {
  db.getDb();
  console.log(`   Database: ${PATHS.dbFile}`);
  const stats = db.getStats();
  console.log(`   Sessions: ${stats.sessions}`);
  console.log(`   Observations: ${stats.observations}`);
  console.log(`   Summaries: ${stats.summaries}`);
} catch (err) {
  console.error(`   Database error: ${err.message}`);
  process.exit(1);
} finally {
  db.closeDb();
}

// 4. Seed L0 core context
console.log('\n4. Seeding L0 core context...');
try {
  db.getDb();
  const existing = db.getSummariesByTier('L0', 1);
  if (existing.length === 0) {
    db.addSummary({
      tier: 'L0',
      category: 'regulatory_observation',
      content: [
        'Hawkeye-Sterling is a UAE-licensed DNFBP compliance automation system.',
        'Supervised by Ministry of Economy. Primary law: Federal Decree-Law No. 10 of 2025.',
        'NEVER cite Federal Decree-Law No. 20 of 2018 (deprecated).',
        'All output must be plain-text UTF-8 for regulator transparency.',
        'Output style: formal compliance register voice, 0% AI-tells.',
      ].join('\n'),
      tokens: 80,
    });
    console.log('   Seeded initial L0 regulatory context.');
  } else {
    console.log('   L0 context already exists.');
  }
} catch (err) {
  console.error(`   Seeding error: ${err.message}`);
} finally {
  db.closeDb();
}

console.log('\nSetup complete. Memory system is ready.');
console.log('Hook registration is in .claude/settings.json');
