// AsyncLocalStorage.snapshot() was added in Node.js 22.3.0.
// Next.js 15.5+ calls it synchronously during app-page runtime module
// evaluation. The polyfill runs here at module-load time so it is
// guaranteed to be in place before any page is rendered.
//
// NOTE: NEXT_RUNTIME is only set to 'edge' in Edge contexts.
// In the Node.js server it is UNDEFINED — guard by excluding 'edge',
// not by checking === 'nodejs', otherwise the polyfill never runs.
if (process.env.NEXT_RUNTIME !== 'edge') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AsyncLocalStorage } = require('node:async_hooks') as typeof import('node:async_hooks')
    if (typeof (AsyncLocalStorage as any).snapshot !== 'function') {
      ;(AsyncLocalStorage as any).snapshot = function () {
        return function (fn: (...args: unknown[]) => unknown, ...args: unknown[]) {
          return fn(...args)
        }
      }
      const g = globalThis as any
      if (g.AsyncLocalStorage && typeof g.AsyncLocalStorage.snapshot !== 'function') {
        g.AsyncLocalStorage.snapshot = (AsyncLocalStorage as any).snapshot
      }
    }
  } catch {
    // async_hooks not available in this runtime — skip
  }
}

export async function register() {}
