#!/usr/bin/env node
/**
 * CLI for searching the Claude memory system.
 *
 * Usage:
 *   node claude-mem/search/cli.mjs "query"
 *   node claude-mem/search/cli.mjs "query" --category screening_result
 *   node claude-mem/search/cli.mjs --stats
 *   node claude-mem/search/cli.mjs --timeline 42,43,44
 */

import mem from '../index.mjs';
import { timeline } from './hybrid.mjs';

const args = process.argv.slice(2);

try {
  if (args.includes('--stats')) {
    const stats = mem.stats();
    console.log(JSON.stringify(stats, null, 2));
    process.exit(0);
  }

  if (args.includes('--timeline')) {
    const idx = args.indexOf('--timeline');
    const ids = (args[idx + 1] || '').split(',').map(Number).filter(Boolean);
    if (ids.length === 0) {
      console.error('Usage: --timeline <id1,id2,...>');
      process.exit(1);
    }
    const result = timeline(ids);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  if (args.includes('--details')) {
    const idx = args.indexOf('--details');
    const ids = (args[idx + 1] || '').split(',').map(Number).filter(Boolean);
    if (ids.length === 0) {
      console.error('Usage: --details <id1,id2,...>');
      process.exit(1);
    }
    const result = mem.getObservations(ids);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  // Parse query and options
  const query = args.find(a => !a.startsWith('--'));
  const opts = {};

  const catIdx = args.indexOf('--category');
  if (catIdx >= 0) opts.category = args[catIdx + 1];

  const entIdx = args.indexOf('--entity');
  if (entIdx >= 0) opts.entity = args[entIdx + 1];

  const impIdx = args.indexOf('--importance');
  if (impIdx >= 0) opts.minImportance = Number(args[impIdx + 1]);

  const limIdx = args.indexOf('--limit');
  if (limIdx >= 0) opts.limit = Number(args[limIdx + 1]);

  if (!query && Object.keys(opts).length === 0) {
    console.log('Usage: node search/cli.mjs "query" [--category <cat>] [--entity <name>] [--importance <n>] [--limit <n>]');
    console.log('       node search/cli.mjs --stats');
    console.log('       node search/cli.mjs --timeline <id1,id2,...>');
    console.log('       node search/cli.mjs --details <id1,id2,...>');
    process.exit(0);
  }

  const results = mem.search(query || '', opts);

  if (results.length === 0) {
    console.log('No matching observations found.');
  } else {
    console.log(`Found ${results.length} results:\n`);
    for (const r of results) {
      const entity = r.entity ? ` [${r.entity}]` : '';
      console.log(`  #${r.id}  ${r.date}  (${r.category}${entity})  imp:${r.importance}  score:${r.score}`);
      console.log(`        ${r.snippet}`);
      console.log();
    }
    console.log(`Tip: use --timeline ${results.slice(0, 3).map(r => r.id).join(',')} for context`);
    console.log(`     use --details ${results.slice(0, 3).map(r => r.id).join(',')} for full content`);
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
} finally {
  mem.close();
}
