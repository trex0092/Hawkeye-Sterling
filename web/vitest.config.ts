import { defineConfig } from "vitest/config";
import path from "node:path";

// Standalone web-tree test runner.
//
// The root vitest.config.ts already picks up web/lib/**/__tests__ so that
// `npm test` at the repo root exercises these suites. This config exists so
// the web package is self-contained: `cd web && npm test` resolves the same
// TypeScript path aliases declared in web/tsconfig.json without depending on
// the root toolchain.
//
// Aliases mirror web/tsconfig.json `paths` exactly:
//   @/*            -> web/*            (server + lib helpers, intelligence)
//   @brain/*       -> ../src/brain/*   (compiled-from-source brain modules)
//   @integrations/* -> ../src/integrations/*
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["lib/**/__tests__/**/*.test.ts"],
    testTimeout: 10000,
    // Refuse to silently pass when the include glob matches nothing — a typo
    // or accidental deletion of tests must fail CI, not register as green.
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      exclude: [
        "**/node_modules/**",
        "**/__tests__/**",
        "**/*.test.ts",
        "**/*.d.ts",
        ".next/**",
        "coverage/**",
      ],
    },
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    alias: [
      // Strip trailing `.js` from `@brain/...` / `@integrations/...` specifiers
      // (NodeNext source uses `.js` extensions pointing at `.ts` files).
      { find: /^@brain\/(.+?)(?:\.js)?$/, replacement: path.resolve(__dirname, "../src/brain/$1") },
      { find: /^@integrations\/(.+?)(?:\.js)?$/, replacement: path.resolve(__dirname, "../src/integrations/$1") },
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, "$1") },
    ],
  },
});
