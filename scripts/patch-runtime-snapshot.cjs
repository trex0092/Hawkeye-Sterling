#!/usr/bin/env node
// Patches all Next.js files that call AsyncLocalStorage.snapshot() without
// checking if the method exists, causing crashes on Node.js < 22.3.0 or
// in any environment where the polyfill hasn't run yet.
//
// Two vulnerable patterns exist in two locations:
//
// 1. Compiled runtimes (next/dist/compiled/next-server/*.runtime.prod.js):
//      runInCleanSnapshot: eV ? eV.snapshot() : function(e,...t){return e(...t)}
//    Variable name varies (eV, tz, etc.) — matched by regex.
//
// 2. Source server files (next/dist/server/app-render/async-local-storage.js
//    and its esm counterpart):
//      function createSnapshot() {
//          if (maybeGlobalAsyncLocalStorage) {
//              return maybeGlobalAsyncLocalStorage.snapshot();  // <-- crashes
//          }
//          ...
//      }
//    Used directly by the Netlify Lambda via getRequestHandlers().
//
// Both patterns are patched to add typeof X.snapshot === "function" guard so
// the existing fallback runs instead of throwing.
//
// Run from web/ directory after npm ci, before next build.
'use strict';
const fs   = require('fs');
const path = require('path');

const MARKER = '/* als-snapshot-guard */';

let patchedCount = 0;
let skippedCount = 0;
let unchangedCount = 0;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Compiled runtimes: generic regex for "var?var.snapshot()" pattern
// ─────────────────────────────────────────────────────────────────────────────
const RUNTIME_DIR = path.resolve('node_modules/next/dist/compiled/next-server');

if (!fs.existsSync(RUNTIME_DIR)) {
  console.error('[patch-runtime-snapshot] Directory not found:', RUNTIME_DIR);
  process.exit(1);
}

const runtimeFiles = fs.readdirSync(RUNTIME_DIR).filter(
  f => f.endsWith('.runtime.prod.js') && !f.endsWith('.map')
);

const RUNTIME_PATTERN = /(\b\w+)\?\1\.snapshot\(\)/g;

for (const file of runtimeFiles) {
  const filePath = path.join(RUNTIME_DIR, file);
  const original = fs.readFileSync(filePath, 'utf8');

  if (original.includes(MARKER)) {
    console.log(`[patch-runtime-snapshot] Already patched — skipping: ${file}`);
    skippedCount++;
    continue;
  }

  const patched = original.replace(
    RUNTIME_PATTERN,
    (_, v) => `${v}&&typeof ${v}.snapshot==="function"${MARKER}?${v}.snapshot()`
  );

  if (patched === original) {
    console.log(`[patch-runtime-snapshot] No pattern found — skipping: ${file}`);
    unchangedCount++;
    continue;
  }

  fs.writeFileSync(filePath, patched);
  console.log(`[patch-runtime-snapshot] Patched compiled runtime: ${file}`);
  patchedCount++;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Source server files: async-local-storage.js (CJS + ESM variants)
//    Patch: maybeGlobalAsyncLocalStorage.snapshot()
//    to:    (typeof maybeGlobalAsyncLocalStorage.snapshot==="function"
//              ? maybeGlobalAsyncLocalStorage.snapshot()
//              : function(fn,...args){return fn(...args);})
// ─────────────────────────────────────────────────────────────────────────────
const SOURCE_FILES = [
  'node_modules/next/dist/server/app-render/async-local-storage.js',
  'node_modules/next/dist/esm/server/app-render/async-local-storage.js',
];

// Match the exact pattern: maybeGlobalAsyncLocalStorage.snapshot()
// inside createSnapshot(), guarded by "if (maybeGlobalAsyncLocalStorage)"
const SOURCE_TARGET = 'return maybeGlobalAsyncLocalStorage.snapshot();';
const SOURCE_REPLACEMENT =
  `return (typeof maybeGlobalAsyncLocalStorage.snapshot === "function"${MARKER}` +
  ` ? maybeGlobalAsyncLocalStorage.snapshot()` +
  ` : function(fn, ...args) { return fn(...args); })();`;

for (const relPath of SOURCE_FILES) {
  const filePath = path.resolve(relPath);
  if (!fs.existsSync(filePath)) {
    console.log(`[patch-runtime-snapshot] Not found — skipping: ${relPath}`);
    unchangedCount++;
    continue;
  }

  const original = fs.readFileSync(filePath, 'utf8');

  if (original.includes(MARKER)) {
    console.log(`[patch-runtime-snapshot] Already patched — skipping: ${relPath}`);
    skippedCount++;
    continue;
  }

  if (!original.includes(SOURCE_TARGET)) {
    console.log(`[patch-runtime-snapshot] Pattern not found — skipping: ${relPath}`);
    unchangedCount++;
    continue;
  }

  const patched = original.replace(SOURCE_TARGET, SOURCE_REPLACEMENT);
  fs.writeFileSync(filePath, patched);
  console.log(`[patch-runtime-snapshot] Patched source file: ${relPath}`);
  patchedCount++;
}

console.log(
  `[patch-runtime-snapshot] Done. patched=${patchedCount} skipped=${skippedCount} unchanged=${unchangedCount}`
);
