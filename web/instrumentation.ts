export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // AsyncLocalStorage.snapshot() static method was added in Node.js 22.3.0.
    // Next.js 15.5+ calls it at app-page runtime module evaluation time.
    // If the function runtime is an older 22.x release, every page returns
    // HTTP 500 with "a3.snapshot is not a function".
    // This polyfill runs before any route is handled, so the static method
    // is present when the app-page runtime module first evaluates.
    const { AsyncLocalStorage } = await import('node:async_hooks')
    if (typeof (AsyncLocalStorage as any).snapshot !== 'function') {
      ;(AsyncLocalStorage as any).snapshot = function () {
        return function (fn: (...args: unknown[]) => unknown, ...args: unknown[]) {
          return fn(...args)
        }
      }
      // globalThis.AsyncLocalStorage is the same object reference, so
      // patching the class also patches the global — but belt-and-suspenders:
      const g = globalThis as any
      if (g.AsyncLocalStorage && typeof g.AsyncLocalStorage.snapshot !== 'function') {
        g.AsyncLocalStorage.snapshot = (AsyncLocalStorage as any).snapshot
      }
    }
  }
}
