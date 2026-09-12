import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getCurrentUser, getFriends, getGroups, displayName, SplitwiseError } from '@/lib/splitwise'

export const runtime = 'nodejs'

/**
 * Everything the flow needs about the signed-in user, fetched once so the
 * assignment screen never waits on a network call (FR-11a).
 */
export async function GET() {
  const session = await getSession()
  if (!session.accessToken) {
    return NextResponse.json({ signedIn: false }, { status: 200 })
  }

  try {
    const [me, groups, friends] = await Promise.all([
      getCurrentUser(session.accessToken),
      getGroups(session.accessToken),
      getFriends(session.accessToken),
    ])

    return NextResponse.json({
      signedIn: true,
      me: { id: me.id, name: displayName(me) },
      groups: groups
        .filter((g) => g.id !== 0) // id 0 is the "non-group expenses" pseudo-group
        .map((g) => ({
          id: g.id,
          name: g.name,
          updatedAt: g.updated_at ?? null,
          members: g.members.map((m) => ({ id: m.id, name: displayName(m) })),
        })),
      friends: friends.map((f) => ({ id: f.id, name: displayName(f) })),
    })
  } catch (err) {
    if (err instanceof SplitwiseError && err.needsReauth) {
      // Access revoked or token expired. Say so; don't lose their split (GAP-5).
      return NextResponse.json(
        { signedIn: false, reauth: true, message: 'You’ve been signed out of Splitwise.' },
        { status: 200 },
      )
    }
    return NextResponse.json(
      { signedIn: true, error: 'splitwise_unavailable', message: 'Couldn’t reach Splitwise.' },
      { status: 502 },
    )
  }
}
