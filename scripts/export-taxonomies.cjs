#!/usr/bin/env node
'use strict';
// Emit JSON dumps of the red-flag taxonomy + capabilities catalogue so
// the browser panel (public/mlro-panels.js) can fetch them without
// needing a bundler. Reads the TS files, extracts the raw data via
// regex + JSON.parse on each object literal.

const fs = require('fs');
const path = require('path');

function readItems(file, needles) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /\{[^{}]*\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const blk = m[0];
    if (!needles.every((n) => blk.includes(n))) continue;
    try {
      // Translate bare keys → quoted for JSON.parse.
      const json = blk
        .replace(/(\b[a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '"$1":')
        .replace(/'/g, '"')
        .replace(/,\s*\}/g, '}');
      out.push(JSON.parse(json));
    } catch (_) { /* skip */ }
  }
  return out;
}

const outDir = path.join(__dirname, '..', 'public', 'taxonomies');
fs.mkdirSync(outDir, { recursive: true });

const redFlags = readItems(
  path.join(__dirname, '..', 'src/brain/mlro-red-flags-taxonomy.generated.ts'),
  ['id', 'label', 'bucket'],
);
fs.writeFileSync(path.join(outDir, 'red-flags.json'), JSON.stringify(redFlags, null, 2));
console.error('wrote', redFlags.length, 'red flags →', path.join('public/taxonomies/red-flags.json'));

const capabilities = readItems(
  path.join(__dirname, '..', 'src/brain/mlro-capabilities.generated.ts'),
  ['id', 'label', 'bucket'],
);
fs.writeFileSync(path.join(outDir, 'capabilities.json'), JSON.stringify(capabilities, null, 2));
console.error('wrote', capabilities.length, 'capabilities →', path.join('public/taxonomies/capabilities.json'));
