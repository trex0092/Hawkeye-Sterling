#!/usr/bin/env node
/**
 * CLI for compressing and managing memory context.
 *
 * Usage:
 *   node context/compact-cli.mjs                  # Compress all uncompressed sessions
 *   node context/compact-cli.mjs --promote         # Promote old L1 summaries to L2
 *   node context/compact-cli.mjs --session <id>    # Compress a specific session
 */

import * as db from '../db/sqlite.mjs';
import { compressSession, promoteToArchive } from './compressor.mjs';

const args = process.argv.slice(2);

try {
  if (args.includes('--promote')) {
    const count = promoteToArchive(5);
    console.log(count > 0 ? `Promoted ${count} summaries from L1 to L2.` : 'Nothing to promote.');
    process.exit(0);
  }

  if (args.includes('--session')) {
    const idx = args.indexOf('--session');
    const sessionId = args[idx + 1];
    if (!sessionId) {
      console.error('Usage: --session <id>');
      process.exit(1);
    }
    const summary = await compressSession(sessionId);
    console.log('Compressed session:', sessionId);
    console.log(summary);
    process.exit(0);
  }

  // Default: compress all uncompressed sessions
  const dbInstance = db.getDb();
  const uncompressed = dbInstance.prepare(
    'SELECT id FROM sessions WHERE compressed = 0 AND ended_at IS NOT NULL'
  ).all();

  if (uncompressed.length === 0) {
    console.log('No uncompressed sessions found.');
    process.exit(0);
  }

  console.log(`Found ${uncompressed.length} uncompressed sessions.`);
  for (const s of uncompressed) {
    const summary = await compressSession(s.id);
    console.log(`\nCompressed ${s.id}:`);
    console.log(summary);
  }

  // Also promote old summaries
  const promoted = promoteToArchive(5);
  if (promoted > 0) console.log(`\nPromoted ${promoted} summaries to archive tier.`);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
} finally {
  db.closeDb();
}
