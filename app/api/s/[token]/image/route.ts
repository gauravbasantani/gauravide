/**
 * The receipt photo behind a share link (FR-53).
 *
 * The token is the whole authorisation: it is unguessable, it names exactly
 * one split, and revoking it makes this route return "not found" like any
 * other unknown link. The storage bucket itself stays private — the bytes only
 * ever reach a browser through here.
 */
import { NextResponse } from 'next/server'
import { dbConfigured } from '@/lib/db'
import { splitByShareToken } from '@/lib/share'
import { getObject, RECEIPTS_BUCKET } from '@/lib/storage'

export const runtime = 'nodejs'

const json = (status: number, message: string) => NextResponse.json({ message }, { status })

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!dbConfigured) return json(404, 'Not found.')
  try {
    const { token } = await params
    const split = await splitByShareToken(token)
    if (!split?.image_path) return json(404, 'Not found.')
    const object = await getObject(RECEIPTS_BUCKET, split.image_path)
    if (!object) return json(404, 'Not found.')
    return new NextResponse(object.body, {
      headers: {
        'content-type': object.contentType,
        // Held only by the browser that has the link, and only briefly, so
        // revoking a link takes effect quickly.
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
        'x-robots-tag': 'noindex, nofollow',
      },
    })
  } catch {
    return json(502, 'Couldn’t load the photo.')
  }
}
