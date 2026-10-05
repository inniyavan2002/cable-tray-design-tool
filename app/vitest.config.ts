import { defineConfig, mergeConfig } from 'vitest/config';
import { createViteConfig } from './vite.config.ts';

export default mergeConfig(
  createViteConfig('test'),
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'site/**/*.test.ts'],
      // Timing-sensitive; run separately with `npm run test:speed`.
      exclude: ['src/**/*.speed.test.ts'],
    },
  }),
);
