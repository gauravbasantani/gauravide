/**
 * Portfolio screenshots.
 *
 * Runs against the stand-in backend with sample identities (You, Alex, Sam)
 * and a sample grocery receipt. Reader results are mocked from the fixture,
 * so no vision quota is spent and no real receipt, account or name appears.
 *
 *   npx playwright test -c playwright.shots.config.ts
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { webcrypto } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SESSION_SECRET } from '../../playwright.shots.config'

const OUT = path.join(os.homedir(), 'Documents', 'Portfolio', 'assets', 'gauravide-raw')
const RECEIPT_PDF = path.resolve('e2e/shots/sample-grocery-receipt.pdf')
const MOCK = 'http://127.0.0.1:4546'

/** Tablet is wanted only for these screens. */
const TABLET_SCREENS = new Set([1, 3, 5, 9])

fs.mkdirSync(OUT, { recursive: true })

/* ─────────────────────────── Sample data ─────────────────────────── */

const ITEMS = [
  { id: 'i1', name: 'Tomatoes', qty: 4, cents: 996, taxFlag: 'A', confidence: 0.98 },
  { id: 'i2', name: 'Oat milk', qty: 1, cents: 429, taxFlag: 'A', confidence: 0.97 },
  { id: 'i3', name: 'Sourdough loaf', qty: 1, cents: 550, taxFlag: 'A', confidence: 0.99 },
  { id: 'i4', name: 'Eggs, dozen', qty: 1, cents: 699, taxFlag: 'A', confidence: 0.96 },
  { id: 'i5', name: 'Bananas', qty: 1, cents: 215, taxFlag: 'A', confidence: 0.94 },
  { id: 'i6', name: 'Detergent', qty: 1, cents: 1299, taxFlag: 'B', confidence: 0.98 },
  { id: 'i7', name: 'Paper towels', qty: 1, cents: 849, taxFlag: 'B', confidence: 0.92 },
]

function sampleReceipt(over: Record<string, unknown> = {}) {
  return {
    merchant: 'Grocery run',
    date: '2026-09-14',
    currency: 'USD',
    items: ITEMS,
    taxLines: [
      { flag: 'A', cents: 72 },
      { flag: 'B', cents: 183 },
    ],
    subtotalCents: 5037,
    taxCents: 255,
    tipCents: 0,
    feeCents: 0,
    totalCents: 5292,
    ...over,
  }
}

/* ─────────────────────────── Plumbing ─────────────────────────── */

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
      // The stand-in Splitwise accepts exactly this bearer token.
      value: await sealSession({ anonId: 'shots-anon', splitwiseUserId: '101', accessToken: 'test-token' }),
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ])
}

const reset = () => fetch(`${MOCK}/__reset`, { method: 'POST' })

/** Mock the reader. Never calls a vision API. */
async function mockReader(
  page: Page,
  opts: { source?: string; warnings?: string[]; status?: number; body?: unknown; delayMs?: number } = {},
) {
  await page.route('**/api/receipt/extract', async (route) => {
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs))
    if (opts.status && opts.status >= 400) {
      await route.fulfill({
        status: opts.status,
        contentType: 'application/json',
        body: JSON.stringify(opts.body ?? {
          error: 'extraction_unavailable',
          message: 'Scanning is busy right now — you can type the items in, it takes a minute.',
          canEnterManually: true,
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        source: opts.source ?? 'gemini',
        warnings: opts.warnings ?? [],
        receipt: sampleReceipt(),
      }),
    })
  })
}

/** Still the page: no caret, no animation, no focus ring, fonts loaded. */
async function settle(page: Page) {
  await page.addStyleTag({
    content: `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
              *:focus,*:focus-visible{outline:none!important}
              ::selection{background:transparent}`,
  })
  await page.evaluate(() => {
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    return document.fonts?.ready
  })
  await page.waitForTimeout(250)
}

async function shot(page: Page, n: number, name: string, full = true) {
  const device = test.info().project.name
  if (device === 'tablet' && !TABLET_SCREENS.has(n)) return
  const base = `${String(n).padStart(2, '0')}-${name}-${device}`
  await settle(page)
  await page.screenshot({ path: path.join(OUT, `${base}.png`) })
  if (full) await page.screenshot({ path: path.join(OUT, `${base}-full.png`), fullPage: true })
}

/** Walk from an unread receipt to the review step. */
async function toReview(page: Page) {
  await page.goto('/new')
  await page.locator('input[type="file"]').last().setInputFiles(RECEIPT_PDF)
  await page.getByRole('button', { name: /read this receipt/i }).click()
  await expect(page.getByRole('heading', { name: /check the items/i })).toBeVisible()
}

/* ─────────────────────────── The screens ─────────────────────────── */

test.describe('portfolio captures', () => {
  test.beforeEach(async () => {
    await reset()
  })

  test('01 landing, 18 FAQ and security', async ({ page }) => {
    await page.goto('/')
    await shot(page, 1, 'landing')

    await page.goto('/faq')
    // The question an international visitor asks first.
    const q = page.getByRole('button', { name: /does it work outside the united states/i })
    if (await q.count()) await q.click()
    await shot(page, 18, 'faq-works-abroad')

    await page.goto('/security')
    await shot(page, 18, 'security-privacy')
  })

  test('02-14 the whole flow on a sample grocery receipt', async ({ page, context }) => {
    await signIn(context)

    /* 02 — the choices for adding a receipt */
    await page.goto('/new')
    await expect(page.getByRole('heading', { name: /add your receipt/i })).toBeVisible()
    await shot(page, 2, 'add-receipt-choices')

    /* 03 — reading in progress */
    await mockReader(page, { delayMs: 4000 })
    await page.locator('input[type="file"]').last().setInputFiles(RECEIPT_PDF)
    await page.getByRole('button', { name: /read this receipt/i }).click()
    await expect(page.getByText(/reading your receipt/i)).toBeVisible()
    await shot(page, 3, 'reading-in-progress')

    /* 04 — check the items, read automatically, currency control visible */
    await expect(page.getByRole('heading', { name: /check the items/i })).toBeVisible()
    await shot(page, 4, 'check-items-auto')

    /* 07 — the currency control */
    const currency = page.getByLabel('Currency')
    await currency.scrollIntoViewIfNeeded()
    await shot(page, 7, 'currency-control')

    /* 07b — the same control showing its choices. A native select's popup is
       drawn by the operating system and cannot be captured, so the real
       element is rendered expanded in the page instead. Same options, same
       order; only the presentation is forced. */
    await currency.evaluate((el: HTMLSelectElement) => {
      el.size = 8
      el.scrollIntoView({ block: 'center' })
    })
    await shot(page, 7, 'currency-choices-expanded')
    await currency.evaluate((el: HTMLSelectElement) => {
      el.size = 0
    })

    await page.getByRole('button', { name: /looks right/i }).click()

    /* 08 — who shares what, avatars per line */
    await expect(page.getByRole('heading', { name: /who’s splitting this/i })).toBeVisible()
    await page.getByRole('button', { name: /add person/i }).first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Alex' }).click()
    await page.getByRole('button', { name: /add person/i }).first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Sam' }).click()

    await page.getByRole('button', { name: /^you, sharing Oat milk$/i }).click()
    await page.getByRole('button', { name: /^Alex, sharing Sourdough loaf$/i }).click()
    await page.getByRole('button', { name: /^Sam, sharing Eggs, dozen$/i }).click()
    await page.getByRole('button', { name: /^Alex, sharing Bananas$/i }).click()
    await page.getByRole('button', { name: /^Sam, sharing Detergent$/i }).click()
    await page.getByRole('button', { name: /^You, sharing Paper towels$/i }).click()
    await shot(page, 8, 'who-shares-what')

    /* 09 — one line, different people: Tomatoes x4 → 3 to Alex, 1 to Priya */
    await page.getByRole('button', { name: /split Tomatoes unevenly/i }).click()
    await page.getByRole('dialog').getByRole('button', { name: /split into 4 lines/i }).click()
    await expect(page.getByText('Tomatoes (4 of 4)')).toBeVisible()
    for (const n of [1, 2, 3]) {
      await page.getByRole('button', { name: `Alex, sharing Tomatoes (${n} of 4)` }).click()
    }
    await page.getByRole('button', { name: 'Sam, sharing Tomatoes (4 of 4)' }).click()
    await shot(page, 9, 'one-line-different-people')

    await page.getByRole('button', { name: /next: who paid/i }).click()
    await expect(page.getByRole('heading', { name: /^ready$/i })).toBeVisible()

    /* 11 — the guard: payments that do not cover the receipt */
    await page.getByText('Several people', { exact: true }).click()
    await page.getByLabel('You paid').fill('20.00')
    await page.getByLabel('Sam paid').fill('5.00')
    await page.getByLabel('Sam paid').blur()
    await shot(page, 11, 'does-not-match-guard')

    /* 10 — several payers, card for most and cash for the rest */
    await page.getByLabel('You paid').fill('42.92')
    await page.getByLabel('Sam paid').fill('10.00')
    await page.getByLabel('Sam paid').blur()
    await shot(page, 10, 'several-payers')

    /* 13 — confirm, with a group chosen and per-person totals */
    await page.getByRole('button', { name: /^Trip\b/i }).click()
    const addToGroup = page.getByRole('button', { name: /^add Sam to Trip$/i })
    if (await addToGroup.count()) {
      // The group holds You and Alex; the app refuses to add anyone to a
      // group without being asked, so ask.
      await addToGroup.click()
      await expect(addToGroup).toHaveCount(0)
    }
    await shot(page, 13, 'confirm-group-and-shares')

    /* 14 — done */
    await page.getByRole('button', { name: /^add to splitwise$/i }).click()
    await expect(page.getByRole('heading', { name: 'Added to Splitwise' })).toBeVisible()
    await shot(page, 14, 'done-summary')
  })

  test('05 backup reader and 06 reader unavailable', async ({ page, context }) => {
    await signIn(context)

    await mockReader(page, {
      source: 'ocrspace',
      warnings: ['Scanned with the backup reader — please check every line carefully.'],
    })
    await toReview(page)
    await shot(page, 5, 'check-items-backup-reader')

    /* 06 — the reader is unavailable, so the manual path */
    const page2 = await context.newPage()
    await mockReader(page2, { status: 503 })
    await page2.goto('/new')
    await page2.locator('input[type="file"]').last().setInputFiles(RECEIPT_PDF)
    await page2.getByRole('button', { name: /read this receipt/i }).click()
    await expect(page2.getByRole('alert')).toBeVisible()
    await shot(page2, 6, 'reader-unavailable')

    await page2.getByRole('alert').getByRole('button', { name: /type it in/i }).click()
    await expect(page2.getByLabel(/item 1 name/i)).toBeVisible()
    await page2.getByLabel(/item 1 name/i).fill('Sourdough loaf')
    await page2.getByLabel(/price of/i).fill('5.50')
    await shot(page2, 6, 'manual-entry')
    await page2.close()
  })

  test('12 someone is not in your Splitwise yet', async ({ page, context }) => {
    await signIn(context)
    await mockReader(page)
    await toReview(page)
    await page.getByRole('button', { name: /looks right/i }).click()

    await page.getByRole('button', { name: /add person/i }).first().click()
    await page.getByLabel(/name or friend search/i).fill('Priya')
    await shot(page, 12, 'add-someone-on-the-spot')
    await page.getByRole('button', { name: /add only to this split/i }).click()
    await shot(page, 12, 'added-on-the-spot')
  })

  test('15 read-only share page, 16 dashboard and undo, 17 empty state', async ({ page, context }) => {
    await signIn(context)

    /* 17 — the empty dashboard, before anything is saved */
    await page.goto('/')
    await shot(page, 17, 'dashboard-empty')

    /* A saved split to look at */
    await mockReader(page)
    await toReview(page)
    await page.getByRole('button', { name: /looks right/i }).click()
    await page.getByRole('button', { name: /add person/i }).first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Alex' }).click()
    await page.getByRole('button', { name: /everyone shares everything/i }).click()
    await page.getByRole('button', { name: /next: who paid/i }).click()
    await page.getByRole('button', { name: /^Trip\b/i }).click()
    await page.getByRole('button', { name: /^add to splitwise$/i }).click()
    await expect(page.getByRole('heading', { name: 'Added to Splitwise' })).toBeVisible()
    await page.getByRole('button', { name: /^done$/i }).click()
    await expect(page.getByRole('heading', { name: 'Your splits' })).toBeVisible()
    await page.getByRole('link', { name: /grocery run/i }).first().click()

    /* 15 — what a friend sees from the link */
    await page.getByRole('button', { name: /^share$/i }).click()
    await page.getByRole('button', { name: /create share link/i }).click()
    const shareUrl = await page.getByLabel('Share link').inputValue()
    await page.keyboard.press('Escape')

    const visitor = await context.browser()!.newContext({
      viewport: test.info().project.use.viewport,
      deviceScaleFactor: 2,
      colorScheme: 'light',
    })
    const guest = await visitor.newPage()
    await guest.goto(shareUrl)
    await expect(guest.getByText('Shared with you')).toBeVisible()
    await shot(guest, 15, 'share-page-read-only')
    await visitor.close()

    /* 16 — the dashboard, and the 30-second undo */
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Your splits' })).toBeVisible()
    await shot(page, 16, 'dashboard-history')

    /* 16 — the archive */
    await page.getByRole('link', { name: /grocery run/i }).first().click()
    await page.getByRole('button', { name: /archive receipt/i }).click()
    await expect(page.getByRole('heading', { name: 'Your splits' })).toBeVisible()
    await page.getByText(/archived receipts/i).click()
    await shot(page, 16, 'dashboard-archive')
    await page.getByRole('link', { name: /grocery run/i }).first().click()
    await page.getByRole('button', { name: /restore to active/i }).click()
    await expect(page.getByRole('heading', { name: 'Your splits' })).toBeVisible()

    /* 16 — the 30-second undo. Deleting in Splitwise is a shared action, so
       the app confirms natively first. */
    await page.getByRole('link', { name: /grocery run/i }).first().click()
    page.once('dialog', (d) => void d.accept())
    await page.getByRole('button', { name: /delete from splitwise too/i }).click()
    await expect(page.getByRole('button', { name: /^undo \(\d+s\)$/i })).toBeVisible()
    await shot(page, 16, 'undo-toast')
    await page.getByRole('button', { name: /^undo \(\d+s\)$/i }).click()
  })

  /**
   * A fortnight of invented usage, so the dashboard shows a working product
   * rather than a cold start. Every row is fabricated sample data written
   * straight into the stand-in database — no real person, receipt or amount.
   */
  async function seedUsage() {
    const day = 24 * 60 * 60 * 1000
    const now = Date.now()
    const accounts = ['5511', '5512', '5513', '5514']
    const guests = ['b1f0c2a4-guest', 'd4e7a991-guest', '77c1aa30-guest']
    const currencies = ['USD', 'USD', 'USD', 'GBP', 'CAD', 'EUR']
    const modes = ['items', 'items', 'items', 'equal', 'shares', 'exact']

    const events: Record<string, unknown>[] = []
    const splits: Record<string, unknown>[] = []

    for (let d = 13; d >= 0; d--) {
      const scans = 2 + ((d * 7) % 5)
      for (let i = 0; i < scans; i++) {
        const at = new Date(now - d * day + i * 90 * 60 * 1000).toISOString()
        const who = i % 3 === 0 ? guests[(d + i) % guests.length] : accounts[(d + i) % accounts.length]
        events.push({
          user_key: who,
          name: 'receipt_extracted',
          created_at: at,
          props: {
            source: (d + i) % 4 === 0 ? 'ocrspace' : 'gemini',
            kind: i % 3 === 0 ? 'pdf' : 'image',
            currency: currencies[(d + i) % currencies.length],
          },
        })

        // Most scans become a split; some do not, which is the real shape.
        if (i % 3 !== 2) {
          const owner = accounts[(d + i) % accounts.length]!
          const items = 4 + ((d + i) % 9)
          const people = 2 + ((d + i) % 3)
          const cents = 1800 + ((d * 13 + i * 7) % 6000)
          const currency = currencies[(d + i) % currencies.length]!
          const mode = modes[(d + i) % modes.length]!
          events.push({
            user_key: owner,
            name: 'split_submitted',
            created_at: new Date(Date.parse(at) + 6 * 60 * 1000).toISOString(),
            props: {
              source: 'splitwise',
              group: (d + i) % 3 === 0 ? 'none' : 'group',
              mode,
              payers: (d + i) % 5 === 0 ? 'several' : 'one',
              item_splits: (d + i) % 4 === 0 ? 'yes' : 'no',
              items,
              people,
            },
          })
          splits.push({
            owner_id: owner,
            created_at: new Date(Date.parse(at) + 6 * 60 * 1000).toISOString(),
            expense_ids: [`seed-${d}-${i}`],
            data: {
              merchant: i % 2 === 0 ? 'Grocery run' : 'Lunch out',
              currency,
              totalCents: cents,
              itemCount: items,
              peopleCount: people,
              payerCount: (d + i) % 5 === 0 ? 2 : 1,
              participants: Array.from({ length: people }, (_, k) => `p${k}`),
              mode,
              hadPhoto: 'true',
            },
          })
        }
      }
    }

    const post = (table: string, rows: unknown[]) =>
      fetch(`${MOCK}/rest/v1/${table}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: 'shots', authorization: 'Bearer shots' },
        body: JSON.stringify(rows),
      })
    await post('events', events)
    await post('splits', splits)
  }

  test('17 an error state: Splitwise refuses the expense', async ({ page, context }) => {
    // A non-group expense you are not part of. The stand-in refuses it the
    // way Splitwise does, so this is the app's real error path, not a mock-up.
    await signIn(context)
    await mockReader(page)
    await toReview(page)
    await page.getByRole('button', { name: /looks right/i }).click()
    await page.getByRole('button', { name: /remove You from this split/i }).click()
    for (const name of ['Alex', 'Sam']) {
      await page.getByRole('button', { name: /add person/i }).first().click()
      await page.getByRole('dialog').getByRole('button', { name }).click()
    }
    await page.getByRole('button', { name: /everyone shares everything/i }).click()
    await page.getByRole('button', { name: /next: who paid/i }).click()
    await page.getByRole('button', { name: /^no group/i }).click()
    await page.getByRole('button', { name: /^add to splitwise$/i }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await shot(page, 17, 'error-splitwise-refused')
  })

  test('19 admin dashboard with stand-in data', async ({ page, context }) => {
    await signIn(context)
    await seedUsage()

    // Two more through the real flow, so the newest rows are genuine.
    for (const payer of ['Alex', 'Sam']) {
      await mockReader(page)
      await toReview(page)
      await page.getByRole('button', { name: /looks right/i }).click()
      await page.getByRole('button', { name: /add person/i }).first().click()
      await page.getByRole('dialog').getByRole('button', { name: payer }).click()
      await page.getByRole('button', { name: /everyone shares everything/i }).click()
      await page.getByRole('button', { name: /next: who paid/i }).click()
      await page.getByRole('button', { name: /^no group/i }).click()
      await page.getByRole('button', { name: /^add to splitwise$/i }).click()
      await expect(page.getByRole('heading', { name: 'Added to Splitwise' })).toBeVisible()
    }

    // ADMIN_USER_IDS allowlists this sample account, so no password screen.
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'How Gauravide is doing' })).toBeVisible()

    // The Accounts table and Feedback inbox are deliberately not captured.
    await page.evaluate(() => {
      for (const section of Array.from(document.querySelectorAll('section'))) {
        const h = section.querySelector('h3')?.textContent?.toLowerCase() ?? ''
        if (h.includes('account') || h.includes('feedback')) section.remove()
      }
    })
    await shot(page, 19, 'admin-dashboard')
  })

  test('flipbook: five phone frames of one receipt', async ({ page, context }) => {
    test.skip(test.info().project.name !== 'phone', 'the flipbook is a phone sequence')
    await signIn(context)

    const frame = async (i: number, name: string) => {
      await settle(page)
      await page.screenshot({ path: path.join(OUT, `flip-${i}-${name}-phone.png`) })
    }

    await mockReader(page)
    await page.goto('/new')
    await expect(page.getByRole('heading', { name: /add your receipt/i })).toBeVisible()
    await frame(1, 'add')

    await page.locator('input[type="file"]').last().setInputFiles(RECEIPT_PDF)
    await page.getByRole('button', { name: /read this receipt/i }).click()
    await expect(page.getByRole('heading', { name: /check the items/i })).toBeVisible()
    await frame(2, 'check')

    await page.getByRole('button', { name: /looks right/i }).click()
    await page.getByRole('button', { name: /add person/i }).first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Alex' }).click()
    await page.getByRole('button', { name: /everyone shares everything/i }).click()
    await frame(3, 'who-shares')

    await page.getByRole('button', { name: /next: who paid/i }).click()
    await page.getByRole('button', { name: /^Trip\b/i }).click()
    await frame(4, 'confirm')

    await page.getByRole('button', { name: /^add to splitwise$/i }).click()
    await expect(page.getByRole('heading', { name: 'Added to Splitwise' })).toBeVisible()
    await frame(5, 'done')
  })
})
