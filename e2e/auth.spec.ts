import { test, expect } from '@playwright/test'

/**
 * Verifies the OAuth handshake up to the point where a human must type a
 * password. Everything before that is ours and must be provably correct.
 */
test.describe('Splitwise sign-in', () => {
  test('login route redirects to Splitwise with correct parameters', async ({ page }) => {
    const res = await page.request.get('/api/auth/login', { maxRedirects: 0 })

    expect(res.status(), 'should redirect, not 404').toBe(307)

    const location = res.headers()['location'] ?? ''
    expect(location).toContain('https://secure.splitwise.com/oauth/authorize')

    const url = new URL(location)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id'), 'client id must be set').toBeTruthy()
    expect(url.searchParams.get('state'), 'CSRF state must be set').toBeTruthy()
    expect(url.searchParams.get('redirect_uri')).toContain('/api/auth/callback')
  })

  test('Splitwise accepts our authorize URL — it does not 404', async ({ page }) => {
    const res = await page.request.get('/api/auth/login', { maxRedirects: 0 })
    const location = res.headers()['location'] ?? ''

    const swResponse = await page.request.get(location, { maxRedirects: 0 })
    // 200 = approval page, 302 = redirect to their login. Both are healthy.
    // 404 would mean our client_id or URL is wrong.
    expect([200, 302], `Splitwise returned ${swResponse.status()}`).toContain(swResponse.status())
  })

  test('state is stored in an HttpOnly cookie', async ({ page, context }) => {
    await page.request.get('/api/auth/login', { maxRedirects: 0 })
    const cookies = await context.cookies()
    const state = cookies.find((c) => c.name === 'gv_oauth_state')
    expect(state, 'state cookie must exist').toBeTruthy()
    expect(state?.httpOnly, 'must not be readable by JavaScript').toBe(true)
    expect(state?.sameSite).toBe('Lax')
  })

  test('callback rejects a forged state', async ({ page }) => {
    const res = await page.request.get('/api/auth/callback?code=fake&state=forged', {
      maxRedirects: 0,
    })
    const location = res.headers()['location'] ?? ''
    expect(location, 'a mismatched state must be refused').toContain('auth_error=state')
  })

  test('the sign-in link on the page points at our login route', async ({ page }) => {
    await page.goto('/')
    const link = page.getByRole('link', { name: /sign in/i }).first()
    await expect(link).toHaveAttribute('href', /\/api\/auth\/login/)
  })

  test('me endpoint reports signed out without a token', async ({ page }) => {
    const res = await page.request.get('/api/splitwise/me')
    expect(res.status()).toBe(200)
    expect((await res.json()).signedIn).toBe(false)
  })
})
