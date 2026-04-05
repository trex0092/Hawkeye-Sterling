#!/usr/bin/env node
/**
 * CLI: verify the hash-chained audit log end to end.
 *
 * This is what you run on the morning of a regulator visit. A clean
 * output is evidence that no prior screening decision, refresh event, or
 * override has been tampered with since it was written.
 */

import Screening from '../index.js';

async function main() {
  await Screening.init();
  const v = await Screening.verify();
  const anchor = Screening.stats().auditHead;
  console.log(`Audit chain: ${v.ok ? 'OK' : 'BROKEN'}`);
  console.log(`Entries verified: ${v.entries}`);
  if (anchor) {
    console.log(`Head: seq=${anchor.seq} hash=${anchor.hash} ts=${anchor.ts}`);
  }
  if (!v.ok) {
    console.error('Tamper detected at:', v.break);
    process.exit(2);
  }
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
