import { NextResponse } from 'next/server'
import { z } from 'zod'
import { addUsersToGroup, SplitwiseError } from '@/lib/splitwise'
import { getSession, ownerId } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'

export const runtime = 'nodejs'

const Body = z.object({
  groupId: z.number().int().positive(),
  memberIds: z.array(z.number().int()).min(1).max(30),
})

export async function POST(req: Request) {
  const session = await getSession()
  if (!session.accessToken) {
    return NextResponse.json({ message: 'Sign in with Splitwise first.' }, { status: 401 })
  }
  const limit = rateLimit('group-members:' + ownerId(session), 30, 3600)
  if (!limit.ok) return NextResponse.json({ message: 'Try again in a little while.' }, { status: 429 })
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ message: 'Choose a group and at least one person.' }, { status: 400 })
  }
  try {
    await addUsersToGroup(session.accessToken, parsed.data.groupId, parsed.data.memberIds)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const status = error instanceof SplitwiseError && error.needsReauth ? 401 : 502
    return NextResponse.json(
      {
        message:
          status === 401
            ? 'Your Splitwise connection expired.'
            : 'Splitwise could not add everyone to that group. No expense was submitted; check the group before trying again because some people may already have been added.',
      },
      { status },
    )
  }
}
