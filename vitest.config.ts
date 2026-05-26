import { defineConfig } from 'vitest/config';
import path from 'path';

// Hawkeye Sterling uses NodeNext module resolution with `.js` extensions
// pointing to `.ts` source files. Vitest needs to resolve those extensions
// when running tests under src/**/__tests__.
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: [
      'src/**/__tests__/**/*.test.ts',
      'src/**/*.test.ts',
      // Web-tree unit tests for pure helpers (escalation policy, audit chain
      // verifiers, etc.) that use only relative imports. Tests requiring
      // Next.js path-alias resolution (`@/...`) cannot run from this config.
      'web/lib/**/__tests__/**/*.test.ts',
    ],
    // Exclude web API integration tests — they need Next.js path aliases and
    // are run separately with:  vitest run --config vitest.integration.ts
    exclude: ['src/__integration__/**'],
    passWithNoTests: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    // Rewrite `.js` imports to resolve against `.ts` sources.
    alias: [
      { find: /^(\.{1,2}\/.*)\.js$/, replacement: '$1' },
      // Provide a lightweight NextResponse shim so web/lib tests that import
      // validate.ts (which uses next/server) run without the Next.js runtime.
      { find: 'next/server', replacement: path.resolve(__dirname, 'src/__mocks__/next-server.ts') },
      // Resolve Next.js path alias `@/` → web/ so src/__tests__ can import web API routes.
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, 'web/$1') },
      // Resolve @brain/* → src/brain/* (strips trailing .js extension for NodeNext compat).
      { find: /^@brain\/(.+?)(?:\.js)?$/, replacement: path.resolve(__dirname, 'src/brain/$1') },
    ],
  },
});
