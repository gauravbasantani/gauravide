import { test, expect, type Page } from '@playwright/test'

/** Fail the test on any console error or page exception — a hydration
 *  failure shows up here long before a human notices dead buttons. */
function captureErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  return errors
}

test('landing page renders and has no console errors', async ({ page }) => {
  const errors = captureErrors(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: /split a receipt/i }).first()).toBeVisible()
  expect(errors).toEqual([])
})

test('THE BUG: "Type it in" advances to the review step', async ({ page }) => {
  const errors = captureErrors(page)
  await page.goto('/new')

  // If React never hydrates, this click does nothing and the assertion fails.
  await page.getByRole('button', { name: 'Type it in' }).click()

  await expect(page.getByRole('heading', { name: /check the items/i })).toBeVisible({
    timeout: 10_000,
  })
  expect(errors).toEqual([])
})

test('file input is a real input that accepts a file', async ({ page }) => {
  await page.goto('/new')
  const input = page.locator('input[type="file"]').nth(1) // "Choose a file"
  await expect(input).toBeAttached()
  await expect(input).toHaveAttribute('accept', /image\/jpeg/)
})

test('every navigated route responds', async ({ page }) => {
  for (const path of ['/', '/new', '/about', '/faq', '/contact']) {
    const res = await page.goto(path)
    expect(res?.status(), `${path} should be 200`).toBe(200)
  }
})

test('nav and footer links all resolve', async ({ page }) => {
  await page.goto('/')
  const hrefs = await page.locator('a[href^="/"]').evaluateAll((els) =>
    [...new Set(els.map((e) => (e as HTMLAnchorElement).getAttribute('href')!))],
  )
  for (const href of hrefs) {
    const res = await page.request.get(href)
    expect(res.status(), `${href} should not 404`).toBeLessThan(400)
  }
})
