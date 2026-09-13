/**
 * Send one test alert to the admin address (FB-10).
 *
 * Feedback alerts are the kind of thing you only discover is broken when a
 * message you never heard about turns up in the database weeks later. This
 * route makes the delivery path checkable on demand: press the button, watch
 * for the email. Admin-only, and rate limited because it sends real mail.
 */
import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/adminAuth'
import { adminEmail, emailConfigured, EmailError, maskEmail, sendAdminEmail } from '@/lib/email'
import { rateLimit } from '@/lib/ratelimit'

export const runtime = 'nodejs'

const json = (status: number, message: string) => NextResponse.json({ message }, { status })

export async function POST() {
  if (!(await isAdminRequest())) return json(404, 'Not found.')
  if (!emailConfigured()) {
    return json(
      503,
      'No email provider is configured, so nothing was sent. Set RESEND_API_KEY and redeploy.',
    )
  }

  const limit = rateLimit('admin-test-email', 5, 60 * 60)
  if (!limit.ok) return json(429, 'A few test emails already went out. Try again in a little while.')

  try {
    await sendAdminEmail(
      'Gauravide feedback alerts are working',
      [
        'This is a test, sent from the admin dashboard.',
        '',
        'If you are reading it, feedback sent through the contact form will reach you the same way.',
        '',
        'Nothing needs doing.',
      ].join('\n'),
    )
    return NextResponse.json({ message: `Sent to ${maskEmail(adminEmail())}. Check that inbox — and spam, the first time.` })
  } catch (error) {
    // The provider's own reason is far more useful than "it failed" — an
    // unverified sending domain and a wrong key look identical otherwise.
    return json(
      502,
      error instanceof EmailError
        ? `The email provider refused it: ${error.message}`
        : 'Couldn’t send the test email.',
    )
  }
}
