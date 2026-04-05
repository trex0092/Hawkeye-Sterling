/**
 * Batch-screen every open counterparty in the register against the
 * unified sanctions / PEP / adverse-media engine and update each row's
 * risk_rating + mlro_notes.
 *
 * Intended to run daily after daily-priorities.mjs, so the register
 * always reflects the latest sanctions refresh. Every screening call is
 * recorded in the hash-chained audit log.
 *
 * Runs:
 *   node scripts/screen-counterparties.mjs
 *   DRY_RUN=true node scripts/screen-counterparties.mjs
 *
 * Exit codes:
 *   0  — completed (may still have flagged hits; check output)
 *   1  — at least one subject was blocked (high/exact) — MLRO attention
 *   2  — execution failed
 *
 * The script does not modify status or MLRO-edited fields unless a new
 * high-confidence hit requires escalation. It only:
 *   - lifts risk_rating when a sanctions/PEP match is discovered
 *   - appends a one-line provenance note to mlro_notes referencing the
 *     audit seq number, so the MLRO can trace back
 */

import Screening from '../screening/index.js';
import { readRegister, writeRegister } from './counterparty-register.mjs';

const DRY_RUN = process.env.DRY_RUN === 'true';

function bandToRating(band) {
  switch (band) {
    case 'exact':
    case 'high':   return 'critical';
    case 'medium': return 'high';
    case 'low':    return 'medium';
    default:       return null;
  }
}

function bumpRating(current, suggested) {
  const order = { low: 1, medium: 2, high: 3, critical: 4 };
  if (!suggested) return current;
  if (!current) return suggested;
  return order[suggested] > (order[current] || 0) ? suggested : current;
}

async function main() {
  console.error(`[screen-counterparties] initialising screening engine${DRY_RUN ? ' (DRY RUN)' : ''}`);
  await Screening.init();
  const stats = Screening.stats();
  console.error(`[screen-counterparties] store has ${stats.entities} entities across ${Object.keys(stats.sources || {}).length} sources`);

  const register = await readRegister();
  const rows = [...register.values()].filter((r) => {
    const s = (r.status || '').toLowerCase();
    return s !== 'cleared' && s !== 'archived';
  });
  console.error(`[screen-counterparties] screening ${rows.length} active counterparties`);

  let blocked = 0;
  let flagged = 0;
  let cleared = 0;

  for (const row of rows) {
    const query = {
      name: row.counterparty_name,
      type: /llc|ltd|corp|inc|sa|gmbh|ag|group/i.test(row.counterparty_name) ? 'entity' : undefined,
      countries: row.jurisdiction ? [row.jurisdiction] : undefined,
      subjectId: row.counterparty_name,
    };

    let result;
    try {
      result = await Screening.screen(query, { actor: 'scripts/screen-counterparties' });
    } catch (err) {
      console.error(`  ERROR  ${row.counterparty_name}: ${err.message}`);
      continue;
    }

    const top = result.hits[0];
    const tag = `[screen seq=${result.auditSeq} band=${result.topBand}]`;
    if (result.decision === 'block') {
      blocked++;
      console.error(`  BLOCK  ${row.counterparty_name}  ${top?.source}:${top?.matchedName}  ${top?.score}`);
      row.risk_rating = bumpRating(row.risk_rating, bandToRating(result.topBand));
      if (row.status !== 'escalated') row.status = 'escalated';
      row.mlro_notes = `${tag} HIT: ${top.source} ${top.matchedName} — ${row.mlro_notes || ''}`.slice(0, 800);
    } else if (result.decision === 'review') {
      flagged++;
      console.error(`  REVIEW ${row.counterparty_name}  ${top?.source}:${top?.matchedName}  ${top?.score}`);
      row.risk_rating = bumpRating(row.risk_rating, bandToRating(result.topBand));
      if (row.status === 'open') row.status = 'under_review';
      row.mlro_notes = `${tag} hit: ${top.source} ${top.matchedName} — ${row.mlro_notes || ''}`.slice(0, 800);
    } else {
      cleared++;
    }
  }

  if (!DRY_RUN) {
    await writeRegister(register);
    console.error(`[screen-counterparties] register updated`);
  } else {
    console.error(`[screen-counterparties] dry run — register NOT written`);
  }

  console.error(`\n[screen-counterparties] summary: ${blocked} blocked, ${flagged} flagged, ${cleared} cleared`);
  process.exit(blocked > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(2); });
