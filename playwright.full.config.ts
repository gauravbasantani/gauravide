import { defineConfig, devices } from '@playwright/test'

/**
 * The FULL end-to-end suite: a real browser against the real app, where every
 * API route and server page runs for real, and only the outside world
 * (Supabase, Splitwise) is replaced by e2e/full/mock-backend.mjs.
 *
 * The regular suite (playwright.config.ts) mocks routes in the browser, so it
 * never renders the signed-in dashboard or split page on the server — which
 * is exactly where "Something went wrong" after Done hid. This suite does.
 *
 * Requires a build first: `npm run build && npm run e2e:full`.
 */
const MOCK = 'http://127.0.0.1:4545'
export const SESSION_SECRET = 'e2e-only-session-secret-not-used-anywhere-real'

export default defineConfig({
  testDir: './e2e/full',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:3211',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
  webServer: [
    {
      command: 'node e2e/full/mock-backend.mjs',
      url: `${MOCK}/__health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npx next start -p 3211',
      url: 'http://localhost:3211',
      reuseExistingServer: false,
      timeout: 300_000,
      // Set in the process, so they win over .env.local (Next never overrides
      // variables that already exist). Nothing here touches a real service.
      env: {
        SUPABASE_URL: MOCK,
        SUPABASE_SERVICE_KEY: 'e2e-service-key',
        SPLITWISE_API_URL: `${MOCK}/api/v3.0`,
        SPLITWISE_CLIENT_ID: 'e2e-client',
        SPLITWISE_CLIENT_SECRET: 'e2e-secret',
        SESSION_SECRET,
        ADMIN_USER_IDS: '101',
        APP_URL: 'http://localhost:3211',
        GEMINI_API_KEY: '',
        OCRSPACE_API_KEY: '',
      },
    },
  ],
})
