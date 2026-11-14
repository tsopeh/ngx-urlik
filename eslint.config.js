// @ts-check
const eslint = require('@eslint/js');
const { defineConfig, globalIgnores } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = defineConfig([
  globalIgnores(['dist/', 'coverage/', '.angular/', 'scratch/', 'test-results/']),
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      // A body without braces belongs only to the next statement. Braces make that explicit.
      curly: ['error', 'all'],
      // Types are written as aliases. An interface doesn't satisfy Record<string, unknown>.
      '@typescript-eslint/consistent-type-definitions': 'off',
      // A leading underscore marks a name that's there only to hold a place, like `infer _Q`.
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_' }],
    },
  },
  {
    // Test hosts aren't part of an app, so they don't follow its selector prefix.
    files: ['**/*.spec.ts'],
    rules: {
      '@angular-eslint/component-selector': 'off',
      '@angular-eslint/directive-selector': 'off',
    },
  },
  {
    // Type tests declare values only to check their types, and evaluate expressions for errors.
    files: ['type-tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
