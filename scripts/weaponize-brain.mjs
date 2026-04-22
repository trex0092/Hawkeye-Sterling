#!/usr/bin/env node
// Hawkeye Sterling — weaponize-brain CLI.
//
// Builds the maximal weaponized system prompt (charter + full cognitive
// catalogue + full skills catalogue + integrity block), runs assertWeaponized
// against it, and prints a summary. Non-zero exit on any missing section.
//
// Usage:
//   npm run build
//   node scripts/weaponize-brain.mjs                     # prints summary
//   node scripts/weaponize-brain.mjs --prompt            # also prints the prompt
//   node scripts/weaponize-brain.mjs --manifest          # also prints the manifest JSON
//   node scripts/weaponize-brain.mjs --all               # prints everything
//
// Exit:
//   0  every assertion present
//   1  at least one assertion missing (with details)

import {
  weaponizedSystemPrompt,
  assertWeaponized,
  buildWeaponizedBrainManifest,
  weaponizedIntegrity,
} from '../dist/src/brain/weaponized.js';

const args = new Set(process.argv.slice(2));
const wantPrompt = args.has('--prompt') || args.has('--all');
const wantManifest = args.has('--manifest') || args.has('--all');

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

if (!report.ok) {
  console.error('');
  console.error(`FAIL — ${report.missing.length} section(s) missing: ${report.missing.join(', ')}`);
  process.exit(1);
}
process.exit(0);
