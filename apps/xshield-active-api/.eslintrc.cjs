// Self-contained ESLint config for apps/xshield-active-api. See sibling
// packages/ai-governance/.eslintrc.cjs for rationale.

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  env: { node: true, es2022: true },
  rules: {
    // Scaffolding package — many imports are prepped for future routes/
    // adapter slots. Warn rather than error so the lint signal stays
    // visible without blocking the build. Promote to 'error' when this
    // package goes into active feature development.
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
  },
  ignorePatterns: ['node_modules/', 'dist/', '*.config.js', '*.config.ts'],
};
