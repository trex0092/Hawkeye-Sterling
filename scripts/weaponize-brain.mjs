#!/usr/bin/env node
// Hawkeye Sterling — weaponize-brain CLI.
//
// Builds the maximal weaponized system prompt (charter + full cognitive
// catalogue + full skills catalogue + integrity block), runs assertWeaponized
// against it, and prints a summary. Non-zero exit on any missing section.
//
// Also validates reasoning-mode content hashes: every mode registered in
// _MODE_VERSION_ENTRIES must have a real SHA-256 hex digest (64 hex chars),
// not a placeholder like 'sha256:w13-an-001' or 'sha256:pending'.
//
// Usage:
//   npm run build
//   node scripts/weaponize-brain.mjs                     # prints summary + hash check
//   node scripts/weaponize-brain.mjs --prompt            # also prints the prompt
//   node scripts/weaponize-brain.mjs --manifest          # also prints the manifest JSON
//   node scripts/weaponize-brain.mjs --emit-hashes       # prints computed hashes for all modes
//   node scripts/weaponize-brain.mjs --all               # prints everything
//
// Exit:
//   0  every assertion present, no placeholder hashes in pinned entries
//   1  at least one assertion missing or placeholder hash detected (with details)

import { createHash } from 'crypto';
import {
  weaponizedSystemPrompt,
  assertWeaponized,
  buildWeaponizedBrainManifest,
  weaponizedIntegrity,
} from '../dist/src/brain/weaponized.js';

const args = new Set(process.argv.slice(2));
const wantPrompt = args.has('--prompt') || args.has('--all');
const wantManifest = args.has('--manifest') || args.has('--all');
const wantEmitHashes = args.has('--emit-hashes') || args.has('--all');

// ── Mode content-hash helpers ─────────────────────────────────────────────────

/** Compute a deterministic SHA-256 digest of a mode's identity fields.
 *  Hashes: id | description | category | faculties (sorted, joined by ',')
 *  This mirrors what a MLRO would sign off on — the semantic content of the mode.
 *  The apply() function body is excluded because it is generated from these same
 *  fields via defaultApply() and would be redundant. */
function computeModeHash(mode) {
  const { id, description, category, faculties } = mode;
  const canonical = [
    id,
    description ?? '',
    category ?? '',
    (Array.isArray(faculties) ? [...faculties].sort() : []).join(','),
  ].join('|');
  return 'sha256:' + createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** Returns true if a contentHash is a real SHA-256 digest.
 *  Format: 'sha256:' followed by exactly 64 lowercase hex chars. */
function isRealHash(contentHash) {
  return /^sha256:[0-9a-f]{64}$/.test(contentHash ?? '');
}

// Load reasoning modes from compiled dist/ for hash validation.
let REASONING_MODES_LIST = null;
let MODE_REGISTRY_MAP = null;
try {
  const { REASONING_MODES, MODE_REGISTRY } = await import('../dist/src/brain/reasoning-modes.js');
  REASONING_MODES_LIST = REASONING_MODES;
  MODE_REGISTRY_MAP = MODE_REGISTRY;
} catch {
  // Non-fatal: hash validation degraded if dist/ not compiled.
  console.warn('[weaponize-brain] Could not load reasoning-modes from dist/ — mode hash validation skipped.');
}

const prompt = weaponizedSystemPrompt({
  taskRole:
    'You are the Hawkeye Sterling weaponized MLRO brain. Acknowledge ' +
    'every section of this prompt before reasoning. Cite by id.',
  audience: 'regulator',
  includeCatalogueSummary: true,
  includeSkillsCatalogue: true,
  includeSkillsFullList: true,
  includeIntegrityBlock: true,
});

const report = assertWeaponized(prompt);
const integrity = weaponizedIntegrity();

const line = '='.repeat(80);

console.log(line);
console.log('Hawkeye Sterling — weaponization report');
console.log(line);
console.log(`prompt length   : ${report.prompt.length.toLocaleString()} chars`);
console.log(`prompt lines    : ${report.prompt.lines.toLocaleString()}`);
console.log(`charterHash     : ${integrity.charterHash}`);
console.log(`catalogueHash   : ${integrity.catalogueHash}`);
console.log(`compositeHash   : ${integrity.compositeHash}`);
console.log(`sections checked: ${report.sections.length}`);
console.log(`sections missing: ${report.missing.length}`);
console.log(`ok              : ${report.ok ? 'YES' : 'NO'}`);
console.log('');
console.log('per-section:');
for (const s of report.sections) {
  console.log(`  [${s.present ? 'x' : ' '}] ${s.id.padEnd(22, ' ')} ${s.label}`);
}

if (wantManifest) {
  console.log('');
  console.log(line);
  console.log('MANIFEST');
  console.log(line);
  console.log(JSON.stringify(buildWeaponizedBrainManifest(), null, 2));
}

if (wantPrompt) {
  console.log('');
  console.log(line);
  console.log('PROMPT');
  console.log(line);
  console.log(prompt);
}

// ── Mode content-hash validation ─────────────────────────────────────────────

let hashCheckPassed = true;

if (MODE_REGISTRY_MAP && REASONING_MODES_LIST) {
  const modeMap = new Map(REASONING_MODES_LIST.map((m) => [m.id, m]));
  const placeholderEntries = [];
  const mismatchEntries = [];

  for (const [modeId, entry] of MODE_REGISTRY_MAP.entries()) {
    // Skip pending modes — they are caught by check-mode-versions.mjs
    if (entry.version === '0.0.0-pending') continue;

    // A pinned entry must have a real SHA-256 hash
    if (!isRealHash(entry.contentHash)) {
      placeholderEntries.push({ modeId, contentHash: entry.contentHash });
    }
  }

  if (wantEmitHashes) {
    console.log('');
    console.log(line);
    console.log('COMPUTED MODE HASHES (paste into _MODE_VERSION_ENTRIES)');
    console.log(line);
    for (const mode of REASONING_MODES_LIST) {
      const hash = computeModeHash(mode);
      const entry = MODE_REGISTRY_MAP.get(mode.id);
      const hasPinned = entry && entry.version !== '0.0.0-pending';
      const status = hasPinned
        ? (isRealHash(entry.contentHash) ? 'OK ' : 'PLACEHOLDER')
        : 'PENDING';
      console.log(`  ${status}  ${mode.id}`);
      if (!hasPinned || !isRealHash(entry?.contentHash)) {
        console.log(`         contentHash: '${hash}'`);
      }
    }
  }

  if (placeholderEntries.length > 0) {
    hashCheckPassed = false;
    console.error('');
    console.error(`MODE HASH FAIL — ${placeholderEntries.length} pinned mode(s) have placeholder contentHash values.`);
    console.error('Run with --emit-hashes to get the computed SHA-256 values. Each must be reviewed and approved by MLRO/CO.');
    for (const { modeId, contentHash } of placeholderEntries) {
      console.error(`  ${modeId}: ${contentHash}`);
    }
  }

  console.log('');
  console.log(`mode hash check : ${hashCheckPassed ? 'PASS' : 'FAIL'} (${placeholderEntries.length} placeholder(s) in pinned entries)`);
}

if (!report.ok || !hashCheckPassed) {
  if (!report.ok) {
    console.error('');
    console.error(`FAIL — ${report.missing.length} section(s) missing: ${report.missing.join(', ')}`);
  }
  process.exit(1);
}
process.exit(0);
