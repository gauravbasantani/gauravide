import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { webcrypto } from 'node:crypto'
import path from 'node:path'
import { ADMIN_PASSWORD, ADMIN_USERNAME, SESSION_SECRET } from '../../playwright.full.config'

/**
 * Every screen, every real route, start to finish — signed in.
 *
 * Only Supabase and Splitwise are stand-ins (mock-backend.mjs), plus the
 * receipt reader (a paid vision API). Everything the app does with them is
 * real: sessions, ownership checks, the split math on the server, photo
 * storage, server-rendered dashboard and split page, edit, archive, delete.
 */
const MOCK = 'http://127.0.0.1:4545'
const RECEIPT = path.resolve('e2e/fixtures/receipt.jpg')

type ExpenseState = {
  id: number
  cost: string
  description: string
  group_id: number
  users: { user_id: number; paid_share: string; owed_share: string }[]
  deleted: boolean
  updates: number
}
type BackendState = {
  splits: { id: string; image_path: string | null; archived_at: string | null; expense_ids: string[]; data: Record<string, unknown> }[]
  buckets: string[]
  objects: string[]
  expenses: ExpenseState[]
  groups: { id: number; name: string }[]
  emails: { to: string[]; subject: string; text: string }[]
  calls: string[]
}

const backend = async (): Promise<BackendState> => (await fetch(`${MOCK}/__state`)).json()

/** Same format as lib/session.ts seal(): AES-GCM, key = SHA-256(secret). */
async function sealSession(session: Record<string, string>): Promise<string> {
  const enc = new TextEncoder()
  const material = await webcrypto.subtle.digest('SHA-256', enc.encode(SESSION_SECRET))
  const key = await webcrypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt'])
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const cipher = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(session)))
  return `${Buffer.from(iv).toString('base64url')}.${Buffer.from(cipher).toString('base64url')}`
}

async function signIn(context: BrowserContext) {
  await context.addCookies([
    {
      name: 'gv_session',
      value: await sealSession({ anonId: 'e2e-anon', splitwiseUserId: '101', accessToken: 'test-token' }),
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ])
}

function watchForBreakage(page: Page): string[] {
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    const text = m.text()
    // Benign: WebKit logs this when a navigation (e.g. the sign-out form post)
    // cancels Next.js's background prefetch of links; Next then does a normal
    // page load. Real failures still surface as pageerror or HTTP 5xx below.
    const cancelledPrefetch = /Failed to fetch RSC payload .* Falling back to browser navigation/.test(text)
    if (m.type() === 'error' && !cancelledPrefetch && !/favicon|Failed to load resource/.test(text)) {
      problems.push(`console: ${text}`)
    }
  })
  page.on('response', (r) => {
    if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`)
  })
  return problems
}

/** The error boundary must never appear anywhere in the journey. */
async function expectNoErrorScreen(page: Page) {
  await expect(page.getByText(/something went wrong/i)).toHaveCount(0)
}

const cents = (s: string) => Math.round(Number(s.replace(/[^0-9.-]/g, '')) * 100)

// Costco receipt: tax A on the towel, tax E on groceries. Items 38.38 + tax 1.89 = 40.27.
const COSTCO = {
  source: 'gemini',
  warnings: [],
  receipt: {
    merchant: 'Costco Wholesale',
    date: '2026-09-04',
    currency: 'USD',
    items: [
      { name: '512599 **KS TOWEL**', qty: 1, cents: 2079, taxFlag: 'A', confidence: 1 },
      { name: '1644153 HVST SNAPS', qty: 1, cents: 859, taxFlag: 'E', confidence: 1 },
      { name: '0000389361 / SNAPS', qty: 1, cents: -300, taxFlag: 'E', confidence: 1 },
      { name: 'TOMATOES', qty: 4, cents: 1200, taxFlag: 'E', confidence: 1 },
    ],
    taxLines: [
      { flag: 'A', cents: 168 },
      { flag: 'E', cents: 21 },
    ],
    subtotalCents: 3838,
    taxCents: 189,
    tipCents: 0,
    feeCents: 0,
    totalCents: 4027,
  },
}

test.beforeEach(async ({ context }) => {
  await fetch(`${MOCK}/__reset`, { method: 'POST' })
  await signIn(context)
})

test('scan → split → send → dashboard → split page → edit → archive → delete', async ({ page }) => {
  const problems = watchForBreakage(page)
  page.on('dialog', (dialog) => void dialog.accept())
  await page.route('**/api/receipt/extract', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(COSTCO) }),
  )

  /* ── Dashboard, empty ─────────────────────────────────────────────── */
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your splits' })).toBeVisible()
  await expect(page.getByText('No splits yet')).toBeVisible()
  await page.getByRole('link', { name: /split your first receipt/i }).click()

  /* ── 1. Scan ──────────────────────────────────────────────────────── */
  await expect(page.getByRole('heading', { name: /new receipt/i })).toBeVisible()
  await page.locator('input[type="file"]').last().setInputFiles(RECEIPT)
  await page.getByRole('button', { name: /read this receipt/i }).click()

  /* ── 2. Check items ───────────────────────────────────────────────── */
  await expect(page.getByRole('heading', { name: /check the items/i })).toBeVisible()
  await expect(page.getByLabel('Item 1 name')).toHaveValue('KS TOWEL')
  await expect(page.getByLabel('Item 3 name')).toHaveValue('Discount · SNAPS')
  await expect(page.getByText('Your receipt photo')).toBeVisible()
  await expect(page.getByText('✓ Adds up to the receipt total')).toBeVisible()
  await page.getByRole('button', { name: /looks right/i }).click()

  /* ── 3. Split ─────────────────────────────────────────────────────── */
  await expect(page.getByRole('heading', { name: /who’s splitting this/i })).toBeVisible()
  await expect(page.getByText('(you)')).toBeVisible() // real /api/splitwise/me
  await page.getByRole('button', { name: /add person/i }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Mayur Sabankar' }).click()

  await page.getByRole('button', { name: 'Gaurav Basantani, sharing KS TOWEL' }).click()
  await page.getByRole('button', { name: 'Mayur Sabankar, sharing HVST SNAPS' }).click()
  // The snaps discount goes to whoever had the snaps.
  await expect(page.getByText('↳ Follows HVST SNAPS')).toBeVisible()

  // Tomatoes ×4 → four lines; two shared 2 : 1, one each.
  await page.getByRole('button', { name: 'Split TOMATOES unevenly' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Split into 4 lines' }).click()
  await expect(page.getByText('TOMATOES (4 of 4)')).toBeVisible()
  await page.getByRole('button', { name: 'Split TOMATOES (1 of 4) unevenly' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByText('By shares', { exact: true }).click()
  await sheet.getByRole('button', { name: 'One more share for Gaurav Basantani' }).click()
  await sheet.getByRole('button', { name: /save split/i }).click()
  await expect(page.getByText('Gaurav ×2 · Mayur ×1')).toBeVisible()
  await page.getByRole('button', { name: 'Gaurav Basantani, sharing TOMATOES (2 of 4)' }).click()
  await page.getByRole('button', { name: 'Mayur Sabankar, sharing TOMATOES (2 of 4)' }).click()
  await page.getByRole('button', { name: 'Gaurav Basantani, sharing TOMATOES (3 of 4)' }).click()
  await page.getByRole('button', { name: 'Mayur Sabankar, sharing TOMATOES (4 of 4)' }).click()
  await expect(page.getByText('7 of 7 items assigned')).toBeVisible()
  await page.getByRole('button', { name: /next: who paid/i }).click()

  /* ── 4. Who paid, where it goes ───────────────────────────────────── */
  await expect(page.getByRole('heading', { name: /^ready$/i })).toBeVisible()
  await expect(page.getByText('✓ Matches receipt')).toBeVisible()
  await page.getByText('Several people', { exact: true }).click()
  await page.getByLabel('Gaurav Basantani paid').fill('30.00')
  await page.getByLabel('Mayur Sabankar paid').fill('10.27')
  await page.getByLabel('Mayur Sabankar paid').blur()
  await expect(page.getByText(/payments cover the \$40\.27 total/i)).toBeVisible()

  const shareTexts = await page.locator('[data-share]').allInnerTexts()
  const shownShares = shareTexts.map(cents)
  expect(shownShares.reduce((a, b) => a + b, 0)).toBe(4027)

  await page.getByRole('button', { name: /create a new group/i }).click()
  await page.getByLabel('New group name').fill('Costco run')
  await page.getByRole('button', { name: /^create group$/i }).click()
  await expect(page.getByRole('button', { name: /costco run/i })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: /^add to splitwise$/i }).click()
  await expect(page.getByRole('heading', { name: 'Added to Splitwise' })).toBeVisible()
  await expect(page.getByText(/receipt photo saved with this split/i)).toBeVisible()

  // What actually reached "Splitwise" and "Supabase".
  let state = await backend()
  expect(state.expenses).toHaveLength(1)
  const created = state.expenses[0]!
  const group = state.groups.find((g) => g.name === 'Costco run')!
  expect(created).toMatchObject({ cost: '40.27', description: 'Costco Wholesale', group_id: group.id })
  const byUser = Object.fromEntries(created.users.map((u) => [u.user_id, u]))
  expect(cents(byUser[101]!.paid_share)).toBe(3000)
  expect(cents(byUser[202]!.paid_share)).toBe(1027)
  // The server's shares equal what the confirm screen showed, to the cent.
  expect([cents(byUser[101]!.owed_share), cents(byUser[202]!.owed_share)]).toEqual(shownShares)
  expect(state.splits).toHaveLength(1)
  const saved = state.splits[0]!
  expect(saved.expense_ids).toEqual([String(created.id)])
  expect(saved.image_path).toBe(`101/${saved.id}.jpg`)
  expect(state.buckets).toEqual(['receipts'])
  expect(state.objects).toEqual([`receipts/101/${saved.id}.jpg`])

  /* ── Done → dashboard (the screen that crashed) ───────────────────── */
  await page.getByRole('button', { name: /^done$/i }).click()
  await expect(page.getByRole('heading', { name: 'Your splits' })).toBeVisible()
  await expectNoErrorScreen(page)
  const row = page.getByRole('link', { name: /costco wholesale/i })
  await expect(row).toBeVisible()
  await expect(row).toContainText('2 people paid $40.27')
  await expect(row).toContainText(/you (lent|borrowed)/)

  /* ── Split page ───────────────────────────────────────────────────── */
  await row.click()
  await expect(page.getByRole('heading', { name: 'Costco Wholesale' })).toBeVisible()
  await expectNoErrorScreen(page)
  const photo = page.getByAltText('Receipt from Costco Wholesale')
  await expect(photo).toBeVisible()
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  await expect(page.getByRole('heading', { name: 'Who paid' })).toBeVisible()
  await expect(page.getByText('Paid part of the bill')).toHaveCount(2)
  await expect(page.getByText('To settle up')).toBeVisible()
  await expect(page.getByText('You ×2 · Mayur ×1')).toBeVisible()
  // The snaps discount went to whoever had the snaps.
  await expect(page.getByRole('listitem').filter({ hasText: 'Discount · SNAPS' })).toContainText('Mayur')

  /* ── Edit: rename, and switch to one payer ────────────────────────── */
  await page.getByRole('button', { name: /edit split/i }).click()
  await expect(page.getByText(/editing “costco wholesale”/i)).toBeVisible()
  await page.getByLabel('Merchant').fill('Costco Tempe')
  await page.getByLabel('Merchant').blur()
  await page.getByRole('button', { name: /looks right/i }).click()
  await expect(page.getByText('↳ Follows HVST SNAPS')).toBeVisible()
  await page.getByRole('button', { name: /next: who paid/i }).click()
  await expect(page.getByRole('button', { name: /costco run/i })).toHaveAttribute('aria-pressed', 'true')
  await page.getByText('One person', { exact: true }).click()
  await page.getByRole('button', { name: /save changes to splitwise/i }).click()
  await expect(page.getByRole('heading', { name: 'Changes saved to Splitwise' })).toBeVisible()

  state = await backend()
  expect(state.expenses).toHaveLength(1) // updated in place, never duplicated
  expect(state.expenses[0]).toMatchObject({ id: created.id, description: 'Costco Tempe', updates: 1 })
  expect(cents(state.expenses[0]!.users.find((u) => u.user_id === 101)!.paid_share)).toBe(4027)
  expect(state.splits).toHaveLength(1)
  expect(state.calls.filter((c) => c === 'create_expense')).toHaveLength(1)

  await page.getByRole('button', { name: /^done$/i }).click()
  await expect(page.getByRole('heading', { name: 'Costco Tempe' })).toBeVisible()
  await expectNoErrorScreen(page)
  await expect(page.getByText('Paid the whole bill')).toBeVisible()
  await expect(page.getByAltText('Receipt from Costco Tempe')).toBeVisible()

  /* ── Archive and restore ──────────────────────────────────────────── */
  await page.getByRole('button', { name: /archive receipt/i }).click()
  await expect(page.getByRole('heading', { name: 'Your splits' })).toBeVisible()
  await page.getByText(/archived receipts/i).click()
  await page.getByRole('link', { name: /costco tempe/i }).click()
  await page.getByRole('button', { name: /restore to active/i }).click()
  await expect(page.getByRole('heading', { name: 'Your splits' })).toBeVisible()
  await expect(page.getByText(/archived receipts/i)).toHaveCount(0)

  /* ── Delete from Splitwise too ────────────────────────────────────── */
  await page.getByRole('link', { name: /costco tempe/i }).click()
  await page.getByRole('button', { name: /delete from splitwise too/i }).click()
  await expect(page.getByText('No splits yet')).toBeVisible()
  state = await backend()
  expect(state.expenses[0]!.deleted).toBe(true)
  expect(state.objects).toHaveLength(0) // the photo went with it

  // The row stays, redacted: the receipt is gone, the usage count is not (DB-12).
  expect(state.splits).toHaveLength(1)
  const left = state.splits[0]!.data as Record<string, unknown>
  expect(left.removedAt).toEqual(expect.any(String))
  expect(typeof left.totalCents).toBe('number')
  expect(left.hadPhoto).toBe(true)
  expect(left.merchant).toBeUndefined()
  expect(left.items).toBeUndefined()
  expect(left.owed).toBeUndefined()

  expect(problems).toEqual([])
})

test('a refresh after sending never creates a second expense', async ({ page }) => {
  const problems = watchForBreakage(page)
  await page.goto('/new')
  await page.getByRole('button', { name: 'Type it in' }).click()
  await page.getByLabel(/item 1 name/i).fill('Dinner')
  await page.getByLabel(/price of/i).fill('48.00')
  await page.getByRole('button', { name: /looks right/i }).click()
  await page.getByRole('button', { name: /add person/i }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Mayur Sabankar' }).click()
  await page.getByRole('button', { name: /everyone shares everything/i }).click()
  await page.getByRole('button', { name: /next: who paid/i }).click()
  await page.getByRole('button', { name: /^add to splitwise$/i }).click()
  await expect(page.getByRole('heading', { name: 'Added to Splitwise' })).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: /see it/i }).click()
  await expect(page.getByRole('heading', { name: 'Added to Splitwise' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^add to splitwise$/i })).toHaveCount(0)

  const state = await backend()
  expect(state.expenses).toHaveLength(1)
  expect(state.expenses[0]!.users.map((u) => [u.user_id, cents(u.owed_share)])).toEqual([
    [101, 2400],
    [202, 2400],
  ])
  expect(problems).toEqual([])
})

test('Splitwise refusing an expense shows its reason and keeps the split', async ({ page }) => {
  // A non-group expense you aren't part of: the stand-in refuses it the way Splitwise does.
  await page.goto('/new')
  await page.getByRole('button', { name: 'Type it in' }).click()
  await page.getByLabel(/item 1 name/i).fill('Their dinner')
  await page.getByLabel(/price of/i).fill('20.00')
  await page.getByRole('button', { name: /looks right/i }).click()
  await page.getByRole('button', { name: 'Remove Gaurav Basantani from this split' }).click()
  for (const name of ['Mayur Sabankar', 'Maya Patel']) {
    await page.getByRole('button', { name: /add person/i }).first().click()
    await page.getByRole('dialog').getByRole('button', { name }).click()
  }
  await page.getByRole('button', { name: /everyone shares everything/i }).click()
  await page.getByRole('button', { name: /next: who paid/i }).click()
  await page.getByRole('button', { name: /^no group/i }).click()
  await page.getByRole('button', { name: /^add to splitwise$/i }).click()
  // Next.js also renders an empty route-announcer alert; match ours by its text.
  await expect(
    page.getByRole('alert').filter({ hasText: /splitwise didn’t accept it: you must be involved/i }),
  ).toBeVisible()
  await expect(page.getByText('Your split is still here')).toBeVisible()
  expect((await backend()).expenses).toHaveLength(0)
})

test('admin sees aggregate numbers, and the pages survive a real dashboard row', async ({ page }) => {
  const problems = watchForBreakage(page)
  await page.goto('/new')
  await page.getByRole('button', { name: 'Type it in' }).click()
  await page.getByLabel(/item 1 name/i).fill('Pizza')
  await page.getByLabel(/price of/i).fill('30.00')
  await page.getByRole('button', { name: /looks right/i }).click()
  await page.getByRole('button', { name: /everyone shares everything/i }).click()
  await page.getByRole('button', { name: /next: who paid/i }).click()
  await page.getByRole('button', { name: /^no group/i }).click()
  await page.getByRole('button', { name: /^add to splitwise$/i }).click()
  await expect(page.getByRole('heading', { name: 'Added to Splitwise' })).toBeVisible()

  // The Splitwise allowlist (ADMIN_USER_IDS=101) is one way in.
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'How Gauravide is doing' })).toBeVisible()
  await expect(page.locator('[data-kpi="sent"] strong')).toHaveText('1')
  await expect(page.locator('[data-kpi="money"] strong')).toHaveText('$30.00')
  await expect(page.getByText('Pizza')).toHaveCount(0) // receipt contents never shown
  await expectNoErrorScreen(page)
  expect(problems).toEqual([])
})

test('admin signs in with a username and password and sees the numbers', async ({
  page,
  context,
  isMobile,
}) => {
  const problems = watchForBreakage(page)

  // One real split, sent as an ordinary signed-in user.
  await page.goto('/new')
  await page.getByRole('button', { name: 'Type it in' }).click()
  await page.getByLabel(/item 1 name/i).fill('Sushi')
  await page.getByLabel(/price of/i).fill('42.00')
  await page.getByRole('button', { name: /looks right/i }).click()
  await page.getByRole('button', { name: /add person/i }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Mayur Sabankar' }).click()
  await page.getByRole('button', { name: /everyone shares everything/i }).click()
  await page.getByRole('button', { name: /next: who paid/i }).click()
  await page.getByRole('button', { name: /^add to splitwise$/i }).click()
  await expect(page.getByRole('heading', { name: 'Added to Splitwise' })).toBeVisible()

  // Signed out entirely: /admin sends you to the admin sign-in.
  await context.clearCookies()
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible()

  await page.getByLabel('Username').fill(ADMIN_USERNAME)
  await page.getByLabel('Password', { exact: true }).fill('not-the-password')
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page.getByRole('alert').filter({ hasText: /don’t match/ })).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/login$/)

  await page.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: /^sign in$/i }).click()

  await expect(page.getByRole('heading', { name: 'How Gauravide is doing' })).toBeVisible()
  await expectNoErrorScreen(page)
  await expect(page.locator('[data-kpi="sent"] strong')).toHaveText('1')
  await expect(page.locator('[data-kpi="money"] strong')).toHaveText('$42.00')
  await expect(page.locator('[data-kpi="people"] strong')).toHaveText('1')
  await expect(page.locator('[data-kpi="time"]')).toContainText(/min|hours/)
  await expect(page.getByText(/involving 2 people/)).toBeVisible()
  await expect(page.getByText('Sushi')).toHaveCount(0) // never what anyone bought
  // How often, and how much it saves each person.
  await expect(page.getByRole('heading', { name: 'How often they come back' })).toBeVisible()
  await expect(page.locator('[data-kpi="weekly-active"] strong')).toHaveText('1')
  await expect(page.locator('[data-kpi="time-per-person"] dd')).toContainText(/min|hours/)
  await expect(page.getByRole('heading', { name: 'Time saved each week' })).toBeVisible()
  await expect(page.getByText(/saved per person who sent a split/)).toBeVisible()

  await page.getByRole('link', { name: 'Last 7 days' }).click()
  await expect(page.getByRole('link', { name: 'Last 7 days' })).toHaveAttribute('aria-current', 'page')
  await page.getByText('Show as a table').click()
  await expect(page.getByRole('columnheader', { name: 'Sent to Splitwise' })).toBeVisible()
  if (!isMobile) await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible()

  await page.getByRole('button', { name: /sign out of admin/i }).click()
  await expect(page).toHaveURL(/\/admin\/login$/)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login$/)
  expect(problems).toEqual([])
})

test('forgot password: the emailed link sets a new one, and it can be changed again', async ({
  page,
  context,
}) => {
  const problems = watchForBreakage(page)
  const NEW_PASSWORD = 'Reset-Password-2026'
  const NEWER_PASSWORD = 'Changed-Password-2026'

  await context.clearCookies()
  await page.goto('/admin/login')
  await page.getByRole('link', { name: /forgot your password/i }).click()
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  await expect(page.getByText(/^a\*+@example\.com$/)).toBeVisible() // masked, never in full
  await page.getByRole('button', { name: /email me a reset link/i }).click()
  await expect(page.getByText(/check a\*+@example\.com/i)).toBeVisible()

  // The link only exists in the email.
  const state = await backend()
  expect(state.emails).toHaveLength(1)
  const email = state.emails[0]!
  expect(email.to).toEqual(['admin@example.com'])
  const link = /https?:\/\/\S+\/admin\/reset\?token=\S+/.exec(email.text)?.[0]
  expect(link, 'the email must contain a reset link').toBeTruthy()

  await page.goto(link!)
  await page.getByLabel('New password', { exact: true }).fill('short')
  await expect(page.getByText('Use at least 10 characters.')).toBeVisible()
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
  await page.getByLabel('New password again').fill('something-else')
  await expect(page.getByText('Those two don’t match.')).toBeVisible()
  await page.getByLabel('New password again').fill(NEW_PASSWORD)
  await page.getByRole('button', { name: /save and sign in/i }).click()
  await expect(page.getByRole('heading', { name: 'How Gauravide is doing' })).toBeVisible()

  // The link is single use.
  await page.goto(link!)
  await page.getByLabel('New password', { exact: true }).fill('Another-Password-2026')
  await page.getByLabel('New password again').fill('Another-Password-2026')
  await page.getByRole('button', { name: /save and sign in/i }).click()
  await expect(page.getByRole('alert').filter({ hasText: /expired or was already used/i })).toBeVisible()

  // Change it again from inside, which needs the current password.
  await page.goto('/admin/password')
  await page.getByLabel('Current password').fill('not-it')
  await page.getByLabel('New password', { exact: true }).fill(NEWER_PASSWORD)
  await page.getByLabel('New password again').fill(NEWER_PASSWORD)
  await page.getByRole('button', { name: /^change password$/i }).click()
  await expect(page.getByRole('alert').filter({ hasText: /current password doesn’t match/i })).toBeVisible()

  await page.getByLabel('Current password').fill(NEW_PASSWORD)
  await page.getByLabel('New password', { exact: true }).fill(NEWER_PASSWORD)
  await page.getByLabel('New password again').fill(NEWER_PASSWORD)
  await page.getByRole('button', { name: /^change password$/i }).click()
  await expect(page.getByText('Password changed')).toBeVisible()

  // The newest password is the one that works.
  await page.getByRole('link', { name: /back to the dashboard/i }).click()
  await page.getByRole('button', { name: /sign out of admin/i }).click()
  await page.getByLabel('Username').fill(ADMIN_USERNAME)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page.getByRole('alert').filter({ hasText: /don’t match/ })).toBeVisible()
  await page.getByLabel('Password', { exact: true }).fill(NEWER_PASSWORD)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page.getByRole('heading', { name: 'How Gauravide is doing' })).toBeVisible()

  expect(problems).toEqual([])
})

test('the camera takes the photo in the app on a laptop', async ({ page, isMobile }) => {
  await page.goto('/new')
  await expect(page.getByText('Choose a file')).toBeVisible()

  if (isMobile) {
    // A phone opens its own camera app through the file input; nothing to drive here.
    await expect(page.getByText('Take a photo', { exact: true })).toBeVisible()
    return
  }

  await page.getByRole('button', { name: 'Take a photo' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: /take a photo of the receipt/i })).toBeVisible()
  await expect(dialog.getByLabel('Camera preview')).toBeVisible()
  await dialog.getByRole('button', { name: /take photo/i }).click()

  // The shot goes straight into the flow, like any other picture.
  await expect(page.getByText(/receipt ready/i)).toBeVisible()
  await expect(page.getByAltText(/preview of the receipt/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /read this receipt/i })).toBeVisible()
})

test('each step starts at the top, and a lone discount is refused', async ({ page }) => {
  await page.goto('/new')
  await page.getByRole('button', { name: 'Type it in' }).click()
  await page.getByLabel(/item 1 name/i).fill('Snaps')
  await page.getByLabel(/price of/i).fill('13.00')
  await page.getByRole('button', { name: /add item/i }).click()
  await page.getByLabel(/item 2 name/i).fill('Coupon')
  await page.locator('input[aria-label^="Price of"]').nth(1).fill('-3.00')

  // Scrolled to the bottom of the items step, then moved on.
  // scrollTo, not mouse.wheel: mobile WebKit has no wheel.
  await page.evaluate(() => window.scrollTo(0, 2000))
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  await page.getByRole('button', { name: /looks right/i }).click()
  await expect(page.getByRole('heading', { name: /who’s splitting this/i })).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  // A discount given to someone who didn't have the item would owe them money.
  await page.getByRole('button', { name: /add person/i }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Mayur Sabankar' }).click()
  await page.getByRole('button', { name: 'Gaurav Basantani, sharing Snaps' }).click()
  await page.getByRole('button', { name: 'Mayur Sabankar, sharing Coupon' }).click()
  const next = page.getByRole('button', { name: /next: who paid/i })
  await expect(next).toBeDisabled()
  await expect(page.getByText(/owing less than nothing/i)).toBeVisible()

  // Sharing the discount with the item it belongs to fixes it.
  await page.getByRole('button', { name: 'Mayur Sabankar, sharing Snaps' }).click()
  await page.getByRole('button', { name: 'Gaurav Basantani, sharing Coupon' }).click()
  await expect(next).toBeEnabled()
})

test('a change made in Splitwise can be found, pulled, or overwritten', async ({ page }) => {
  const problems = watchForBreakage(page)

  // Send a split, then change it "in Splitwise" the way another client would.
  await page.goto('/new')
  await page.getByRole('button', { name: 'Type it in' }).click()
  await page.getByLabel(/item 1 name/i).fill('Groceries')
  await page.getByLabel(/price of/i).fill('40.00')
  await page.getByLabel('Merchant').fill('Groceries')
  await page.getByLabel('Merchant').blur()
  await page.getByRole('button', { name: /looks right/i }).click()
  await page.getByRole('button', { name: /add person/i }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Mayur Sabankar' }).click()
  await page.getByRole('button', { name: /everyone shares everything/i }).click()
  await page.getByRole('button', { name: /next: who paid/i }).click()
  await expect(page.locator('[data-quota]')).toContainText(/sent this hour|no expenses sent/i)
  await page.getByRole('button', { name: /^add to splitwise$/i }).click()
  await expect(page.getByRole('heading', { name: 'Added to Splitwise' })).toBeVisible()
  await page.getByRole('button', { name: /^done$/i }).click()

  const before = await backend()
  const expense = before.expenses[0]!
  await fetch(`${MOCK}/__edit-expense`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: expense.id,
      patch: {
        cost: '50.00',
        users: [
          { user_id: 101, paid_share: '50.00', owed_share: '30.00' },
          { user_id: 202, paid_share: '0.00', owed_share: '20.00' },
        ],
      },
    }),
  })

  await page.getByRole('link', { name: /groceries/i }).click()
  await page.getByRole('button', { name: /check splitwise/i }).click()
  await expect(page.getByText('Splitwise has a different version')).toBeVisible()
  await expect(page.getByRole('cell', { name: '$40.00' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '$50.00' })).toBeVisible()

  // Take their version: totals update, and the item list is flagged.
  await page.getByRole('button', { name: /use splitwise’s version/i }).click()
  await expect(page.getByText(/updated from splitwise/i)).toBeVisible()
  await expect(page.getByText('$50.00').first()).toBeVisible()
  await expect(page.getByText(/item breakdown below may not add up/i)).toBeVisible()

  // Push ours back: Splitwise ends up matching this page, still one expense.
  await page.getByRole('button', { name: /check splitwise/i }).click()
  await expect(page.getByText(/splitwise matches this page/i)).toBeVisible()

  // And a deletion over there is recognised rather than silently ignored.
  await fetch(`${MOCK}/api/v3.0/delete_expense/${expense.id}`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
  })
  await page.getByRole('button', { name: /check splitwise/i }).click()
  await expect(page.getByText(/no longer exists in splitwise/i)).toBeVisible()

  const after = await backend()
  expect(after.expenses).toHaveLength(1)
  expect(problems).toEqual([])
})
