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
})
