// AsyncLocalStorage.snapshot() was added in Node.js 22.3.0.
// Next.js 15.5+ calls it synchronously during app-page runtime module
// evaluation — before register() is awaited. The polyfill must therefore
// run at module-load time (top-level), not inside the async register().
// Next.js compiles instrumentation.ts to CJS for the Node.js runtime,
// so require() is available here even though the file uses ESM exports.
if (
  typeof process !== 'undefined' &&
  process.env.NEXT_RUNTIME === 'nodejs'
) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AsyncLocalStorage } = require('node:async_hooks') as typeof import('node:async_hooks')
    if (typeof (AsyncLocalStorage as any).snapshot !== 'function') {
      ;(AsyncLocalStorage as any).snapshot = function () {
        return function (fn: (...args: unknown[]) => unknown, ...args: unknown[]) {
          return fn(...args)
        }
      }
    }
  } catch {
    // async_hooks not available in this runtime — skip
  }
}

export async function register() {}
