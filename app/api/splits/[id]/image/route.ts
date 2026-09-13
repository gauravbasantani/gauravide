/**
 * The receipt photo of one saved split (FR-38).
 *
 * GET streams it to its owner only. POST stores it once, right after the
 * expense reaches Splitwise. Both check ownership against the session first;
 * the storage bucket itself is private.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConfigured, selectOneOwned, updateOwned } from '@/lib/db'
import { NOT_REMOVED, type StoredSplit } from '@/lib/history'
import { getSession, ownerId } from '@/lib/session'
import { stripJpegMetadata } from '@/lib/exif'
import { rateLimit } from '@/lib/ratelimit'
import { getObject, MAX_IMAGE_BYTES, putObject, RECEIPTS_BUCKET, StorageError } from '@/lib/storage'

export const runtime = 'nodejs'

const SplitId = z.string().uuid()
const json = (status: number, message: string) => NextResponse.json({ message }, { status })

/** Magic bytes — the extension is a claim, not evidence (SEC-9). */
function sniff(b: Uint8Array): { mime: string; ext: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' }
  }
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42) {
    return { mime: 'image/webp', ext: 'webp' }
  }
  return null
}

async function ownedSplit(params: Promise<{ id: string }>) {
  const session = await getSession()
  if (!session.accessToken) return { error: json(401, 'Sign in first.') } as const
  const { id } = await params
  if (!SplitId.safeParse(id).success) return { error: json(404, 'Not found.') } as const
  const owner = ownerId(session)
  const split = await selectOneOwned<StoredSplit>('splits', owner, id, NOT_REMOVED)
  if (!split) return { error: json(404, 'Not found.') } as const
  return { owner, split } as const
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!dbConfigured) return json(404, 'Not found.')
  try {
    const found = await ownedSplit(params)
    if ('error' in found) return found.error
    if (!found.split.image_path) return json(404, 'No photo was kept for this split.')
    const object = await getObject(RECEIPTS_BUCKET, found.split.image_path)
    if (!object) return json(404, 'No photo was kept for this split.')
    return new NextResponse(object.body, {
      headers: {
        'content-type': object.contentType,
        'cache-control': 'private, max-age=3600',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch {
    return json(502, 'Couldn’t load the photo.')
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!dbConfigured) return json(503, 'Photo storage is unavailable.')
  try {
    const found = await ownedSplit(params)
    if ('error' in found) return found.error

    const limit = rateLimit(`photo:${found.owner}`, 30, 3600)
    if (!limit.ok) return json(429, 'Try again in a little while.')

    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return json(400, 'No photo was received.')
    if (file.size > MAX_IMAGE_BYTES) return json(413, 'That photo is too large to keep.')

    const bytes = new Uint8Array(await file.arrayBuffer())
    const type = sniff(bytes)
    if (!type) return json(415, 'Only JPG, PNG or WEBP photos can be kept.')
    // GPS must not depend on the browser having stripped it (GAP-4).
    const clean = type.mime === 'image/jpeg' ? stripJpegMetadata(bytes) : bytes

    const path = `${found.owner}/${found.split.id}.${type.ext}`
    await putObject(RECEIPTS_BUCKET, path, clean, type.mime)
    await updateOwned('splits', found.owner, found.split.id, { image_path: path })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error(`[photo] ${error instanceof StorageError ? error.message : 'save failed'}`)
    return json(502, 'Couldn’t save the receipt photo.')
  }
}
