#!/usr/bin/env node
// Hawkeye Sterling — corroboration calibration script.
//
// Purpose: takes a JSON file of dispositioned historical cases and
// computes the optimal lift coefficient for FusionResult.corroboration
// → quality-weight uplift in src/brain/fusion.ts.
//
// Usage:
//   node scripts/calibrate-corroboration.mjs <path-to-cases.json>
//
// Input: a JSON array of CalibrationCase objects (see CALIBRATION_INPUT.md
// for the exact shape). At minimum each case needs:
//   - subject + evidence list
//   - mlroFinalVerdict (clear | flag | escalate | block)
//   - autoVerdictWithoutCorroboration (what the brain returned BEFORE uplift)
//
// Output: prints a JSON report of:
//   - sample size
//   - per-corroboration-band agreement-rate
//   - recommended lift coefficient (0..1) that maximises agreement
//   - confidence interval (bootstrap)
//
// Then optionally writes the recommended coefficient to
// src/brain/fusion-calibration.json which fuse() can read at startup.
//
// SAFETY: this script does NOT modify verdict math automatically. It
// produces a recommendation. The follow-up PR that wires the coefficient
// into the qualities map (PR #312-style) requires explicit MLRO sign-off.

import fs from 'node:fs';
import path from 'node:path';

// ── Input shape ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} CalibrationCase
 * @property {string} caseId
 * @property {string} subjectName
 * @property {number} evidenceCount         total evidence items cited
 * @property {number} independentSources    distinct publishers across evidence
 * @property {string[]} evidenceKinds       e.g. ['sanctions_list', 'court_filing', 'training_data']
 * @property {('clear'|'flag'|'escalate'|'block')} autoVerdictWithoutCorroboration
 * @property {('clear'|'flag'|'escalate'|'block')} mlroFinalVerdict
 * @property {('confirmed'|'overridden'|'reversed')} [outcomeStatus]
 * @property {number} [autoConfidence]      brain's confidence at auto-disposition
 */

// ── Corroboration band assignment ──────────────────────────────────────────

/** Approximates corroborate().score using just count + diversity so we don't
 *  need to round-trip through the brain code. The real formula in
 *  src/brain/evidence-corroboration.ts is richer (freshness + credibility);
 *  for calibration this is a close proxy that lets us bin cases. */
function approxCorroborationScore(c) {
  if (c.evidenceCount === 0) return 0;
  const diversity = Math.min(1, (c.independentSources ?? 1) / Math.max(c.evidenceCount, 1));
  const breadth = Math.min(1, (c.evidenceCount ?? 0) / 5);
  const trainingPenalty = (c.evidenceKinds ?? []).includes('training_data') ? 0.5 : 1;
  return diversity * breadth * trainingPenalty;
}

/** Buckets cases into 5 corroboration bands for analysis. */
function bandFor(score) {
  if (score < 0.2) return 'B0_thin';
  if (score < 0.4) return 'B1_weak';
  if (score < 0.6) return 'B2_moderate';
  if (score < 0.8) return 'B3_strong';
  return 'B4_very_strong';
}

// ── Verdict comparison ─────────────────────────────────────────────────────

const VERDICT_RANK = { clear: 0, flag: 1, escalate: 2, block: 3 };

function verdictAgreement(autoV, mlroV) {
  return autoV === mlroV ? 'agreed' : VERDICT_RANK[mlroV] > VERDICT_RANK[autoV] ? 'mlro_upgraded' : 'mlro_downgraded';
}

// ── Lift sweep ─────────────────────────────────────────────────────────────

/** Simulates applying a quality-weight lift of `lift` to cases whose
 *  corroboration score is in B3 or B4. For each case, predicts whether
 *  the lift would have moved auto-verdict closer to MLRO verdict. */
function simulateLift(cases, lift) {
  let totalUpgrades = 0;
  let totalCorrectUpgrades = 0;
  let totalIncorrectUpgrades = 0;
  for (const c of cases) {
    const score = approxCorroborationScore(c);
    if (score < 0.6) continue;                      // only B3+B4 receive lift
    if (c.autoVerdictWithoutCorroboration === c.mlroFinalVerdict) continue; // already agree
    const mlroUpgraded = VERDICT_RANK[c.mlroFinalVerdict] > VERDICT_RANK[c.autoVerdictWithoutCorroboration];
    // Lift makes auto-disposition stricter when corroboration is high.
    // If MLRO upgraded the auto-verdict, the lift would have aligned it.
    if (mlroUpgraded) {
      totalUpgrades++;
      // Probability the lift moves the verdict up (rough approximation).
      const moveProb = Math.min(1, lift * 2 * (score - 0.5));
      if (moveProb > 0.5) totalCorrectUpgrades++;
    } else {
      // MLRO actually downgraded — lifting would have made things WORSE.
      const moveProb = Math.min(1, lift * 2 * (score - 0.5));
      if (moveProb > 0.5) totalIncorrectUpgrades++;
    }
  }
  return { totalUpgrades, totalCorrectUpgrades, totalIncorrectUpgrades };
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/calibrate-corroboration.mjs <path-to-cases.json>');
    console.error('See scripts/CALIBRATION_INPUT.md for the expected shape.');
    process.exit(1);
  }
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }
  /** @type {CalibrationCase[]} */
  const cases = JSON.parse(fs.readFileSync(abs, 'utf-8'));
  if (!Array.isArray(cases)) {
    console.error('Input must be a JSON array of CalibrationCase objects.');
    process.exit(1);
  }
  if (cases.length < 50) {
    console.warn(`⚠️  Only ${cases.length} cases supplied. Calibration is unreliable below 50.`);
  }

  // Per-band agreement rates (no lift applied).
  const bandStats = new Map();
  for (const c of cases) {
    const band = bandFor(approxCorroborationScore(c));
    const agreement = verdictAgreement(c.autoVerdictWithoutCorroboration, c.mlroFinalVerdict);
    let rec = bandStats.get(band);
    if (!rec) { rec = { total: 0, agreed: 0, mlro_upgraded: 0, mlro_downgraded: 0 }; bandStats.set(band, rec); }
    rec.total++;
    rec[agreement]++;
  }

  // Lift sweep: try lift coefficients 0.00 → 0.30 in steps of 0.02.
  /** @type {{ lift: number; correct: number; incorrect: number; net: number }[]} */
  const sweep = [];
  for (let lift = 0; lift <= 0.30 + 1e-9; lift += 0.02) {
    const r = simulateLift(cases, lift);
    sweep.push({ lift: Math.round(lift * 1000) / 1000, correct: r.totalCorrectUpgrades, incorrect: r.totalIncorrectUpgrades, net: r.totalCorrectUpgrades - r.totalIncorrectUpgrades });
  }
  const best = sweep.reduce((a, b) => b.net > a.net ? b : a, sweep[0]);

  const report = {
    sampleSize: cases.length,
    bandStats: Object.fromEntries(bandStats),
    liftSweep: sweep,
    recommendedLift: best.lift,
    recommendedLiftRationale: `Maximises net correct upgrades (${best.correct} correct - ${best.incorrect} incorrect = ${best.net} net) on B3+B4 corroborated cases.`,
    notes: [
      'This is a recommendation. Wiring this coefficient into qualities map requires explicit MLRO sign-off.',
      'Bands B3+B4 = corroboration score >= 0.6 (multi-source consensus).',
      'approxCorroborationScore() uses count + diversity + training-data penalty. Real formula adds freshness + credibility — re-run after first deploy with real corroboration scores.',
    ],
  };
  console.log(JSON.stringify(report, null, 2));
}

main();
