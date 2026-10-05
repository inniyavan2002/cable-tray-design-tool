import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

// Browser tests for the product website, run against the assembled
// dist-site/ folder, so run `npm run build:site` first.
export default defineConfig({
  testDir: 'tests/site',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-site' }]] : 'list',
  use: { baseURL: 'http://localhost:4174/', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview:site -- --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: !isCI,
  },
});
