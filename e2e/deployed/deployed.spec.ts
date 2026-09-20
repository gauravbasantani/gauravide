import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'

/**
 * Is the fix actually live?
 *
 * Every check here runs against whatever is deployed at DEPLOY_URL, in a real
 * browser, on desktop Chromium and mobile WebKit. Extraction is mocked in the
 * browser: the point is the code that ships in the bundle — how a PDF and a
 * transparent PNG are prepared before upload, and whether a long receipt
 * survives the trip to the review step.
 */

const PDF = path.resolve('e2e/fixtures/receipt-2page.pdf')
const ALPHA_PNG = path.resolve('e2e/fixtures/receipt-alpha.png')

const ITEM_COUNT = 80

type Upload = { name: string; type: string; size: number; head: string; corner: [number, number, number] | null }

function longReceipt() {
  const cents = Array.from({ length: ITEM_COUNT }, (_, i) => (i + 2) * 100)
  return {
    source: 'gemini',
    warnings: [],
    receipt: {
      merchant: 'Costco Wholesale',
      date: '2026-09-04',
      currency: 'USD',
      items: cents.map((value, i) => ({
        id: `i${i + 1}`,
        name: `Item ${String(i + 1).padStart(3, '0')}`,
        qty: 1,
        cents: value,
        confidence: 0.9,
      })),
      taxLines: [],
      subtotalCents: cents.reduce((a, b) => a + b, 0),
      taxCents: 0,
      tipCents: 0,
      feeCents: 0,
      totalCents: cents.reduce((a, b) => a + b, 0),
    },
  }
}

async function captureUpload(page: Page) {
  await page.addInitScript(() => {
    const original = window.fetch
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      const body = init?.body
      if (url.includes('/api/receipt/extract') && body instanceof FormData) {
        const file = body.get('file')
        if (file instanceof File) {
          const text = new TextDecoder('latin1').decode(await file.arrayBuffer())
          let corner: [number, number, number] | null = null
          if (file.type.startsWith('image/')) {
            try {
              const bitmap = await createImageBitmap(file)
              const probe = document.createElement('canvas')
              probe.width = bitmap.width
              probe.height = bitmap.height
              const context = probe.getContext('2d')
              context?.drawImage(bitmap, 0, 0)
              const pixel = context?.getImageData(2, 2, 1, 1).data
              if (pixel) corner = [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0]
            } catch {
              corner = null
            }
          }
          ;(window as unknown as { __upload?: unknown }).__upload = {
            name: file.name,
            type: file.type,
            size: file.size,
            head: text.slice(0, 8),
            corner,
          }
        }
      }
      return original(input, init)
    }
  })

  await page.route('**/api/receipt/extract', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(longReceipt()),
    }),
  )

  return () => page.evaluate(() => (window as unknown as { __upload?: Upload }).__upload ?? null)
}

test.describe('the deployed site', () => {
  test('the landing page loads and hydrates without console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(e.message))

    await page.goto('/')
    await expect(page.getByRole('link', { name: /split a receipt|get started|start/i }).first()).toBeVisible()
    expect(errors).toEqual([])
  })

  test('the upload step is reachable and accepts a file', async ({ page }) => {
    await page.goto('/new')
    await expect(page.getByRole('heading', { name: /add your receipt/i })).toBeVisible()
    await expect(page.locator('input[type="file"]').last()).toHaveAttribute('accept', /pdf/)
  })

  test('a two-page PDF is uploaded whole', async ({ page }) => {
    const uploaded = await captureUpload(page)

    await page.goto('/new')
    await page.locator('input[type="file"]').last().setInputFiles(PDF)
    await page.getByRole('button', { name: /read this receipt/i }).click()
    await expect(page.getByRole('heading', { name: /check the items/i })).toBeVisible()

    const sent = await uploaded()
    expect(sent?.type).toBe('application/pdf')
    expect(sent?.head).toBe('%PDF-1.4')
  })

  test('a transparent PNG is flattened onto white, not onto black', async ({ page }) => {
    const uploaded = await captureUpload(page)

    await page.goto('/new')
    await page.locator('input[type="file"]').last().setInputFiles(ALPHA_PNG)
    await page.getByRole('button', { name: /read this receipt/i }).click()
    await expect(page.getByRole('heading', { name: /check the items/i })).toBeVisible()

    const corner = (await uploaded())?.corner
    expect(corner, 'the uploaded image could be decoded').not.toBeNull()
    for (const channel of corner ?? []) expect(channel).toBeGreaterThan(200)
  })

  test('a receipt in pounds shows pounds, and the currency can be corrected', async ({ page }) => {
    await page.route('**/api/receipt/extract', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          source: 'gemini',
          warnings: [],
          receipt: {
            merchant: 'Tesco Extra',
            date: '2026-09-14',
            currency: 'GBP',
            items: [{ id: 'a', name: 'Cheddar 400g', qty: 1, cents: 350, confidence: 0.99 }],
            taxLines: [],
            subtotalCents: 350,
            taxCents: 0,
            tipCents: 0,
            feeCents: 0,
            totalCents: 350,
          },
        }),
      }),
    )

    await page.goto('/new')
    await page.locator('input[type="file"]').last().setInputFiles(PDF)
    await page.getByRole('button', { name: /read this receipt/i }).click()
    await expect(page.getByRole('heading', { name: /check the items/i })).toBeVisible()

    await expect(page.getByLabel('Currency')).toHaveValue('GBP')
    await expect(page.getByText('£3.50').first()).toBeVisible()
    // Correctable, because a dollar sign cannot be pinned to one country.
    await page.getByLabel('Currency').selectOption('CAD')
    await expect(page.getByText('$3.50').first()).toBeVisible()
  })

  test('the FAQ answers the question people abroad will ask', async ({ page }) => {
    await page.goto('/faq')
    await expect(
      page.getByRole('heading', { name: /does it work outside the united states/i }),
    ).toBeVisible()
    await expect(page.getByText(/GST and HST mean Canada/i)).toBeVisible()
    // The scanning ceiling is stated rather than discovered.
    await expect(page.getByText(/falls back to a simpler reader/i)).toBeVisible()
  })

  test('about and contact still render, with the international tax wording', async ({ page }) => {
    await page.goto('/about')
    await expect(page.getByText(/VAT, GST, HST, ALV, MOMS, MWST, TVA, IVA/i)).toBeVisible()
    await page.goto('/contact')
    await expect(page.locator('h1')).toBeVisible()
  })

  test('all 80 items of a long receipt reach the review step', async ({ page }) => {
    await captureUpload(page)

    await page.goto('/new')
    await page.locator('input[type="file"]').last().setInputFiles(PDF)
    await page.getByRole('button', { name: /read this receipt/i }).click()
    await expect(page.getByRole('heading', { name: /check the items/i })).toBeVisible()

    await expect(page.getByLabel('Item 1 name')).toHaveValue('Item 001')
    await expect(page.locator('input[aria-label$=" name"]')).toHaveCount(ITEM_COUNT)
  })
})
