/**
 * The read-only share link for one saved split (FR-53).
 *
 * POST hands back a link — creating one the first time, returning the same one
 * afterwards, so sharing twice never invalidates a link a friend already has.
 * DELETE throws the token away, and the old link stops working immediately.
 *
 * Both are owner-only. Anyone holding the link reads it through /s/[token],
 * which never touches this route.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConfigured, selectOneOwned } from '@/lib/db'
import { NOT_REMOVED, type StoredSplit } from '@/lib/history'
import { getSession, ownerId } from '@/lib/session'
import { ensureShareToken, revokeShareToken, shareUrl } from '@/lib/share'

export const runtime = 'nodejs'

const SplitId = z.string().uuid()
const json = (status: number, message: string) => NextResponse.json({ message }, { status })

async function ownedSplit(params: Promise<{ id: string }>) {
  const session = await getSession()
  if (!session.accessToken) return { error: json(401, 'Sign in first.') } as const
  const { id } = await params
  if (!SplitId.safeParse(id).success) {
    return { error: json(404, 'That saved split was not found.') } as const
  }
  const split = await selectOneOwned<StoredSplit>('splits', ownerId(session), id, NOT_REMOVED)
  if (!split) return { error: json(404, 'That saved split was not found.') } as const
  return { split } as const
}

/** The origin this request arrived on, so a preview deployment links to itself. */
function originOf(req: Request): string {
  try {
    return new URL(req.url).origin
  } catch {
    return ''
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!dbConfigured) return json(503, 'Sharing is unavailable.')
  try {
    const found = await ownedSplit(params)
    if ('error' in found) return found.error
    const token = await ensureShareToken(found.split)
    return NextResponse.json({ token, url: shareUrl(token, originOf(req)) })
  } catch {
    return json(502, 'Couldn’t create a share link. Try again.')
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!dbConfigured) return json(503, 'Sharing is unavailable.')
  try {
    const found = await ownedSplit(params)
    if ('error' in found) return found.error
    if (!found.split.data.shareToken) return NextResponse.json({ ok: true })
    const revoked = await revokeShareToken(found.split)
    return NextResponse.json({ ok: revoked })
  } catch {
    return json(502, 'Couldn’t turn the link off. Try again.')
  }
}
