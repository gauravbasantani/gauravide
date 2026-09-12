/**
 * How many expenses this person has sent recently (FR-47).
 *
 * Splitwise publishes no numbers ("rate limits vary by endpoint … subject to
 * change"), so the only figure we can state honestly is our own: 30 sends per
 * hour per account. The 24-hour count is shown because people ask "how many
 * can I add?" — it comes from our own event log, never from Splitwise.
 */
import { NextResponse } from 'next/server'
import { dbConfigured, selectWhere } from '@/lib/db'
import { getSession, ownerId } from '@/lib/session'

export const runtime = 'nodejs'

// Matches the limiter in the submit route. A route file may only export
// handlers and config, so this stays local.
const HOURLY_LIMIT = 30

export async function GET() {
  const session = await getSession()
  if (!session.accessToken) return NextResponse.json({ signedIn: false }, { status: 200 })
  if (!dbConfigured) {
    return NextResponse.json({ signedIn: true, hourlyLimit: HOURLY_LIMIT, counted: false })
  }

  const owner = ownerId(session)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  try {
    const rows = await selectWhere<{ created_at: string }>(
      'events',
      {
        user_key: `eq.${owner}`,
        name: 'eq.split_submitted',
        created_at: `gte.${since}`,
      },
      'created_at',
      500,
    )
    const hourAgo = Date.now() - 60 * 60 * 1000
    const lastHour = rows.filter((row) => Date.parse(row.created_at) >= hourAgo).length
    return NextResponse.json({
      signedIn: true,
      counted: true,
      lastHour,
      last24h: rows.length,
      hourlyLimit: HOURLY_LIMIT,
      remainingThisHour: Math.max(0, HOURLY_LIMIT - lastHour),
    })
  } catch {
    return NextResponse.json({ signedIn: true, hourlyLimit: HOURLY_LIMIT, counted: false })
  }
}
