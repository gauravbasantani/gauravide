import { test, expect, type Page } from '@playwright/test'

/**
 * Manual entry with one priced item, so "Looks right" is enabled — on a page
 * mocked as signed in, because the people step has no signed-out path.
 */
async function reachAssignStep(page: Page) {
  await page.route('**/api/splitwise/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        signedIn: true,
        me: { id: 101, name: 'Gaurav' },
        friends: [{ id: 202, name: 'Alex' }],
        groups: [],
      }),
    }),
  )
  await page.goto('/new')
  await page.getByRole('button', { name: 'Type it in' }).click()
  await page.getByRole('button', { name: /add item/i }).click()
  await page.getByLabel(/item 1 name/i).fill('Pizza')
  await page.getByLabel(/price of/i).fill('24.00')
  await page.getByRole('button', { name: /looks right/i }).click()
  await expect(page.getByRole('heading', { name: /who’s splitting this/i })).toBeVisible()
}

/**
 * Regression tests for bugs found by the adversarial audit. Each one is a
 * real defect that shipped and was verified by reading the code.
 */

test('AUDIT: typing in the Add-person sheet does not lose focus', async ({ page }) => {
  // The Sheet effect re-ran on every parent render because callers pass an
  // inline onClose. Every keystroke yanked focus out of the dialog.
  await reachAssignStep(page)
  await page.getByRole('button', { name: /add person/i }).click()

  const field = page.getByLabel(/name or friend search/i)
  await field.click()
  await field.pressSequentially('Maya', { delay: 40 })

  // If focus were being stolen, only the first character would land.
  await expect(field).toHaveValue('Maya')
  await expect(field).toBeFocused()
})

test('AUDIT: a busy button keeps its accessible name and stays focusable', async ({ page }) => {
  await page.goto('/dev/tokens')
  const busy = page.getByRole('button', { name: 'Adding…' })
  await expect(busy, 'a loading button must still be findable by its name').toBeVisible()
  await expect(busy).toHaveAttribute('aria-busy', 'true')
  // Focusable: a disabled button would drop out of the tab order entirely.
  await busy.focus()
  await expect(busy).toBeFocused()
})

test('AUDIT: a disabled button always explains why', async ({ page }) => {
  await reachAssignStep(page)

  const review = page.getByRole('button', { name: /next: who paid/i })
  await expect(review).toBeDisabled()
  const describedBy = await review.getAttribute('aria-describedby')
  expect(describedBy, 'must point at a reason').toBeTruthy()
  // Signed in, you are already in the split, so the outstanding reason is the
  // unassigned item. What matters is that there IS a reason, and it is specific.
  await expect(page.locator(`#${describedBy}`)).toContainText(/still needs? someone/i)
})

test('AUDIT: Escape closes the sheet and returns focus to its trigger', async ({
  page,
  isMobile,
}) => {
  // Escape is a keyboard interaction; a touch device has no Escape key, and
  // focus-follows-tap behaves differently there. On mobile the equivalent is
  // the Cancel button.
  test.skip(Boolean(isMobile), 'no Escape key on a touch device')

  await reachAssignStep(page)

  const trigger = page.getByRole('button', { name: /add person/i })
  await trigger.click()
  await expect(page.getByRole('dialog')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('AUDIT: Cancel closes the sheet on any device', async ({ page }) => {
  await reachAssignStep(page)

  await page.getByRole('button', { name: /add person/i }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  await page.getByRole('button', { name: /^cancel$/i }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
})
