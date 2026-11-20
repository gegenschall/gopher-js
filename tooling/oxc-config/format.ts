import { defineConfig } from 'oxfmt';

export default defineConfig({
  semi: true,
  singleQuote: true,

  sortImports: true,
  sortPackageJson: true,

  ignorePatterns: ['**/dist/**', '**/coverage/**', '**/.turbo/**', 'pnpm-lock.yaml'],
});
