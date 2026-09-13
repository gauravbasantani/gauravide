import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, ownerId } from '@/lib/session'
import { insert, dbConfigured } from '@/lib/db'
import { rateLimit } from '@/lib/ratelimit'
import { emailConfigured, feedbackNotification, sendAdminEmail } from '@/lib/email'

export const runtime = 'nodejs'

const Body = z.object({
  category: z.enum(['bug', 'suggestion', 'question', 'other']),
  message: z.string().min(1).max(4000),
  contact: z.string().max(200).optional(),
  /** Off by default, and never carries receipt or item data (FB-5). */
  diagnostics: z
    .object({
      userAgent: z.string().max(300).optional(),
      screen: z.string().max(40).optional(),
      path: z.string().max(200).optional(),
    })
    .optional(),
})

export async function POST(req: Request) {
  const session = await getSession()

  // Sign-in isn't required, but the session id gives us a rate-limit key
  // without a CAPTCHA (FB-3, FB-9).
  const limit = rateLimit(`feedback:${ownerId(session)}`, 5, 3600)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'That’s a few already — try again in a little while.' },
      { status: 429 },
    )
  }

  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid', message: 'Please write a message before sending.' },
      { status: 400 },
    )
  }

  if (!dbConfigured) {
    return NextResponse.json(
      { error: 'unavailable', message: 'Feedback isn’t set up yet — sorry.' },
      { status: 503 },
    )
  }

  try {
    await insert('feedback', {
      user_key: ownerId(session),
      category: parsed.data.category,
      message: parsed.data.message,
      contact: parsed.data.contact ?? null,
      diagnostics: parsed.data.diagnostics ?? null,
    })
    // A reference the user can quote back to us, without exposing a row id.
    const reference = crypto.randomUUID().slice(0, 8)

    // The database is the source of truth. A delivery problem must never tell
    // someone their feedback failed after we have safely recorded it.
    if (emailConfigured()) {
      const notification = feedbackNotification({ ...parsed.data, reference })
      try {
        await sendAdminEmail(notification.subject, notification.text)
      } catch (error) {
        console.error(`[feedback] notification email failed: ${error instanceof Error ? error.name : 'unknown'}`)
      }
    }

    return NextResponse.json({ ok: true, reference })
  } catch {
    console.error('[feedback] insert failed')
    return NextResponse.json(
      {
        error: 'failed',
        message: 'Couldn’t send that just now. Your message is still in the box — try again.',
      },
      { status: 502 },
    )
  }
}
