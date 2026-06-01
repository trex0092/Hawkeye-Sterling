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
    // TEST-09: refuse to silently pass when include patterns match no files.
    // A typo in include[] or accidental deletion of test files would have
    // previously been masked by passWithNoTests:true.
    passWithNoTests: false,
    coverage: {
      // TEST-02: enable v8 coverage collection so CI emits a measurable
      // baseline. Thresholds intentionally OMITTED in this PR — a follow-up
      // will set them after the baseline is observed. Without measurement
      // we'd either set them too high (breaks CI) or too low (no signal).
      // @vitest/coverage-v8 is already installed as a devDependency.
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      exclude: [
        '**/node_modules/**',
        'dist/**',
        '**/__mocks__/**',
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.d.ts',
        'coverage/**',
        'web/.next/**',
      ],
    },
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    alias: [
      // Rewrite `.js` imports to resolve against `.ts` sources.
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
