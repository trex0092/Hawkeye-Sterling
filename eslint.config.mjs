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
    // Add TypeScript parser so these files are parsed correctly.
    files: ['src/brain/audit.ts', 'web/scripts/**/*.ts', 'src/ingestion/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Brain mode files and generated taxonomy files use non-null assertions (!)
    // as intentional invariants — these are well-tested (2500+ tests) and the
    // assertions encode algorithmic guarantees the type system can't express.
    // Generated files use Map.get(knownKey)! where the key is guaranteed present
    // by construction. Suppress the warning here so legitimate violations elsewhere
    // stay visible.
    files: ['src/brain/modes/**/*.ts', 'src/brain/*.generated.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.netlify/**',
      'coverage/**',
      'web/node_modules/**',
      // Next.js build output — generated JS is not subject to our lint rules.
      'web/.next/**',
    ],
  },
];
