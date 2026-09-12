import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  checkAdminCredentials,
  currentAdmin,
  isAdminRequest,
  passwordProblem,
  setAdminPassword,
} from '@/lib/adminAuth'
import { rateLimit } from '@/lib/ratelimit'

export const runtime = 'nodejs'

const Body = z.object({ current: z.string().max(200), next: z.string().max(200) })

const json = (status: number, message: string) => NextResponse.json({ message }, { status })

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return json(401, 'Sign in first.')

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limit = rateLimit(`admin-password:${ip}`, 10, 60 * 60)
  if (!limit.ok) return json(429, 'Too many attempts. Try again later.')

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json(400, 'Enter your current and new password.')

  const problem = passwordProblem(parsed.data.next)
  if (problem) return json(400, problem)

  const admin = await currentAdmin()
  if (!admin) return json(503, 'Admin sign-in isn’t switched on yet.')

  // Knowing the current password is required even though you're signed in:
  // a borrowed laptop must not be enough to take the account over.
  if (!(await checkAdminCredentials(admin.username, parsed.data.current))) {
    await new Promise((resolve) => setTimeout(resolve, 400))
    return json(401, 'That current password doesn’t match.')
  }

  await setAdminPassword(parsed.data.next)
  console.info('[admin] password changed')
  return NextResponse.json({ ok: true })
}
