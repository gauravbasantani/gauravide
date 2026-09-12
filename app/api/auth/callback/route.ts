import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { appBaseUrl, callbackUrl, exchangeCode, getCurrentUser } from '@/lib/splitwise'
import { getSession, writeSession } from '@/lib/session'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const jar = await cookies()
  const base = appBaseUrl(req.url)

  const fail = (reason: string) =>
    NextResponse.redirect(`${base}/?auth_error=${encodeURIComponent(reason)}`)

  // The user pressed "deny", or Splitwise returned an error.
  if (url.searchParams.get('error')) return fail('declined')

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const expected = jar.get('gv_oauth_state')?.value

  // Verify state BEFORE touching the code (SEC-4).
  if (!code || !state || !expected || state !== expected) return fail('state')

  jar.delete('gv_oauth_state')

  try {
    const token = await exchangeCode(code, callbackUrl(req.url))
    const user = await getCurrentUser(token)

    // The token lives only in the encrypted cookie — never in the database,
    // never in a response body (SEC-2, SEC-24).
    const session = await getSession()
    await writeSession({
      ...session,
      splitwiseUserId: String(user.id),
      accessToken: token,
    })

    const next = jar.get('gv_oauth_next')?.value
    jar.delete('gv_oauth_next')
    const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
    return NextResponse.redirect(`${base}${target}`)
  } catch {
    // Error type only — never the exchange body, which carries the secret.
    console.error('[auth] token exchange failed')
    return fail('exchange')
  }
}
