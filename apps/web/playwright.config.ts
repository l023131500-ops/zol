import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config. Boots the production build and runs Chromium (pre-installed).
 * Includes the two guardrail tests: cookie-refusal blocks analytics, and
 * protected routes bounce to /auth/login.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'he-IL',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm build && pnpm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
