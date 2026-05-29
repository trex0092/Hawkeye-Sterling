// Preload script: patches Node.js fs module with graceful-fs BEFORE
// Next.js or webpack cache any fs function references. Must run via
// --require so it executes before the main module.
try {
  const gfs = require('graceful-fs');
  gfs.gracefulify(require('fs'));
} catch (e) {
  // graceful-fs unavailable — build proceeds without EMFILE retry logic
}
