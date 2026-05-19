import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

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
      // Web-tree unit tests — both pure helpers (relative imports only) and
      // server helpers that use @/ path aliases (resolved below).
      'web/lib/**/__tests__/**/*.test.ts',
    ],
    exclude: ['src/__integration__/**'],
    passWithNoTests: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    alias: [
      // Rewrite `.js` imports to resolve against `.ts` sources.
      { find: /^(\.{1,2}\/.*)\.js$/, replacement: '$1' },
      // Next.js @/ path alias — maps to web/ directory.
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, 'web', '$1') },
      // @brain/* alias — maps to compiled dist output.
      { find: /^@brain\/(.*)$/, replacement: path.resolve(__dirname, 'dist', 'src', 'brain', '$1') },
    ],
  },
});
