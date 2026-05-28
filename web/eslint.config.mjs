import nextPlugin from '@next/eslint-plugin-next';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default [
  // Suppress unused-disable-directive warnings (behaviour matches old next lint / ESLint 8)
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  // Next.js-specific rules (@next/next/*)
  nextPlugin.configs['core-web-vitals'],
  // Only the two react-hooks rules enforced by the old eslint-config-next
  {
    plugins: {
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // TypeScript + general rules for all .ts/.tsx files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'eqeqeq': ['error', 'always', { 'null': 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-duplicate-imports': 'error',
      'no-self-compare': 'error',
      'no-unreachable': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-loss-of-precision': 'error',
      'no-throw-literal': 'error',
      'no-return-assign': 'error',
      'no-sequences': 'error',
      'radix': 'error',
      'no-console': ['error', { 'allow': ['warn', 'error', 'info'] }],
      'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_', 'caughtErrorsIgnorePattern': '^_' }],
    },
  },
  {
    files: ['app/mlro-advisor/page.tsx'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
];
