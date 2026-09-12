import { test, expect } from '@playwright/test'
import path from 'node:path'

const RECEIPT = path.resolve('e2e/fixtures/receipt.jpg')

test('what does the browser actually upload?', async ({ page }) => {
  test.setTimeout(120_000)

  const log: string[] = []
  page.on('console', (m) => log.push(`${m.type()}: ${m.text()}`))
  page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`))

  // Inspect the outgoing multipart size — a canvas failure shows up as a
  // tiny or missing body.
  page.on('request', (req) => {
    if (req.url().includes('/api/receipt/extract')) {
      log.push(`REQUEST bytes=${req.postDataBuffer()?.length ?? 'none'}`)
    }
  })
  page.on('response', async (res) => {
    if (res.url().includes('/api/receipt/extract')) {
      const body = await res.text().catch(() => '')
      log.push(`RESPONSE ${res.status()} ${body.slice(0, 300)}`)
    }
  })

  await page.goto('/new')

  // Does this browser support the API we rely on?
  const support = await page.evaluate(async () => {
    const out: Record<string, unknown> = {
      createImageBitmap: typeof createImageBitmap,
    }
    try {
      const blob = await fetch(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      ).then((r) => r.blob())
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' })
      out.withOptions = `ok ${bmp.width}x${bmp.height}`
    } catch (e) {
      out.withOptions = `THREW: ${(e as Error).message}`
    }
    return out
  })
  log.push(`SUPPORT ${JSON.stringify(support)}`)

  await page.locator('input[type="file"]').nth(1).setInputFiles(RECEIPT)
  await expect(page.getByText(/receipt ready/i)).toBeVisible()
  await page.getByRole('button', { name: /read this receipt/i }).click()
  await expect(page.getByRole('heading', { name: /check the items/i })).toBeVisible({
    timeout: 90_000,
  })

  const itemCount = await page.getByLabel(/item \d+ name/i).count()
  log.push(`ITEMS RENDERED: ${itemCount}`)

  console.log('\n===== DIAGNOSTIC =====\n' + log.join('\n') + '\n======================\n')
})
