import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { authorizeUrl, callbackUrl, splitwiseConfigured } from '@/lib/splitwise'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  if (!splitwiseConfigured()) {
    return NextResponse.json(
      { error: 'not_configured', message: 'Splitwise sign-in is not set up yet.' },
      { status: 503 },
    )
  }

  // Random state, stored in a short-lived cookie and verified on the way back.
  // This is the CSRF defence for the login flow (SEC-4).
  const state = crypto.randomUUID()
  const jar = await cookies()
  jar.set('gv_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutes is plenty to log in
  })

  // Where to land after sign-in. Same-origin paths only — never a
  // user-supplied absolute URL, which would be an open redirect (SEC-5).
  const next = new URL(req.url).searchParams.get('next') ?? '/'
  if (next.startsWith('/') && !next.startsWith('//')) {
    jar.set('gv_oauth_next', next, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    })
  }

  return NextResponse.redirect(authorizeUrl(state, callbackUrl(req.url)))
}
