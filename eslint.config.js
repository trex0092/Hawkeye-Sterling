import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

// Shared rules enforced across all production TypeScript files.
// Zero console.log/debug allowed in production paths — use structured
// logging (console.warn / console.error / console.info) instead.
const SHARED_RULES = {
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
  'prefer-const': 'error',
  'eqeqeq': ['error', 'always'],
  'no-var': 'error',
};

export default [
  {
    files: ['src/**/*.ts', 'netlify/**/*.ts', 'netlify/**/*.mts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: SHARED_RULES,
  },
  {
    // CLI-only tooling — allow console.log for audit/debug output.
    files: ['src/brain/audit.ts', 'web/scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '.netlify/**', 'coverage/**', 'web/node_modules/**'],
  },
];
