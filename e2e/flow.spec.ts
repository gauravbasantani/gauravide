import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'

const RECEIPT = path.resolve('e2e/fixtures/receipt.jpg')

function captureErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  return errors
}

async function mockSignedIn(page: Page) {
  await page.route('**/api/splitwise/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        signedIn: true,
        me: { id: 101, name: 'Gaurav' },
        friends: [
          { id: 202, name: 'Alex' },
          { id: 303, name: 'Maya' },
        ],
        groups: [
          {
            id: 303,
            name: 'Trip',
            updatedAt: '2026-09-01',
            members: [
              { id: 101, name: 'Gaurav' },
              { id: 202, name: 'Alex' },
            ],
          },
        ],
      }),
    })
  })
}

async function mockExpense(page: Page, posted: Record<string, unknown>) {
  await page.route('**/api/splitwise/expense', async (route) => {
    Object.assign(posted, route.request().postDataJSON())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 98765, historySaved: true }),
    })
  })
}

async function manualReceipt(page: Page, name: string, price: string) {
  await page.goto('/new')
  await page.getByRole('button', { name: 'Type it in' }).click()
  await page.getByLabel(/item 1 name/i).fill(name)
  await page.getByLabel(/price of/i).fill(price)
  await page.getByRole('button', { name: /looks right/i }).click()
}

async function addFriend(page: Page, name: string) {
  await page.getByRole('button', { name: /add person/i }).first().click()
  await page.getByRole('button', { name }).click()
}

test.describe('the whole split, end to end', () => {
  test('upload a receipt, assign people, reach an exact total', async ({ page }) => {
    test.setTimeout(120_000) // extraction calls a real vision API
    const errors = captureErrors(page)

    // Guard the bug that broke every mobile upload: the prepared image was
    // ~0 bytes on WebKit, nothing threw, and extraction quietly returned
    // nothing. The honest signal is the response, not the request size.
    let extraction: { source?: string; receipt?: { items?: unknown[] } } = {}
    page.on('response', async (res) => {
      if (res.url().includes('/api/receipt/extract') && res.status() === 200) {
        extraction = await res.json().catch(() => ({}))
      }
    })

    await page.goto('/new')

    // 1. Upload — set the file on the real input behind the label.
    await page.locator('input[type="file"]').nth(1).setInputFiles(RECEIPT)
    await expect(page.getByText(/receipt ready/i)).toBeVisible()
    await expect(page.getByAltText(/preview of the receipt/i)).toBeVisible()
    await page.getByRole('button', { name: /read this receipt/i }).click()
    await expect(page.getByText(/reading your receipt/i)).toBeVisible()

    // 2. Review — wait for extraction to land, THEN judge what it returned.
    await expect(page.getByRole('heading', { name: /check the items/i })).toBeVisible({
      timeout: 90_000,
    })
    expect(
      extraction.receipt?.items?.length ?? 0,
      'extraction must return items — an empty result means the prepared image was blank',
    ).toBeGreaterThan(0)
    await expect(page.getByLabel('Item 1 name')).toHaveValue(/KS TOWEL/i)
    await expect(page.getByText('$108.50').first()).toBeVisible()

    await page.getByRole('button', { name: /looks right/i }).click()

    // 3. Split — the screen explains why people are needed before asking.
    await expect(page.getByRole('heading', { name: /who’s splitting this/i })).toBeVisible()
    await expect(page.getByText(/add everyone on this bill/i)).toBeVisible()
    for (const name of ['Gaurav', 'Alex']) {
      await page.getByRole('button', { name: /add person/i }).first().click()
      await page.getByLabel(/^name$/i).fill(name)
      await page.getByRole('button', { name: /add to split/i }).click()
    }

    // Blocked until every item has someone.
    const next = page.getByRole('button', { name: /next: who paid/i })
    await expect(next).toBeDisabled()
    await expect(page.getByText(/still needs? someone/i)).toBeVisible()

    await page.getByRole('button', { name: /everyone shares everything/i }).click()
    await expect(next).toBeEnabled()
    await next.click()

    // 4. Confirm — the total must reconcile against the receipt.
    await expect(page.getByRole('heading', { name: /^ready$/i })).toBeVisible()
    await expect(page.getByText('$108.50').first()).toBeVisible()
    await expect(page.getByText(/matches receipt/i)).toBeVisible()

    // Per-person shares must sum to the total, to the cent.
    const amounts = await page.locator('[data-share]').allInnerTexts()
    const cents = amounts.map((t) => Math.round(parseFloat(t.replace(/[^0-9.]/g, '')) * 100))
    expect(cents.reduce((a, b) => a + b, 0)).toBe(10850)

    expect(errors).toEqual([])
  })

  test('a draft survives a reload mid-split', async ({ page }) => {
    await page.goto('/new')
    await page.getByRole('button', { name: 'Type it in' }).click()
    await expect(page.getByRole('heading', { name: /check the items/i })).toBeVisible()

    await page.reload()
    await expect(page.getByText(/split in progress from earlier/i)).toBeVisible()
    await page.getByRole('button', { name: /pick up where i left off/i }).click()
    await expect(page.getByRole('heading', { name: /check the items/i })).toBeVisible()
  })

  test('manual entry works with no photo at all', async ({ page }) => {
    await page.goto('/new')
    await page.getByRole('button', { name: 'Type it in' }).click()
    await page.getByRole('button', { name: /add item/i }).click()
    await page.getByLabel(/item 1 name/i).fill('Pizza')
    await page.getByLabel(/price of/i).fill('24.00')
    await page.getByLabel(/^tax$/i).fill('2.00')
    await page.getByRole('button', { name: /looks right/i }).click()
    await expect(page.getByRole('heading', { name: /who’s splitting this/i })).toBeVisible()
  })

  test('a quantity line can become separately assignable units', async ({ page }) => {
    await page.route('**/api/receipt/extract', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          source: 'gemini',
          warnings: [],
          receipt: {
            merchant: 'Market',
            date: '2026-09-12',
            currency: 'USD',
            items: [
              { name: 'Tomato bag', qty: 4, cents: 1001, confidence: 1 },
              { name: 'Bananas', qty: 2.5, cents: 150, confidence: 1 },
            ],
            taxLines: [],
            subtotalCents: 1151,
            taxCents: 0,
            tipCents: 0,
            feeCents: 0,
            totalCents: 1151,
          },
        }),
      })
    })

    await page.goto('/new')
    await page.locator('input[type="file"]').nth(1).setInputFiles(RECEIPT)
    await page.getByRole('button', { name: /read this receipt/i }).click()
    await expect(page.getByRole('heading', { name: /check the items/i })).toBeVisible()

    // A weight is not a count: no misleading "Split into 2" for 2.5 lb.
    await expect(page.getByText(/qty 2.5 · shared as one line/i)).toBeVisible()
    await page.getByRole('button', { name: 'Split into 4' }).click()

    await expect(page.getByLabel('Item 1 name')).toHaveValue('Tomato bag (1 of 4)')
    await expect(page.getByLabel('Item 4 name')).toHaveValue('Tomato bag (4 of 4)')
    const prices = await page
      .locator('input[aria-label^="Price of Tomato bag"]')
      .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))
    expect(prices).toEqual(['2.51', '2.50', '2.50', '2.50'])
  })

  test('removing an item keeps everyone else on the right line', async ({ page }) => {
    await page.goto('/new')
    await page.getByRole('button', { name: 'Type it in' }).click()
    await page.getByLabel(/item 1 name/i).fill('Steak')
    await page.getByLabel(/price of/i).fill('30.00')
    await page.getByRole('button', { name: /add item/i }).click()
    await page.getByLabel(/item 2 name/i).fill('Salad')
    await page.locator('input[aria-label^="Price of"]').nth(1).fill('10.00')
    await page.getByRole('button', { name: /looks right/i }).click()

    for (const name of ['Sam', 'Lee']) {
      await page.getByRole('button', { name: /add person/i }).first().click()
      await page.getByLabel(/^name$/i).fill(name)
      await page.getByRole('button', { name: /add to split/i }).click()
    }
    await page.getByRole('button', { name: 'Sam, sharing Steak' }).click()
    await page.getByRole('button', { name: 'Lee, sharing Salad' }).click()

    // Back to review, delete the steak, return: Lee must still have the salad.
    await page.getByRole('button', { name: /^back$/i }).click()
    await page.getByRole('button', { name: 'Remove Steak' }).click()
    await page.getByRole('button', { name: /looks right/i }).click()
    await expect(page.getByRole('button', { name: 'Lee, sharing Salad' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByRole('button', { name: 'Sam, sharing Salad' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  test('a signed-in split can review and publish to Splitwise', async ({ page }) => {
    const posted: Record<string, unknown> = {}
    await mockSignedIn(page)
    await mockExpense(page, posted)

    await manualReceipt(page, 'Dinner', '48.00')

    // You are added automatically when signed in.
    await expect(page.getByText('(you)')).toBeVisible()
    await addFriend(page, 'Alex')
    await page.getByRole('button', { name: /everyone shares everything/i }).click()
    await page.getByRole('button', { name: /next: who paid/i }).click()

    await expect(page.getByRole('heading', { name: /^ready$/i })).toBeVisible()
    await expect(page.getByText(/alex pays you/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Trip' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: /add to splitwise/i }).click()
    await expect(page.getByRole('status')).toContainText(/added to splitwise/i)
    expect(posted).toMatchObject({
      groupId: 303,
      totalCents: 4800,
      mode: 'items',
      payers: [{ personId: 101, cents: 4800 }],
    })
    expect(posted.items).toHaveLength(1)

    // A refresh after success must not offer a second submit (review finding 3).
    await page.reload()
    await page.getByRole('button', { name: /see it/i }).click()
    await expect(page.getByRole('status')).toContainText(/added to splitwise/i)
    await expect(page.getByRole('button', { name: /add to splitwise/i })).toHaveCount(0)
  })

  test('split equally, with two people paying', async ({ page }) => {
    const posted: Record<string, unknown> = {}
    await mockSignedIn(page)
    await mockExpense(page, posted)

    await manualReceipt(page, 'Groceries', '90.00')
    await addFriend(page, 'Alex')
    await addFriend(page, 'Maya')

    await page.getByText('Equally', { exact: true }).click()
    await page.getByRole('button', { name: /next: who paid/i }).click()

    await page.getByText('Several people', { exact: true }).click()
    await page.getByLabel('Gaurav paid').fill('60.00')
    await page.getByLabel('Alex paid').fill('30.00')
    await page.getByLabel('Alex paid').blur()
    await expect(page.getByText(/payments cover/i)).toBeVisible()

    // Gaurav paid 60, owes 30 → gets back 30. Alex paid 30, owes 30. Maya owes 30.
    await expect(page.getByText(/maya pays you/i)).toBeVisible()
    await page.getByRole('button', { name: 'No group' }).click()
    await page.getByRole('button', { name: /add to splitwise/i }).click()
    await expect(page.getByRole('status')).toContainText(/added to splitwise/i)
    expect(posted).toMatchObject({
      mode: 'equal',
      groupId: 0,
      payers: [
        { personId: 101, cents: 6000 },
        { personId: 202, cents: 3000 },
      ],
    })
  })

  test('one item split by shares, paid by a friend outside the split', async ({ page }) => {
    const posted: Record<string, unknown> = {}
    await mockSignedIn(page)
    await mockExpense(page, posted)

    await manualReceipt(page, 'Dinner', '30.00')
    await addFriend(page, 'Alex')

    await page.getByRole('button', { name: 'Split Dinner unevenly' }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByText('By shares', { exact: true }).click()
    await sheet.getByRole('button', { name: 'One more share for Gaurav' }).click()
    await expect(sheet.getByText('$20.00')).toBeVisible()
    await sheet.getByRole('button', { name: /save split/i }).click()
    await expect(page.getByText('Gaurav ×2 · Alex ×1')).toBeVisible()
    await page.getByRole('button', { name: /next: who paid/i }).click()

    await page.getByRole('button', { name: /someone else paid/i }).click()
    await page.getByRole('button', { name: 'Maya' }).click()
    await expect(page.getByText(/you pay maya/i)).toBeVisible()
    await expect(page.getByText(/alex pays maya/i)).toBeVisible()

    // Trip was pre-selected before Maya joined, so the app flags her as missing
    // from it. Choose the picker's "No group" option, not the callout shortcut.
    await expect(page.getByText(/maya is not in trip/i)).toBeVisible()
    await page.getByRole('button', { name: /^no group/i }).click()
    await page.getByRole('button', { name: /add to splitwise/i }).click()
    await expect(page.getByRole('status').filter({ hasText: /added to splitwise/i })).toBeVisible()
    expect(posted).toMatchObject({ groupId: 0, payers: [{ personId: 303, cents: 3000 }] })
    expect((posted.items as { split?: unknown }[])[0]?.split).toEqual({
      kind: 'shares',
      values: { '101': 2, '202': 1 },
    })
  })

  test('a discount goes to whoever had the item it discounts', async ({ page }) => {
    await page.route('**/api/receipt/extract', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          source: 'gemini',
          warnings: [],
          receipt: {
            merchant: 'Costco',
            date: '2026-09-04',
            currency: 'USD',
            items: [
              { name: '512599 **KS TOWEL**', qty: 1, cents: 2079, confidence: 1 },
              { name: '1644153 HVST SNAPS', qty: 1, cents: 859, confidence: 1 },
              { name: '0000389361 / SNAPS', qty: 1, cents: -300, confidence: 1 },
            ],
            taxLines: [],
            subtotalCents: 2638,
            taxCents: 0,
            tipCents: 0,
            feeCents: 0,
            totalCents: 2638,
          },
        }),
      }),
    )
    await page.goto('/new')
    await page.locator('input[type="file"]').nth(1).setInputFiles(RECEIPT)
    await page.getByRole('button', { name: /read this receipt/i }).click()
    await page.getByRole('button', { name: /looks right/i }).click()
    for (const name of ['Gaurav', 'Mayur']) {
      await page.getByRole('button', { name: /add person/i }).first().click()
      await page.getByLabel(/^name$/i).fill(name)
      await page.getByRole('button', { name: /add to split/i }).click()
    }
    await page.getByRole('button', { name: 'Gaurav, sharing KS TOWEL' }).click()
    await page.getByRole('button', { name: 'Mayur, sharing HVST SNAPS' }).click()

    await expect(page.getByText('↳ Follows HVST SNAPS')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mayur, sharing Discount · SNAPS' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByText('3 of 3 items assigned')).toBeVisible()
    await page.getByRole('button', { name: /next: who paid/i }).click()
    // Mayur: snaps 8.59 − 3.00 = 5.59
    await expect(page.locator('[data-share]').nth(1)).toHaveText('$5.59')
  })

  test('signed out, the people step leads with Splitwise sign-in', async ({ page }) => {
    await manualReceipt(page, 'Dinner', '20.00')
    const signIn = page.getByRole('link', { name: /sign in with splitwise to add friends/i })
    await expect(signIn).toBeVisible()
    await expect(signIn).toHaveAttribute('href', '/api/auth/login?next=/new')
    await expect(page.getByText(/or type names just for this split/i)).toBeVisible()
  })

  test('a typed name can be linked to a Splitwise friend without losing its items', async ({
    page,
  }) => {
    await mockSignedIn(page)
    await manualReceipt(page, 'Dinner', '20.00')

    await page.getByRole('button', { name: /add person/i }).first().click()
    await page.getByLabel(/name or friend search/i).fill('Sam')
    await page.getByRole('button', { name: /add only to this split/i }).click()
    await page.getByRole('button', { name: 'Sam, sharing Dinner' }).click()

    await page.getByRole('button', { name: 'Link Sam to a Splitwise friend' }).click()
    await page.getByLabel(/name or friend search/i).fill('')
    await page.getByRole('dialog').getByRole('button', { name: 'Alex' }).click()
    await expect(page.getByRole('button', { name: 'Alex, sharing Dinner' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByRole('button', { name: /link .* to a splitwise friend/i })).toHaveCount(0)
  })

  test('an edit reopens in the flow and saves to the same expense', async ({ page }) => {
    const posted: Record<string, unknown> = {}
    await mockSignedIn(page)
    await mockExpense(page, posted)
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem(
        'gauravide:draft:v2',
        JSON.stringify({
          step: 'review',
          receipt: {
            merchant: 'Trader Joe’s',
            date: '2026-09-12',
            currency: 'USD',
            items: [{ id: 'i1', name: 'Wine', qty: 1, cents: 2500, confidence: 1 }],
            taxLines: [],
            subtotalCents: null,
            taxCents: 0,
            tipCents: 0,
            feeCents: 0,
            totalCents: 2500,
          },
          people: [
            { id: '101', name: 'Gaurav' },
            { id: '202', name: 'Alex' },
          ],
          assignments: { i1: ['101', '202'] },
          payerId: '101',
          settings: { mode: 'items', included: null, weights: {}, exact: {}, payers: null, itemSplits: {} },
          submitKey: '6f1c1b1e-8a5b-4c2d-9e3f-1a2b3c4d5e6f',
          submittedExpenseId: null,
          editing: {
            splitId: '0b7f9a52-3c1d-4e8f-9a6b-2c3d4e5f6a7b',
            expenseId: 555,
            merchant: 'Trader Joe’s',
            groupId: 303,
          },
          savedAt: Date.now(),
        }),
      )
    })

    await page.goto('/new?edit=1')
    await expect(page.getByText(/editing “trader joe’s”/i)).toBeVisible()
    await expect(page.getByRole('heading', { name: /check the items/i })).toBeVisible()
    await page.getByRole('button', { name: /looks right/i }).click()
    await page.getByRole('button', { name: /next: who paid/i }).click()
    await expect(page.getByRole('button', { name: /trip/i })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: /save changes to splitwise/i }).click()
    await expect(page.getByRole('status').filter({ hasText: /changes saved/i })).toBeVisible()
    expect(posted).toMatchObject({
      edit: { splitId: '0b7f9a52-3c1d-4e8f-9a6b-2c3d4e5f6a7b' },
      totalCents: 2500,
    })
  })

  test('the item list reads cleanly and a new group can be created', async ({ page }) => {
    await mockSignedIn(page)
    await page.route('**/api/receipt/extract', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          source: 'gemini',
          warnings: [],
          receipt: {
            merchant: 'Costco',
            date: '2026-09-04',
            currency: 'USD',
            items: [
              { name: '512599 **KS TOWEL**', qty: 1, cents: 2079, taxFlag: 'A', confidence: 1 },
              { name: '0000389361 / SNAPS', qty: 1, cents: -300, confidence: 1 },
            ],
            taxLines: [],
            subtotalCents: 1779,
            taxCents: 0,
            tipCents: 0,
            feeCents: 0,
            totalCents: 1779,
          },
        }),
      }),
    )
    await page.route('**/api/splitwise/group', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          group: {
            id: 777,
            name: 'Costco run',
            updatedAt: null,
            members: [
              { id: 101, name: 'Gaurav' },
              { id: 303, name: 'Maya' },
            ],
          },
        }),
      }),
    )

    await page.goto('/new')
    await page.locator('input[type="file"]').nth(1).setInputFiles(RECEIPT)
    await page.getByRole('button', { name: /read this receipt/i }).click()
    await expect(page.getByLabel('Item 1 name')).toHaveValue('KS TOWEL')
    await expect(page.getByLabel('Item 2 name')).toHaveValue('Discount · SNAPS')
    await expect(page.getByText('✓ Adds up to the receipt total')).toBeVisible()
    await page.getByRole('button', { name: /looks right/i }).click()

    await addFriend(page, 'Maya')
    await page.getByRole('button', { name: /everyone shares everything/i }).click()
    await page.getByRole('button', { name: /next: who paid/i }).click()

    await page.getByRole('button', { name: /create a new group/i }).click()
    await page.getByLabel('New group name').fill('Costco run')
    await page.getByRole('button', { name: /^create group$/i }).click()
    await expect(page.getByRole('button', { name: /costco run/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
