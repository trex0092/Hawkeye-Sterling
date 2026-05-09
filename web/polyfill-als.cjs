'use strict';
// AsyncLocalStorage.snapshot() polyfill for Node.js < 22.3.
// Loaded via NODE_OPTIONS=--require before any module is evaluated.
try {
  var _als = require('async_hooks').AsyncLocalStorage;
  if (_als && typeof _als.snapshot !== 'function') {
    _als.snapshot = function snapshot() {
      return function runInSnapshot(fn) {
        return fn.apply(this, Array.prototype.slice.call(arguments, 1));
      };
    };
  }
} catch (_) {}
