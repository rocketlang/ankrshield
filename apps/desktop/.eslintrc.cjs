// Self-contained ESLint config for apps/desktop. `root: true` stops ESLint
// from walking up to the workspace root .eslintrc.json — which lists this
// path in its ignorePatterns and so leaves us unable to lint our own src.
// Per remaining-work doc §1.6 lint-debt cleanup.

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
    // Don't load tsconfig — the type-aware rules are slow + we already
    // run `tsc --noEmit` separately as the source of truth for types.
  },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    // Some vendored modules + test seams legitimately need `any`. Warn only.
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    // Vendored SDK code uses require() (CJS).
    '@typescript-eslint/no-var-requires': 'warn',
    'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    // `void promise` in fire-and-forget paths is intentional throughout
    // the proxy code — don't fight it.
    'no-void': 'off',
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'out/',
    '.vite/',
    '*.config.js',
    '*.config.cjs',
    '*.config.ts',
    'forge.config.js',
    'aegis-smoke-pb.mjs',
  ],
  overrides: [
    {
      files: ['src/main/aegis-proxy/**/*.ts', 'src/main/**/*.ts'],
      env: { node: true, browser: false },
    },
    {
      files: ['src/renderer/**/*.tsx', 'src/renderer/**/*.ts'],
      env: { browser: true, node: false },
    },
    {
      files: ['src/**/__tests__/**/*.ts'],
      rules: {
        // Tests legitimately introduce `any` for monkey-patches +
        // boundary mocks. Don't lint-block the suite.
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
  ],
};
