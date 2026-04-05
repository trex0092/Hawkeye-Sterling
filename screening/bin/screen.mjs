#!/usr/bin/env node
/**
 * CLI: screen a single subject against every loaded list.
 *
 * Usage:
 *   node screening/bin/screen.mjs "Vladimir Putin"
 *   node screening/bin/screen.mjs "ACME Trading LLC" --type entity
 *   node screening/bin/screen.mjs "John Doe" --dob 1970-01-15 --country US
 *   node screening/bin/screen.mjs "Ali Hassan" --subject CUST-00123 --adverse
 *   node screening/bin/screen.mjs --json "Name Here"    # machine-readable output
 *
 * Exit codes:
 *   0  — clear
 *   1  — review (low/medium hits)
 *   2  — block (high/exact hits)
 *   3  — runtime error
 */

import Screening from '../index.js';

const args = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--json') flags.json = true;
  else if (a === '--adverse') flags.adverse = true;
  else if (a === '--no-adverse') flags.noAdverse = true;
  else if (a === '--type') flags.type = args[++i];
  else if (a === '--dob') flags.dob = args[++i];
  else if (a === '--country') (flags.countries ||= []).push(args[++i]);
  else if (a === '--subject') flags.subject = args[++i];
  else if (a === '--alias') (flags.aliases ||= []).push(args[++i]);
  else positional.push(a);
}

const name = positional.join(' ').trim();
if (!name) {
  console.error('Usage: screen.mjs [flags] "Subject Name"');
  process.exit(3);
}

function band(b) {
  const colors = { exact: '\x1b[41m', high: '\x1b[31m', medium: '\x1b[33m', low: '\x1b[36m', reject: '\x1b[90m' };
  return `${colors[b] || ''}${b.toUpperCase()}\x1b[0m`;
}

async function main() {
  const query = {
    name,
    type: flags.type,
    dob: flags.dob,
    countries: flags.countries,
    aliases: flags.aliases,
    subjectId: flags.subject,
    includeAdverseMedia: flags.adverse ? true : (flags.noAdverse ? false : undefined),
  };
  const result = await Screening.screen(query, { actor: process.env.USER || 'cli' });

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\nSubject: ${name}`);
    console.log(`Case:    ${result.caseId}   audit seq=${result.auditSeq}`);
    console.log(`Band:    ${band(result.topBand)}   Decision: ${result.decision.toUpperCase()}`);
    console.log(`Hits:    ${result.hits.length}`);
    for (const h of result.hits.slice(0, 10)) {
      console.log(`  ${band(h.band)} ${h.score.toFixed(3)}  ${h.source.padEnd(20)}  ${h.matchedName}`);
      console.log(`         topics=${h.topics?.join(',') || '-'}  programs=${(h.programs || []).slice(0, 3).join(';') || '-'}`);
    }
    if (result.adverseMedia && result.adverseMedia.length) {
      console.log(`\nAdverse media (${result.adverseMedia.length}):`);
      for (const a of result.adverseMedia.slice(0, 5)) {
        console.log(`  ${(a.tone ?? 0).toFixed(1).padStart(5)}  ${a.domain}  ${a.title}`);
      }
    }
  }

  if (result.decision === 'block') process.exit(2);
  if (result.decision === 'review') process.exit(1);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(3); });
