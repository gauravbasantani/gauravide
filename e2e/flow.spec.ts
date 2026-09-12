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

test.describe('the whole split, end to end', () => {
  test('upload a receipt, assign people, reach an exact total', async ({ page }) => {
    test.setTimeout(120_000) // extraction calls a real vision API
    const errors = captureErrors(page)

    // Guard the bug that broke every mobile upload: the prepared image was
    // ~0 bytes on WebKit, nothing threw, and extraction quietly returned
    // nothing. The honest signal is the response, not the request size —
    // postDataBuffer() is null for multipart on Chromium.
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
    await expect(page.getByRole('button', { name: /next: read this receipt/i })).toBeVisible()
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

    // 3. Assign — add two people.
    await expect(page.getByRole('heading', { name: /who shares what/i })).toBeVisible()
    for (const name of ['Gaurav', 'Alex']) {
      await page.getByRole('button', { name: /add person/i }).click()
      await page.getByLabel(/^name$/i).fill(name)
      await page.getByRole('button', { name: /add to split/i }).click()
    }

    // Review is blocked until every item has someone.
    const review = page.getByRole('button', { name: /^review$/i })
    await expect(review).toBeDisabled()
    await expect(page.getByText(/still need someone/i)).toBeVisible()

    await page.getByRole('button', { name: /everyone shares everything/i }).click()
    await expect(review).toBeEnabled()
    await review.click()

    // 4. Confirm — the total must reconcile against the receipt.
    await expect(page.getByRole('heading', { name: /^ready$/i })).toBeVisible()
    await expect(page.getByText('$108.50').first()).toBeVisible()
    await expect(page.getByText(/matches receipt/i)).toBeVisible()

    // Per-person shares must sum to the total, to the cent.
    const amounts = await page.locator('[class*="personAmount"]').allInnerTexts()
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
    await expect(page.getByRole('heading', { name: /who shares what/i })).toBeVisible()
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
            items: [{ name: 'Tomato bag', qty: 4, cents: 1001, confidence: 1 }],
            taxLines: [],
            subtotalCents: 1001,
            taxCents: 0,
            tipCents: 0,
            feeCents: 0,
            totalCents: 1001,
          },
        }),
      })
    })

    await page.goto('/new')
    await page.locator('input[type="file"]').nth(1).setInputFiles(RECEIPT)
    await page.getByRole('button', { name: /read this receipt/i }).click()
    await expect(page.getByRole('heading', { name: /check the items/i })).toBeVisible()
    await page.getByRole('button', { name: 'Split into 4' }).click()

    await expect(page.getByLabel('Item 1 name')).toHaveValue('Tomato bag (1 of 4)')
    await expect(page.getByLabel('Item 4 name')).toHaveValue('Tomato bag (4 of 4)')
    const prices = await page.locator('input[aria-label^="Price of Tomato bag"]').evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    )
    expect(prices).toEqual(['2.51', '2.50', '2.50', '2.50'])
  })

  test('a signed-in split can review and publish to Splitwise', async ({ page }) => {
    const posted: { groupId?: number; totalCents?: number; items?: unknown[] } = {}

    await page.route('**/api/splitwise/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          signedIn: true,
          me: { id: 101, name: 'Gaurav' },
          friends: [{ id: 202, name: 'Alex' }],
          groups: [{ id: 303, name: 'Trip', updatedAt: '2026-09-01', members: [{ id: 101, name: 'Gaurav' }, { id: 202, name: 'Alex' }] }],
        }),
      })
    })
    await page.route('**/api/splitwise/expense', async (route) => {
      posted.groupId = route.request().postDataJSON()?.groupId
      posted.totalCents = route.request().postDataJSON()?.totalCents
      posted.items = route.request().postDataJSON()?.items
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 98765 }),
      })
    })

    await page.goto('/new')
    await page.getByRole('button', { name: 'Type it in' }).click()
    await page.getByLabel(/item 1 name/i).fill('Dinner')
    await page.getByLabel(/price of/i).fill('48.00')
    await page.getByRole('button', { name: /looks right/i }).click()

    await page.getByRole('button', { name: /add person/i }).click()
    await page.getByRole('button', { name: 'Gaurav' }).click()
    await page.getByRole('button', { name: /add person/i }).click()
    await page.getByRole('button', { name: 'Alex' }).click()
    await page.getByRole('button', { name: /everyone shares everything/i }).click()
    await page.getByRole('button', { name: /^review$/i }).click()

    await expect(page.getByRole('heading', { name: /^ready$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /add to splitwise/i })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Trip' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: /add to splitwise/i }).click()
    await expect(page.getByRole('status')).toContainText(/added to splitwise/i)
    expect(posted).toMatchObject({ groupId: 303, totalCents: 4800 })
    expect(posted.items).toHaveLength(1)
  })
})
