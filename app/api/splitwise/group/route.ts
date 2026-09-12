import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createGroup, displayName, SplitwiseError } from '@/lib/splitwise'
import { getSession, ownerId } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'

export const runtime = 'nodejs'

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  memberIds: z.array(z.number().int()).min(1).max(30),
})

export async function POST(req: Request) {
  const session = await getSession()
  if (!session.accessToken) {
    return NextResponse.json({ message: 'Sign in with Splitwise first.' }, { status: 401 })
  }
  const limit = rateLimit('group:' + ownerId(session), 10, 3600)
  if (!limit.ok) return NextResponse.json({ message: 'Try again in a little while.' }, { status: 429 })
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ message: 'Give the new group a name and at least one person.' }, { status: 400 })
  }
  try {
    const group = await createGroup(session.accessToken, parsed.data)
    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        updatedAt: group.updated_at ?? null,
        members: group.members.map((member) => ({ id: member.id, name: displayName(member) })),
      },
    })
  } catch (error) {
    const status = error instanceof SplitwiseError && error.needsReauth ? 401 : 502
    return NextResponse.json(
      { message: status === 401 ? 'Your Splitwise connection expired.' : 'Couldn’t create that group.' },
      { status },
    )
  }
}
