const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  ...expoConfig,
  { ignores: ['legacy-source/**', '.expo/**'] },
  {
    rules: {
      // Both T[] and Array<T> are valid TypeScript. This is style-only, not a quality gate.
      '@typescript-eslint/array-type': 'off',
    },
  },
  {
    files: ['src/services/accounting-service.ts'],
    rules: {
      // Reserved row snapshots for the upcoming edit/void parity layer.
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^(DocDb|LineDb)$' }],
    },
  },
]);
