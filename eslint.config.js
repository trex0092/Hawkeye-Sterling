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
  // Additional strict rules
  'no-duplicate-imports': 'error',
  'no-self-compare': 'error',
  'no-unreachable': 'error',
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-loss-of-precision': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  'no-throw-literal': 'error',
  'no-return-assign': 'error',
  'no-sequences': 'error',
  'no-useless-concat': 'error',
  'radix': 'error',
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-non-null-assertion': 'warn',
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
    // Test files — relax some production rules
    files: ['src/**/__tests__/**/*.ts', 'src/**/*.test.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // CLI-only tooling — allow console.log for audit/debug output.
    files: ['src/brain/audit.ts', 'web/scripts/**/*.ts', 'src/ingestion/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '.netlify/**', 'coverage/**', 'web/node_modules/**'],
  },
];
