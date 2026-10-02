import { defineConfig } from '@playwright/test'
import { randomBytes, scryptSync } from 'node:crypto'

/**
 * Portfolio screenshots, captured against the stand-in backend.
 *
 * Deliberately NOT the production database and never the vision API: every
 * person, place and price on screen is sample data, and reader results are
 * mocked from the fixtures. Its own ports, so it can run beside the suites.
 */
const MOCK = 'http://127.0.0.1:4546'
const APP = 'http://localhost:3215'
export const SESSION_SECRET = 'shots-only-session-secret-not-used-anywhere-real'
export const ADMIN_USERNAME = 'shots-admin'
export const ADMIN_PASSWORD = 'shots-Admin-Password-2026'

const salt = randomBytes(16)
const ADMIN_PASSWORD_HASH = [
  'scrypt',
  2 ** 15,
  8,
  1,
  salt.toString('base64url'),
  scryptSync(ADMIN_PASSWORD, salt, 64, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('base64url'),
].join(':')

/** Sample people only. "You" is the signed-in account. */
const IDENTITIES = {
  me: { id: 101, first_name: 'You', last_name: '', email: 'you@example.com' },
  friends: [
    { id: 202, first_name: 'Alex', last_name: '', email: 'alex@example.com' },
    { id: 303, first_name: 'Sam', last_name: '', email: 'sam@example.com' },
  ],
}

export const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
}

export default defineConfig({
  testDir: './e2e/shots',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  // Short, so a wrong selector surfaces in seconds instead of burning three
  // minutes per failure. Nothing here legitimately takes longer.
  timeout: 45_000,
  expect: { timeout: 6_000 },
  use: {
    baseURL: APP,
    // Light mode, retina, no animation flicker.
    colorScheme: 'light',
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'phone', use: { viewport: VIEWPORTS.phone, isMobile: false, hasTouch: true } },
    { name: 'tablet', use: { viewport: VIEWPORTS.tablet, hasTouch: true } },
    { name: 'desktop', use: { viewport: VIEWPORTS.desktop } },
  ],
  webServer: [
    {
      command: 'node e2e/full/mock-backend.mjs',
      url: `${MOCK}/__health`,
      reuseExistingServer: true,
      timeout: 30_000,
      env: { MOCK_PORT: '4546', MOCK_IDENTITIES: JSON.stringify(IDENTITIES) },
    },
    {
      command: 'npx next start -p 3215',
      url: APP,
      reuseExistingServer: true,
      timeout: 300_000,
      env: {
        SUPABASE_URL: MOCK,
        SUPABASE_SERVICE_KEY: 'shots-service-key',
        SPLITWISE_API_URL: `${MOCK}/api/v3.0`,
        SPLITWISE_CLIENT_ID: 'shots-client',
        SPLITWISE_CLIENT_SECRET: 'shots-secret',
        SESSION_SECRET,
        ADMIN_USER_IDS: '101',
        ADMIN_USERNAME,
        ADMIN_PASSWORD_HASH,
        RESEND_API_KEY: '',
        ADMIN_EMAIL: 'admin@example.com',
        APP_URL: APP,
        // Never spend vision quota for a screenshot.
        GEMINI_API_KEY: '',
        OCRSPACE_API_KEY: '',
      },
    },
  ],
})
