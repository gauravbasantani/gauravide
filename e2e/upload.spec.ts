import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * What the browser actually puts on the wire, for both kinds of upload.
 *
 * A PDF and a photo take different paths through prepareImage, and the PDF
 * one used to lose pages: three canvas decode strategies ran against a file
 * no canvas can decode, and a canvas that HAD decoded it would have flattened
 * a multi-page receipt down to page one. Only a real browser proves the bytes
 * that leave the page are the bytes the reader needs.
 */

const PDF = path.resolve('e2e/fixtures/receipt-2page.pdf')
const JPG = path.resolve('e2e/fixtures/receipt.jpg')
const ALPHA_PNG = path.resolve('e2e/fixtures/receipt-alpha.png')

/** Long enough that any silent truncation on the way to review shows up. */
const ITEM_COUNT = 80

function longReceipt() {
  return {
    source: 'gemini',
    warnings: [],
    receipt: {
      merchant: 'Costco Wholesale',
      date: '2026-09-04',
      currency: 'USD',
      items: Array.from({ length: ITEM_COUNT }, (_, i) => ({
        id: `i${i + 1}`,
        name: `Item ${String(i + 1).padStart(3, '0')}`,
        qty: 1,
        cents: (i + 2) * 100,
        confidence: 0.9,
      })),
      taxLines: [{ flag: 'A', cents: 27054 }],
      subtotalCents: Array.from({ length: ITEM_COUNT }, (_, i) => (i + 2) * 100).reduce(
        (a, b) => a + b,
        0,
      ),
      taxCents: 27054,
      tipCents: 0,
      feeCents: 0,
      totalCents:
        Array.from({ length: ITEM_COUNT }, (_, i) => (i + 2) * 100).reduce((a, b) => a + b, 0) +
        27054,
    },
  }
}

/**
 * What the page hands to fetch, observed inside the page.
 *
 * Playwright cannot read the file part of an intercepted multipart body — the
 * bytes never cross into Node — so the upload is inspected where it is made:
 * a fetch wrapper reads the File out of the FormData before it leaves.
 */
type Upload = {
  name: string
  type: string
  size: number
  head: string
  pages: number
  /** Top-left pixel of the encoded result, to prove what the reader will see. */
  corner: [number, number, number] | null
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
            pages: text.split('/Type /Page ').length - 1,
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

  return () =>
    page.evaluate(() => (window as unknown as { __upload?: Upload }).__upload ?? null)
}

test.describe('uploading a receipt', () => {
  test('a two-page PDF is uploaded whole, every byte and both pages', async ({ page }) => {
    const uploaded = await captureUpload(page)
    const fixture = fs.readFileSync(PDF)

    await page.goto('/new')
    await page.locator('input[type="file"]').last().setInputFiles(PDF)

    // No broken <img>: a PDF gets the placeholder, not a preview that can't load.
    await expect(page.getByText('PDF', { exact: true })).toBeVisible()
    await expect(page.getByText('receipt-2page.pdf')).toBeVisible()

    await page.getByRole('button', { name: /read this receipt/i }).click()
    await expect(page.getByRole('heading', { name: /check the items/i })).toBeVisible()

    const sent = await uploaded()
    expect(sent, 'the extract route was called').not.toBeNull()

    // The PDF itself, untouched — not re-encoded to JPEG, not cut short.
    expect(sent).toMatchObject({
      name: 'receipt-2page.pdf',
      type: 'application/pdf',
      size: fixture.byteLength,
      head: '%PDF-1.4',
    })

    // Both page objects survive the trip. Page 2 is the half that used to vanish.
    expect(sent?.pages).toBe(2)
  })

  test('a photo still goes through the canvas, stripped and renamed', async ({ page }) => {
    const uploaded = await captureUpload(page)

    await page.goto('/new')
    await page.locator('input[type="file"]').last().setInputFiles(JPG)
    await page.getByRole('button', { name: /read this receipt/i }).click()
    await expect(page.getByRole('heading', { name: /check the items/i })).toBeVisible()

    const sent = await uploaded()
    expect(sent, 'the extract route was called').not.toBeNull()
    expect(sent?.name).toBe('receipt.jpg')
    expect(sent?.type).toBe('image/jpeg')
    // JPEG magic bytes: still a real photo after the canvas round-trip that
    // strips EXIF, and nothing near the 0-byte encode mobile Safari once gave.
    expect(sent?.head.slice(0, 3)).toBe('\xff\xd8\xff')
    expect(sent?.size).toBeGreaterThan(5_000)
  })

  test('a transparent PNG is flattened onto white, not onto black', async ({ page }) => {
    // JPEG has no alpha, so every transparent pixel encodes as black and the
    // reader sees a black rectangle. Proved against the real OCR provider:
    // the same PNG returns empty text with alpha and reads perfectly without.
    const uploaded = await captureUpload(page)

    await page.goto('/new')
    await page.locator('input[type="file"]').last().setInputFiles(ALPHA_PNG)
    await page.getByRole('button', { name: /read this receipt/i }).click()
    await expect(page.getByRole('heading', { name: /check the items/i })).toBeVisible()

    const sent = await uploaded()
    expect(sent?.type).toBe('image/jpeg')
    const corner = sent?.corner
    expect(corner, 'the uploaded image could be decoded').not.toBeNull()
    for (const channel of corner ?? []) expect(channel).toBeGreaterThan(200)
  })

  test('every item of a long receipt reaches the review step', async ({ page }) => {
    await captureUpload(page)

    await page.goto('/new')
    await page.locator('input[type="file"]').last().setInputFiles(PDF)
    await page.getByRole('button', { name: /read this receipt/i }).click()
    await expect(page.getByRole('heading', { name: /check the items/i })).toBeVisible()

    // First, last, and the count between them — nothing dropped in the middle.
    await expect(page.getByLabel('Item 1 name')).toHaveValue('Item 001')
    await expect(page.getByLabel(`Item ${ITEM_COUNT} name`)).toHaveValue(
      `Item ${String(ITEM_COUNT).padStart(3, '0')}`,
    )
    await expect(page.locator('input[aria-label$=" name"]')).toHaveCount(ITEM_COUNT)
  })
})
