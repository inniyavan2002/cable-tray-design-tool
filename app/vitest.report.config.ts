import { defineConfig, mergeConfig } from 'vitest/config';
import { createViteConfig } from './vite.config.ts';

// Runs the report generators (*.report.ts), which write Markdown into reports/.
export default mergeConfig(
  createViteConfig('test'),
  defineConfig({
    test: {
      environment: 'node',
      include: ['src/**/*.report.ts'],
      testTimeout: 30 * 60 * 1000,
    },
  }),
);
