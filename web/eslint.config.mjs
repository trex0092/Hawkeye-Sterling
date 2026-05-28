import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// eslint-config-next v16 exports flat config arrays (ESLint 9+ format).
// createRequire resolves from web/ so the package lookup uses web/node_modules.
// The legacy web/.eslintrc.json is superseded by this file.
const nextConfig = require('eslint-config-next/core-web-vitals');

export default [
  ...nextConfig,
  {
    linterOptions: {
      // Many source files have eslint-disable comments for rules (no-var,
      // @typescript-eslint/no-require-imports) that eslint-config-next@16
      // no longer enforces. Suppress the "unused disable directive" warnings
      // so we don't hit max-warnings=0 on pre-existing suppress comments.
      reportUnusedDisableDirectives: "off",
    },
    settings: {
      // Prevent eslint-plugin-react from calling context.getFilename() to
      // auto-detect React version — that API was removed in ESLint 9 flat config.
      react: { version: "19.2.6" },
    },
    rules: {
      "eqeqeq": ["error", "always", { "null": "ignore" }],
      "prefer-const": "error",
      "no-var": "error",
      "no-duplicate-imports": "error",
      "no-self-compare": "error",
      "no-unreachable": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
      "no-loss-of-precision": "error",
      "no-throw-literal": "error",
      "no-return-assign": "error",
      "no-sequences": "error",
      "radix": "error",
      "no-console": ["error", { "allow": ["warn", "error", "info"] }],
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",

      // eslint-config-next@16 / React 19 added strict rules below that were
      // not present in eslint-config-next@15. Disable them to restore parity
      // with the pre-Dependabot-bump lint baseline. Enabling them is a
      // separate, deliberate migration effort.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/static-components": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      // exhaustive-deps existed in v15 as warn; keep as warn for continuity.
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["app/mlro-advisor/page.tsx"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
];
