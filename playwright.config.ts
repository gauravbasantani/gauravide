import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests against a real browser.
 *
 * These exist because unit tests cannot catch the failure that actually bit
 * us: a page that server-renders correctly but never hydrates, leaving every
 * button dead. Only a real browser clicking real buttons proves the app works.
 */
export default defineConfig({
  testDir: './e2e',
  // The full suite has its own config, servers and stand-in backend, and the
  // deployed suite visits a live URL rather than anything we start here.
  testIgnore: ['**/full/**', '**/deployed/**', '**/shots/**'],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3210',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    // Serve only. The build happens in `npm run e2e` BEFORE this starts.
    //
    // Never build here: `rm -rf .next` while another `next start` holds the
    // old chunks corrupts the build, and the symptom is a page that renders
    // but never hydrates — every button silently dead. That cost hours.
    command: 'npx next start -p 3210',
    url: 'http://localhost:3210',
    reuseExistingServer: false,
    timeout: 300_000,
    // Never write to the real database from tests. Without this, .env.local
    // pointed every test scan at production and inflated the admin numbers.
    // These tests mock the routes that need history; the full suite
    // (playwright.full.config.ts) covers the database against a stand-in.
    // Set in the process, so they win over .env.local.
    env: {
      SUPABASE_URL: '',
      SUPABASE_SERVICE_KEY: '',
    },
  },
})
