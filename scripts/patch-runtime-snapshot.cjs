#!/usr/bin/env node
// Patches Next.js compiled runtime files to guard against missing
// AsyncLocalStorage.snapshot() before calling it.
//
// Next.js 15.5 compiled runtimes (app-page, app-route, and turbo/experimental
// variants) contain:
//
//   runInCleanSnapshot: eV ? eV.snapshot() : function(e,...t){return e(...t)}
//
// They guard against eV being falsy, but NOT against eV.snapshot being absent.
// On Node.js < 22.3.0 (or any runtime where snapshot() was not added),
// AsyncLocalStorage IS set on globalThis (eV is truthy) but .snapshot() does
// not exist, so eV.snapshot() throws "eV.snapshot is not a function".
//
// This script widens the guard to also check typeof X.snapshot === "function"
// so the existing fallback runs instead of crashing.
//
// Run from web/ directory after npm ci, before next build.
'use strict';
const fs   = require('fs');
const path = require('path');

const RUNTIME_DIR = path.resolve(
  'node_modules/next/dist/compiled/next-server'
);

if (!fs.existsSync(RUNTIME_DIR)) {
  console.error('[patch-runtime-snapshot] Directory not found:', RUNTIME_DIR);
  process.exit(1);
}

// All prod runtime files that contain the .snapshot() call.
const files = fs.readdirSync(RUNTIME_DIR).filter(
  f => f.endsWith('.runtime.prod.js') && !f.endsWith('.map')
);

// Marker so we know a file has already been patched (idempotent).
const MARKER = '/* als-snapshot-guard */';

// Generic regex: matches <var>?<var>.snapshot() for any identifier.
// Captures the variable name so we can emit it twice.
const PATTERN = /(\b\w+)\?\1\.snapshot\(\)/g;

let patchedCount = 0;
let skippedCount = 0;
let unchangedCount = 0;

for (const file of files) {
  const filePath = path.join(RUNTIME_DIR, file);
  const original = fs.readFileSync(filePath, 'utf8');

  if (original.includes(MARKER)) {
    console.log(`[patch-runtime-snapshot] Already patched — skipping: ${file}`);
    skippedCount++;
    continue;
  }

  const patched = original.replace(
    PATTERN,
    (_, v) => `${v}&&typeof ${v}.snapshot==="function"${MARKER}?${v}.snapshot()`
  );

  if (patched === original) {
    console.log(`[patch-runtime-snapshot] No .snapshot() pattern found — skipping: ${file}`);
    unchangedCount++;
    continue;
  }

  fs.writeFileSync(filePath, patched);
  console.log(`[patch-runtime-snapshot] Patched: ${file}`);
  patchedCount++;
}

console.log(
  `[patch-runtime-snapshot] Done. patched=${patchedCount} skipped=${skippedCount} unchanged=${unchangedCount}`
);
