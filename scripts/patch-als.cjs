#!/usr/bin/env node
// Patches node-environment-baseline.js (Next.js) to polyfill
// AsyncLocalStorage.snapshot() before globalThis.AsyncLocalStorage is set.
//
// AsyncLocalStorage.snapshot() is a static method added in Node.js 22.3.0.
// Next.js 15.5 compiled runtimes (app-page, app-route) capture
//   let eV = globalThis.AsyncLocalStorage
// at module load time and then call eV.snapshot() per request.
//
// Patching node-environment-baseline.js ensures snapshot is on the class
// at the exact moment globalThis.AsyncLocalStorage is assigned — before
// any compiled runtime has a chance to read it.
//
// Run from the web/ directory after npm ci, before next build.
'use strict'
const fs   = require('fs')
const path = require('path')

const file = path.resolve('node_modules/next/dist/server/node-environment-baseline.js')

if (!fs.existsSync(file)) {
  console.error('[patch-als] File not found:', file)
  process.exit(1)
}

const original = fs.readFileSync(file, 'utf8')

if (original.includes('/* als-snapshot-polyfill */')) {
  console.log('[patch-als] Already patched — skipping.')
  process.exit(0)
}

// The line we want to insert BEFORE:
//   globalThis.AsyncLocalStorage = AsyncLocalStorage;
const TARGET = '    globalThis.AsyncLocalStorage = AsyncLocalStorage;\n}'

const POLYFILL = `    if (typeof AsyncLocalStorage.snapshot !== 'function') {
        // AsyncLocalStorage.snapshot() was added in Node.js 22.3.0.
        // Polyfill for older runtimes so Next.js 15.5 compiled pages work.
        /* als-snapshot-polyfill */
        AsyncLocalStorage.snapshot = function snapshot() {
            return function runSnapshot(fn) {
                var args = Array.prototype.slice.call(arguments, 1);
                return fn.apply(this, args);
            };
        };
    }
    globalThis.AsyncLocalStorage = AsyncLocalStorage;\n}`

const patched = original.replace(TARGET, POLYFILL)

if (patched === original) {
  console.error('[patch-als] Pattern not found — cannot patch.')
  console.error('Expected to find:', JSON.stringify(TARGET))
  console.error('File content:\n', original)
  process.exit(1)
}

fs.writeFileSync(file, patched)
console.log('[patch-als] Patched node-environment-baseline.js with AsyncLocalStorage.snapshot polyfill.')
