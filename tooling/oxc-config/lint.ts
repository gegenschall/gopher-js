import { defineConfig } from 'oxlint';

export default defineConfig({
  plugins: ['typescript', 'unicorn', 'oxc'],
  categories: { correctness: 'error', suspicious: 'error' },

  overrides: [
    {
      files: ['packages/{client,core,server}/src/index.ts'],
      rules: { 'unicorn/no-empty-file': 'off' },
    },
  ],

  ignorePatterns: ['**/dist/**', '**/coverage/**', '**/.turbo/**'],
});
