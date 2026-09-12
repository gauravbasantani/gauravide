import { NextResponse } from 'next/server'
import { z } from 'zod'
import { passwordProblem, resetPasswordWithToken, startAdminSession } from '@/lib/adminAuth'
import { rateLimit } from '@/lib/ratelimit'

export const runtime = 'nodejs'

const Body = z.object({ token: z.string().min(10).max(200), password: z.string().max(200) })

const json = (status: number, message: string) => NextResponse.json({ message }, { status })

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limit = rateLimit(`admin-reset:${ip}`, 10, 60 * 60)
  if (!limit.ok) return json(429, 'Too many attempts. Try again later.')

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json(400, 'That reset link looks wrong. Ask for a new one.')

  const problem = passwordProblem(parsed.data.password)
  if (problem) return json(400, problem)

  const ok = await resetPasswordWithToken(parsed.data.token, parsed.data.password)
  if (!ok) {
    await new Promise((resolve) => setTimeout(resolve, 400))
    return json(400, 'That reset link has expired or was already used. Ask for a new one.')
  }

  // Signed in straight away, so you never bounce off the sign-in page.
  await startAdminSession(new URL(req.url).protocol === 'https:')
  console.info('[admin] password reset')
  return NextResponse.json({ ok: true })
}
