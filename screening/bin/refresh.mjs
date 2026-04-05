#!/usr/bin/env node
/**
 * CLI: refresh sanctions + PEP sources.
 *
 * Usage:
 *   node screening/bin/refresh.mjs                  # refresh all enabled
 *   node screening/bin/refresh.mjs opensanctions-default
 *   node screening/bin/refresh.mjs --force          # bypass cache TTL
 *   node screening/bin/refresh.mjs --verify         # verify audit chain too
 *
 * Designed to be run from cron or GitHub Actions on a daily schedule.
 * Exits non-zero if any enabled source fails, so CI can alert.
 */

import Screening from '../index.js';
import { SOURCES } from '../config.js';

const args = process.argv.slice(2);
const force = args.includes('--force');
const doVerify = args.includes('--verify');
const positional = args.filter(a => !a.startsWith('--'));
const logger = (msg) => console.error(`[refresh] ${msg}`);

async function main() {
  await Screening.init();
  let results;
  if (positional.length) {
    results = {};
    for (const id of positional) {
      try {
        results[id] = await Screening.refreshOne(id, { force, logger });
      } catch (err) {
        results[id] = { error: err.message };
      }
    }
  } else {
    results = await Screening.refreshAll({ force, logger });
  }

  const summary = [];
  let failures = 0;
  for (const [id, r] of Object.entries(results)) {
    if (r.error) {
      failures++;
      summary.push(`  ${id.padEnd(30)}  FAIL  ${r.error}`);
    } else {
      summary.push(`  ${id.padEnd(30)}  ok  total=${r.total} +${r.added.length}/-${r.removed.length}/~${r.updated.length}`);
    }
  }
  console.log('\nRefresh summary:');
  console.log(summary.join('\n'));
  console.log(`\nStore: ${Screening.stats().entities} total entities.`);

  if (doVerify) {
    const v = await Screening.verify();
    console.log(`Audit chain: ${v.ok ? 'OK' : 'BROKEN'} (${v.entries} entries)`);
    if (!v.ok) { console.error('Audit chain broken at:', v.break); process.exit(2); }
  }
  process.exit(failures ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
