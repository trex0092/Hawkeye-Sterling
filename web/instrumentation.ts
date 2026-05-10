// AsyncLocalStorage.snapshot() was added in Node.js 22.3.0.
// Next.js 15.5 compiled runtimes (app-page, app-route) capture
//   let eV = globalThis.AsyncLocalStorage
// at module load time, then call eV.snapshot() on every request.
//
// Polyfill strategy (three layers):
//   1. scripts/patch-als.cjs patches node-environment-baseline.js at build time
//      so snapshot is set the moment globalThis.AsyncLocalStorage is assigned.
//   2. This file patches globalThis.AsyncLocalStorage directly on server startup
//      (before the first request), covering cases where the build patch missed.
//   3. BannerPlugin in next.config.mjs patches at the top of each webpack chunk.

function applySnapshotPolyfill(cls: unknown) {
  if (cls && typeof (cls as { snapshot?: unknown }).snapshot !== 'function') {
    (cls as { snapshot: unknown }).snapshot = function snapshot() {
      return function runSnapshot(fn: (...a: unknown[]) => unknown, ...rest: unknown[]) {
        return fn(...rest)
      }
    }
  }
}

if (process.env.NEXT_RUNTIME !== 'edge') {
  // Patch globalThis.AsyncLocalStorage directly — this is the same object
  // that app-page/app-route runtimes capture as `eV` / `tz`.
  applySnapshotPolyfill((globalThis as Record<string, unknown>).AsyncLocalStorage)

  // Also patch via both require() forms in case of separate module cache entries.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    applySnapshotPolyfill((require('async_hooks') as { AsyncLocalStorage: unknown }).AsyncLocalStorage)
  } catch { /* not available in this runtime */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    applySnapshotPolyfill((require('node:async_hooks') as { AsyncLocalStorage: unknown }).AsyncLocalStorage)
  } catch { /* not available in this runtime */ }
}

export async function register() {
  // Re-apply after Next.js startup completes in case globalThis.AsyncLocalStorage
  // was set after module evaluation (defensive — should already be set by now).
  if (process.env.NEXT_RUNTIME !== 'edge') {
    applySnapshotPolyfill((globalThis as Record<string, unknown>).AsyncLocalStorage)
  }
}
