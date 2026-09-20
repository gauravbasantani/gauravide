import { defineConfig, devices } from '@playwright/test'

/**
 * The deployed site, in a real browser. No webServer: this config never
 * builds or starts anything, it only visits a URL that is already live.
 *
 *   DEPLOY_URL=https://example.vercel.app npx playwright test -c playwright.deployed.config.ts
 *
 * Extraction is mocked in the browser here on purpose. A real call would
 * spend shared vision-API quota and write a receipt_extracted row to the
 * production analytics table — tests must not inflate the admin numbers.
 */
export default defineConfig({
  testDir: './e2e/deployed',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 1, // one retry: the public internet is not a localhost
  workers: 1,
  reporter: [['list']],
  timeout: 90_000,
  use: {
    baseURL: process.env.DEPLOY_URL ?? 'https://gauravide.vercel.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
})
