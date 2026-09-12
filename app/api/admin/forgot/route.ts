import { NextResponse } from 'next/server'
import { adminSignInAvailable, createResetToken } from '@/lib/adminAuth'
import { adminEmail, emailConfigured, maskEmail, sendAdminEmail } from '@/lib/email'
import { rateLimit } from '@/lib/ratelimit'
import { appBaseUrl } from '@/lib/splitwise'

export const runtime = 'nodejs'

const json = (status: number, message: string) => NextResponse.json({ message }, { status })

export async function POST(req: Request) {
  if (!(await adminSignInAvailable())) return json(503, 'Admin sign-in isn’t switched on yet.')
  if (!emailConfigured()) {
    return json(
      503,
      'Email isn’t set up on this deployment. Reset it from your machine: run “npm run admin:password”, then update ADMIN_PASSWORD_HASH in Vercel.',
    )
  }

  // A reset link is an email to one fixed address; a few a day is plenty.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limit = rateLimit(`admin-forgot:${ip}`, 3, 60 * 60)
  const overall = rateLimit('admin-forgot:all', 6, 60 * 60)
  if (!limit.ok || !overall.ok) {
    return json(429, 'A reset link was already sent recently. Check your inbox, or try again later.')
  }

  try {
    const reset = await createResetToken()
    if (!reset) return json(503, 'Admin sign-in isn’t switched on yet.')
    const link = `${appBaseUrl(req.url)}/admin/reset?token=${encodeURIComponent(reset.token)}`
    await sendAdminEmail(
      'Reset your Gauravide admin password',
      [
        'Someone asked to reset the Gauravide admin password.',
        '',
        `Open this link within ${reset.minutes} minutes to choose a new one:`,
        link,
        '',
        'The link works once. If this wasn’t you, ignore this email — the current password still works, and nobody can use this link without it.',
      ].join('\n'),
    )
    console.info('[admin] reset link sent')
    return NextResponse.json({ ok: true, sentTo: maskEmail(adminEmail()), minutes: reset.minutes })
  } catch (error) {
    console.error(`[admin] reset email failed: ${error instanceof Error ? error.name : 'unknown'}`)
    return json(502, 'Couldn’t send the reset email. Try again in a moment.')
  }
}
