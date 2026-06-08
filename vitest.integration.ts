import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Separate vitest config for web API integration tests.
// These tests import Next.js route handlers directly (no HTTP server),
// mock external dependencies (Netlify Blobs, crypto providers, etc.),
// and call the exported handler functions with synthetic Request objects.
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/__integration__/**/*.test.ts'],
    // TEST-09: same rationale as vitest.config.ts — a typo'd include pattern
    // or accidental deletion should fail loudly, not pass silently.
    passWithNoTests: false,
    // The brain (481 TypeScript files) is lazily loaded via a dynamic import()
    // inside loadBrain() on the first happy-path screening request. On
    // CI runners Vite's transform pipeline takes ~40s to process all 481
    // files vs ~2s locally. Once loaded _brain is a module-level singleton
    // so only the first test in a run pays this cost. 120 s gives 3× headroom.
    testTimeout: 120_000,
    // Use forked processes instead of worker threads so that audit-chain retry
    // setTimeout callbacks draining after a test completes do not trigger
    // EnvironmentTeardownError ("Closing rpc while onUserConsoleLog was pending").
    // Worker-thread RPC tears down before pending console.log calls finish;
    // a forked process exits cleanly without an open RPC channel.
    pool: 'forks',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    alias: [
      // Rewrite `.js` imports to resolve against `.ts` sources (NodeNext convention).
      { find: /^(\.{1,2}\/.*)\.js$/, replacement: '$1' },
      // Map the @/ alias used in web/* routes to the web directory.
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, 'web/$1') },
      // Map @brain/* used by some routes.
      { find: /^@brain\/(.*)$/, replacement: path.resolve(__dirname, 'dist/src/brain/$1') },
      // Resolve next/server from web/node_modules (Next.js is only installed there).
      { find: 'next/server', replacement: path.resolve(__dirname, 'web/node_modules/next/server.js') },
      { find: 'next/headers', replacement: path.resolve(__dirname, 'web/node_modules/next/headers.js') },
      // Pin @netlify/blobs to the root copy so vi.mock('@netlify/blobs') intercepts
      // both test-file imports and the dynamic import() inside route handlers (which
      // otherwise resolve to web/node_modules/@netlify/blobs — a different module ID
      // that the mock doesn't cover).
      { find: '@netlify/blobs', replacement: path.resolve(__dirname, 'node_modules/@netlify/blobs') },
    ],
  },
});
