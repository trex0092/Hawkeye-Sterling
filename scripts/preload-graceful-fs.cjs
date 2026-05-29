// Preload script: patches Node.js fs module with graceful-fs AND wraps
// fs.promises methods with a concurrency semaphore + EMFILE retry.
// Must run via --require so it executes before the main module.
//
// WHY TWO LAYERS:
//   1. Concurrency semaphore (MAX_CONCURRENT_FD=500): the output:standalone
//      trace phase opens ~3000 node_modules files concurrently via readFile,
//      spiking the fd count from ~245 to ~3246 — past the 4096 hard limit
//      on Netlify build agents. The semaphore queues excess calls so at most
//      500 fd-acquiring operations run at once (peak fds ≈ 245+500 = 745).
//   2. EMFILE retry (MAX_RETRIES=20, 50ms×attempt backoff): defence-in-depth
//      for any stray EMFILE that slips through (e.g. from open() calls whose
//      FileHandle lifetime we cannot bound from this wrapper).
//
// Guard flag fs.__emfilePatched prevents double-application if next.config.mjs
// also runs the same patch in the same process.
'use strict'
const fs = require('fs')

// 1. Patch the callback-based API via graceful-fs.
try {
  const gfs = require('graceful-fs')
  gfs.gracefulify(fs)
} catch (e) {
  // graceful-fs unavailable — callback API proceeds without retry
}

// 2. Patch fs.promises — graceful-fs 4.x only wraps the callback API.
if (!fs.__emfilePatched) {
  fs.__emfilePatched = true

  ;(function patchFsPromises() {
    // Semaphore: limit concurrent fd-acquiring calls.
    const MAX_CONCURRENT_FD = 500
    let active = 0
    const waiting = []

    function acquire() {
      return new Promise(function (resolve) {
        if (active < MAX_CONCURRENT_FD) { active++; resolve() }
        else waiting.push(resolve)
      })
    }

    function release() {
      if (waiting.length > 0) {
        waiting.shift()() // transfer slot without decrement
      } else {
        active--
      }
    }

    const MAX_RETRIES = 20
    // Methods that hold a file descriptor open for their entire duration.
    // `open` is excluded: the FileHandle it returns stays open past this
    // wrapper's scope, so releasing the semaphore on return would be wrong.
    const FD_METHODS = new Set(['readFile', 'writeFile', 'appendFile', 'copyFile'])
    const METHODS = ['open', 'writeFile', 'readFile', 'appendFile', 'copyFile',
                     'rename', 'mkdir', 'readdir', 'stat', 'lstat', 'access']

    for (var i = 0; i < METHODS.length; i++) {
      var method = METHODS[i]
      var orig = fs.promises[method]
      if (typeof orig !== 'function') continue;
      (function (m, o, limited) {
        fs.promises[m] = async function emfileRetry() {
          var args = arguments
          if (limited) await acquire()
          try {
            for (var attempt = 0; attempt <= MAX_RETRIES; attempt++) {
              try {
                return await o.apply(this, args)
              } catch (err) {
                if ((err.code === 'EMFILE' || err.code === 'ENFILE') && attempt < MAX_RETRIES) {
                  await new Promise(function (r) { setTimeout(r, 50 * (attempt + 1)) })
                  continue
                }
                throw err
              }
            }
          } finally {
            if (limited) release()
          }
        }
      })(method, orig, FD_METHODS.has(method))
    }
  })()
}
