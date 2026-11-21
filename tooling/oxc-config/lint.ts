import { createRequire } from 'node:module';

import { defineConfig } from 'oxlint';

export default defineConfig({
  plugins: ['typescript', 'unicorn', 'oxc'],
  jsPlugins: [
    {
      name: 'stylistic',
      specifier: createRequire(import.meta.url).resolve('@stylistic/eslint-plugin'),
    },
  ],

  rules: {
    'stylistic/list-style': [
      'error',
      {
        overrides: {
          '{}': 'off',
          '[]': 'off',
          '()': 'off',
          '<>': 'off',
          ObjectExpression: {
            singleLine: {
              maxItems: 2,
              spacing: 'always',
            },
          },
        },
      },
    ],
  },

  categories: {
    correctness: 'error',
    suspicious: 'error',
  },

  ignorePatterns: ['**/dist/**', '**/coverage/**', '**/.turbo/**'],
});
