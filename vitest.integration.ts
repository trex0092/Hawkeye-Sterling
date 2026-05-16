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
    passWithNoTests: true,
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
    ],
  },
});
