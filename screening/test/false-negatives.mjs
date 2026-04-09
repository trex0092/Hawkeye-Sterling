#!/usr/bin/env node
/**
 * False-Negative Monitoring — Known-Bad-Actor Test Set.
 *
 * Screens a curated set of well-known sanctioned entities and PEPs
 * against the screening engine and measures recall. If the engine
 * fails to flag a known target, that is a false negative that must
 * be investigated.
 *
 * This test set uses publicly known sanctioned entities from:
 *   - OFAC SDN List (US Treasury)
 *   - UN Security Council Consolidated List
 *   - EU Financial Sanctions File
 *
 * All names below are public, published on official sanctions lists.
 *
 * Run: node screening/test/false-negatives.mjs
 *
 * Exit codes:
 *   0 — All known-bad actors flagged (100% recall)
 *   1 — One or more false negatives detected
 *   2 — Test could not run (store not loaded, no data)
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

/**
 * Curated test set of known sanctioned entities.
 * Each entry includes the exact list name, common spelling variants,
 * and the expected minimum band (low/medium/high/exact).
 *
 * IMPORTANT: These are REAL sanctioned entities from public lists.
 * The test validates that the screening engine detects them.
 */
const KNOWN_BAD_ACTORS = [
  // UN-sanctioned individuals
  {
    name: 'Osama bin Laden',
    variants: ['Usama bin Ladin', 'Osama bin Ladin', 'Usama bin Laden'],
    type: 'person',
    source: 'UN SC Res. 1267',
    expectedMinBand: 'low',
  },
  {
    name: 'Ayman al-Zawahiri',
    variants: ['Aiman al-Zawahiri', 'Ayman Al Zawahiri'],
    type: 'person',
    source: 'UN SC Res. 1267',
    expectedMinBand: 'low',
  },
  // OFAC SDN entities
  {
    name: 'Islamic Revolutionary Guard Corps',
    variants: ['IRGC', 'Sepah-e Pasdaran'],
    type: 'entity',
    source: 'OFAC SDN',
    expectedMinBand: 'low',
  },
  {
    name: 'Hezbollah',
    variants: ['Hizbollah', 'Hizballah', 'Hizb Allah'],
    type: 'entity',
    source: 'OFAC SDN',
    expectedMinBand: 'low',
  },
  // DPRK proliferation network
  {
    name: 'Korea Mining Development Trading Corporation',
    variants: ['KOMID'],
    type: 'entity',
    source: 'UN SC Res. 1718',
    expectedMinBand: 'low',
  },
  // Russian sanctions
  {
    name: 'Vladimir Putin',
    variants: ['Vladimir Vladimirovich Putin', 'Владимир Путин'],
    type: 'person',
    source: 'EU/UK/OFAC',
    expectedMinBand: 'low',
  },
  // UAE-relevant: common misspelling tests
  {
    name: 'Al-Qaeda',
    variants: ['Al Qaeda', 'Al Qaida', 'Al-Qaida'],
    type: 'entity',
    source: 'UN SC Res. 1267',
    expectedMinBand: 'low',
  },
  // Taliban
  {
    name: 'Taliban',
    variants: ['Taleban', 'The Taliban'],
    type: 'entity',
    source: 'UN SC Res. 1988',
    expectedMinBand: 'low',
  },
];

const BAND_RANK = { reject: 0, low: 1, medium: 2, high: 3, exact: 4 };

async function main() {
  console.log('[false-negative-monitor] Starting known-bad-actor recall test...\n');

  let screening;
  try {
    screening = await import(resolve(PROJECT_ROOT, 'screening', 'index.js'));
    await screening.init();
  } catch (err) {
    console.error(`[false-negative-monitor] Cannot init screening engine: ${err.message}`);
    console.error('Run "node screening/bin/refresh.mjs" first to populate the store.');
    process.exit(2);
  }

  const stats = screening.stats();
  if (!stats.initialized || stats.entities === 0) {
    console.error('[false-negative-monitor] Store is empty. Run refresh first.');
    process.exit(2);
  }

  console.log(`Store: ${stats.entities} entities from ${Object.keys(stats.sources || {}).length} sources\n`);

  let totalTests = 0;
  let passed = 0;
  let falseNegatives = [];

  for (const actor of KNOWN_BAD_ACTORS) {
    const allNames = [actor.name, ...actor.variants];

    for (const testName of allNames) {
      totalTests++;
      try {
        const result = await screening.screen(
          { name: testName, type: actor.type },
          { force: true, includeAdverseMedia: false }
        );

        const resultRank = BAND_RANK[result.topBand] || 0;
        const expectedRank = BAND_RANK[actor.expectedMinBand] || 0;

        if (resultRank >= expectedRank) {
          console.log(`  PASS  "${testName}" -> ${result.topBand} (score: ${result.hits[0]?.score || 0})`);
          passed++;
        } else {
          console.error(`  FAIL  "${testName}" -> ${result.topBand} (expected >=${actor.expectedMinBand}, source: ${actor.source})`);
          falseNegatives.push({
            name: testName,
            canonicalName: actor.name,
            source: actor.source,
            expected: actor.expectedMinBand,
            actual: result.topBand,
            topScore: result.hits[0]?.score || 0,
          });
        }
      } catch (err) {
        console.error(`  ERROR "${testName}": ${err.message}`);
        falseNegatives.push({
          name: testName,
          canonicalName: actor.name,
          source: actor.source,
          expected: actor.expectedMinBand,
          actual: 'error',
          error: err.message,
        });
      }
    }
  }

  const recall = totalTests > 0 ? ((passed / totalTests) * 100).toFixed(1) : '0.0';

  console.log(`\n--- Results ---`);
  console.log(`Total tests: ${totalTests}`);
  console.log(`Passed: ${passed}`);
  console.log(`False negatives: ${falseNegatives.length}`);
  console.log(`Recall: ${recall}%`);

  if (falseNegatives.length > 0) {
    console.log(`\n--- False Negatives (INVESTIGATE) ---`);
    for (const fn of falseNegatives) {
      console.log(`  ${fn.name} (${fn.source}): expected >=${fn.expected}, got ${fn.actual}`);
    }
    console.log('\nAction required: Review screening thresholds and name normalization.');
    process.exit(1);
  }

  console.log('\nAll known-bad actors detected. Recall is 100%.');
  process.exit(0);
}

main();
