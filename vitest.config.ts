import { defineConfig } from 'vitest/config';

// Hawkeye Sterling uses NodeNext module resolution with `.js` extensions
// pointing to `.ts` source files. Vitest needs to resolve those extensions
// when running tests under src/**/__tests__.
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    passWithNoTests: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    // Rewrite `.js` imports to resolve against `.ts` sources.
    alias: [
      { find: /^(\.{1,2}\/.*)\.js$/, replacement: '$1' },
    ],
  },
});
