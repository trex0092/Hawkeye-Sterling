#!/usr/bin/env node
'use strict';
// Emit JSON dumps of the red-flag taxonomy + capabilities catalogue so
// the browser panel (public/mlro-panels.js) can fetch them without
// needing a bundler. Reads the TS files, extracts the raw data via
// regex + JSON.parse on each object literal.

const fs = require('fs');
const path = require('path');

// ── Source file registry ─────────────────────────────────────────────────────
// Each entry defines:
//   file       — absolute path to the TypeScript source
//   needles    — strings that ALL must appear in a block for it to be extracted
//   required   — fields every valid item must have (string values)
//   name       — human-readable name for error messages
//   minCount   — minimum number of items expected; fail if below this threshold
//   outFile    — output JSON filename under public/taxonomies/

const SOURCES = [
  {
    name: 'red flags',
    file: path.join(__dirname, '..', 'src/brain/mlro-red-flags-taxonomy.generated.ts'),
    needles: ['id', 'label', 'bucket'],
    required: ['id', 'label', 'bucket'],
    minCount: 10,
    outFile: 'red-flags.json',
  },
  {
    name: 'capabilities',
    file: path.join(__dirname, '..', 'src/brain/mlro-capabilities.generated.ts'),
    needles: ['id', 'label', 'bucket'],
    required: ['id', 'label', 'bucket'],
    minCount: 5,
    outFile: 'capabilities.json',
  },
];

// ── Extraction ────────────────────────────────────────────────────────────────

function readItems(src, needles, requiredFields, sourceName) {
  const out = [];
  let skipped = 0;
  let parseErrors = 0;
  const re = /\{[^{}]*\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const blk = m[0];
    if (!needles.every((n) => blk.includes(n))) continue;
    let parsed;
    try {
      const json = blk
        .replace(/(\b[a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '"$1":')
        .replace(/'/g, '"')
        .replace(/,\s*\}/g, '}');
      parsed = JSON.parse(json);
    } catch {
      parseErrors++;
      continue;
    }
    // Validate required fields — skip items missing any mandatory key.
    const missing = requiredFields.filter(
      (f) => parsed[f] === undefined || parsed[f] === null || String(parsed[f]).trim() === '',
    );
    if (missing.length > 0) {
      skipped++;
      continue;
    }
    out.push(parsed);
  }
  if (parseErrors > 0) {
    process.stderr.write(
      `[export-taxonomies] WARNING: ${sourceName} — ${parseErrors} block(s) failed JSON parse and were skipped\n`,
    );
  }
  if (skipped > 0) {
    process.stderr.write(
      `[export-taxonomies] WARNING: ${sourceName} — ${skipped} block(s) missing required fields (${requiredFields.join(', ')}) and were skipped\n`,
    );
  }
  return out;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const outDir = path.join(__dirname, '..', 'public', 'taxonomies');
fs.mkdirSync(outDir, { recursive: true });

let overallOk = true;

for (const source of SOURCES) {
  // 1. Source file must exist before attempting to read.
  if (!fs.existsSync(source.file)) {
    process.stderr.write(
      `[export-taxonomies] ERROR: source file not found: ${source.file}\n` +
      `  Run 'npm run build' at repo root to regenerate generated TypeScript files.\n`,
    );
    overallOk = false;
    continue;
  }

  let src;
  try {
    src = fs.readFileSync(source.file, 'utf8');
  } catch (err) {
    process.stderr.write(
      `[export-taxonomies] ERROR: failed to read ${source.file}: ${err.message}\n`,
    );
    overallOk = false;
    continue;
  }

  // 2. Extract and validate items.
  const items = readItems(src, source.needles, source.required, source.name);

  // 3. Refuse to write an empty or suspiciously small taxonomy.
  if (items.length === 0) {
    process.stderr.write(
      `[export-taxonomies] ERROR: extracted 0 ${source.name} — ` +
      `source file format may have changed. Refusing to write empty taxonomy.\n`,
    );
    overallOk = false;
    continue;
  }
  if (items.length < source.minCount) {
    process.stderr.write(
      `[export-taxonomies] ERROR: extracted only ${items.length} ${source.name} ` +
      `(minimum expected: ${source.minCount}) — ` +
      `source file format may have changed. Refusing to write.\n`,
    );
    overallOk = false;
    continue;
  }

  // 4. Write output.
  const outPath = path.join(outDir, source.outFile);
  try {
    fs.writeFileSync(outPath, JSON.stringify(items, null, 2));
  } catch (err) {
    process.stderr.write(
      `[export-taxonomies] ERROR: failed to write ${outPath}: ${err.message}\n`,
    );
    overallOk = false;
    continue;
  }

  process.stderr.write(
    `[export-taxonomies] wrote ${items.length} ${source.name} → public/taxonomies/${source.outFile}\n`,
  );
}

if (!overallOk) {
  process.stderr.write('[export-taxonomies] FAILED — one or more sources could not be exported.\n');
  process.exit(1);
}
