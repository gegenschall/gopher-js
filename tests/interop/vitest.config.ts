import sharedConfig from '@gopher-js/vitest-config';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: { pool: 'forks', execArgv: ['--expose-gc'] },
  }),
);
