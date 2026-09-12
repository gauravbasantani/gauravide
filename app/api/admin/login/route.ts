import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminSignInAvailable, checkAdminCredentials, startAdminSession } from '@/lib/adminAuth'
import { rateLimit } from '@/lib/ratelimit'

export const runtime = 'nodejs'

const Body = z.object({
  username: z.string().max(100),
  password: z.string().max(200),
})

const json = (status: number, message: string, headers?: Record<string, string>) =>
  NextResponse.json({ message }, { status, headers })

export async function POST(req: Request) {
  if (!(await adminSignInAvailable())) return json(503, 'Admin sign-in isn’t switched on yet.')

  // 10 tries per network per 15 minutes, 30 per hour overall: guessing is hopeless.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const perNetwork = rateLimit(`admin-login:${ip}`, 10, 15 * 60)
  const overall = rateLimit('admin-login:all', 30, 60 * 60)
  const limited = !perNetwork.ok ? perNetwork : !overall.ok ? overall : null
  if (limited && !limited.ok) {
    return json(
      429,
      `Too many attempts. Try again in ${Math.max(1, Math.ceil(limited.retryAfterSeconds / 60))} minutes.`,
      { 'retry-after': String(limited.retryAfterSeconds) },
    )
  }

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json(400, 'Enter your username and password.')

  const ok = await checkAdminCredentials(parsed.data.username, parsed.data.password)
  if (!ok) {
    // One message for both cases, so it never reveals which part was wrong.
    await new Promise((resolve) => setTimeout(resolve, 400))
    console.warn('[admin] sign-in refused')
    return json(401, 'That username and password don’t match.')
  }

  await startAdminSession(new URL(req.url).protocol === 'https:')
  console.info('[admin] signed in') // SEC-29: admin access is logged
  return NextResponse.json({ ok: true })
}
