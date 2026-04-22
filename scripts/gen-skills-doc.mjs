#!/usr/bin/env node
// Regenerate docs/skills-catalogue.md from src/brain/skills-catalogue.ts.
// Requires a prior `npm run build` so ./dist is populated.
//
// Usage:
//   npm run build && node scripts/gen-skills-doc.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SKILLS,
  SKILLS_BY_DOMAIN,
  SKILLS_DOMAIN_COUNTS,
  SKILLS_LAYER_COUNTS,
} from '../dist/src/brain/skills-catalogue.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, '..', 'docs', 'skills-catalogue.md');

const LAYERS = ['competency', 'reasoning', 'analysis'];

const lines = [];
lines.push('# MLRO / Compliance Skills Catalogue');
lines.push('');
lines.push('Auto-generated reference for `src/brain/skills-catalogue.ts`. Do not hand-edit — edit the raw strings in the source and rerun `node scripts/gen-skills-doc.mjs`.');
lines.push('');
lines.push('| Metric | Value |');
lines.push('| --- | ---: |');
lines.push(`| Total skills | ${SKILLS.length} |`);
lines.push(`| Domains | ${Object.keys(SKILLS_BY_DOMAIN).length} |`);
lines.push('| Layers | 3 (competency / reasoning / analysis) |');
for (const layer of LAYERS) {
  lines.push(`| Layer: ${layer} | ${SKILLS_LAYER_COUNTS[layer] ?? 0} |`);
}
lines.push('');

const domains = Object.keys(SKILLS_BY_DOMAIN).sort(
  (a, b) => SKILLS_DOMAIN_COUNTS[b] - SKILLS_DOMAIN_COUNTS[a],
);
for (const d of domains) {
  lines.push(`## ${d} (${SKILLS_DOMAIN_COUNTS[d]})`);
  lines.push('');
  lines.push('| id | label | layer | weight |');
  lines.push('| --- | --- | --- | ---: |');
  for (const s of SKILLS_BY_DOMAIN[d]) {
    lines.push(`| \`${s.id}\` | ${s.label} | ${s.layer} | ${s.weight.toFixed(2)} |`);
  }
  lines.push('');
}

fs.writeFileSync(outPath, lines.join('\n'));
console.log(`wrote ${outPath} (${lines.length} lines, ${SKILLS.length} skills)`);
