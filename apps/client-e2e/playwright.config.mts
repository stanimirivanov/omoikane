import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

const baseURL = process.env['BASE_URL'] || 'http://127.0.0.1:4200';
const recordsUserGuides = process.env['OMOIKANE_E2E_MODE'] === 'user-guide';

/**
 * Runs one Chromium smoke path against the real Angular development server.
 * Supabase lifecycle and seed ownership remain outside Playwright so the same
 * documented local platform is exercised by developers and CI.
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './e2e' }),
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',
  timeout: recordsUserGuides ? 600_000 : 60_000,
  workers: 1,
  expect: {
    timeout: recordsUserGuides ? 30_000 : 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.03,
      threshold: 0.3,
    },
  },
  // Recorded scenarios mutate the shared deterministic seed. Retrying one
  // scenario without resetting that seed could document a different state.
  retries: process.env['CI'] && !recordsUserGuides ? 1 : 0,
  use: {
    baseURL,
    colorScheme: 'light',
    locale: 'en-US',
    screenshot: 'only-on-failure',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm nx serve client --host=127.0.0.1',
    url: baseURL,
    timeout: 180_000,
    reuseExistingServer: !process.env['CI'],
    cwd: workspaceRoot,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
