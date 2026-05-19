// Self-contained ESLint config for packages/ai-governance.
// `root: true` stops walk-up to workspace root .eslintrc.json which
// lists this path in ignorePatterns and would refuse to lint our src.
// Per remaining-work doc §1.6 lint-debt cleanup.

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  env: { node: true, es2022: true },
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
  },
  ignorePatterns: ['node_modules/', 'dist/', '*.config.js', '*.config.ts'],
};
