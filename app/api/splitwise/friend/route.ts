import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createFriend, displayName, SplitwiseError } from '@/lib/splitwise'
import { getSession, ownerId } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'

export const runtime = 'nodejs'

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
})

export async function POST(req: Request) {
  const session = await getSession()
  if (!session.accessToken) {
    return NextResponse.json({ message: 'Sign in with Splitwise first.' }, { status: 401 })
  }
  const limit = rateLimit('friend:' + ownerId(session), 20, 3600)
  if (!limit.ok) {
    return NextResponse.json({ message: 'Try adding people again in a little while.' }, { status: 429 })
  }
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ message: 'Enter a name and a valid email address.' }, { status: 400 })
  }
  try {
    const friend = await createFriend(session.accessToken, parsed.data)
    return NextResponse.json({ person: { id: friend.id, name: displayName(friend) } })
  } catch (error) {
    const status = error instanceof SplitwiseError && error.needsReauth ? 401 : 502
    return NextResponse.json(
      {
        message:
          status === 401
            ? 'Your Splitwise connection expired. Sign in again, then retry.'
            : 'Splitwise could not add that person. Check the email and try again.',
      },
      { status },
    )
  }
}
