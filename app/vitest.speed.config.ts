import { defineConfig, mergeConfig } from 'vitest/config';
import { createViteConfig } from './vite.config.ts';

// Speed tests (*.speed.test.ts) run on their own, one file at a time, so
// other tests running in parallel cannot slow them down.
export default mergeConfig(
  createViteConfig('test'),
  defineConfig({
    test: {
      environment: 'node',
      include: ['src/**/*.speed.test.ts'],
      fileParallelism: false,
    },
  }),
);
