/**
 * POST /api/receipt/extract — image or PDF page in, items out.
 *
 * The five-step route shape (ARCHITECTURE.md §3.2): authenticate, throttle,
 * validate, delegate, respond. No business logic lives here.
 */
import { NextResponse } from 'next/server'
import { extractReceipt, ExtractionUnavailable } from '@/lib/receipt'
import { getSession, writeSession, ownerId } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'
import { stripJpegMetadata } from '@/lib/exif'
import { dbConfigured, insert } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB (FR-4)

/** Magic bytes — the extension is a claim, not evidence (SEC-9, FR-5). */
const SIGNATURES: { mime: string; test: (b: Uint8Array) => boolean }[] = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: 'image/webp',
    test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42,
  },
  {
    mime: 'image/heic',
    test: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70,
  },
  {
    mime: 'application/pdf',
    test: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  },
]

function sniff(bytes: Uint8Array): string | null {
  return SIGNATURES.find((s) => s.test(bytes))?.mime ?? null
}

export async function POST(req: Request) {
  // 1. Authenticate — an anonymous session is still a session.
  const session = await getSession()

  // 2. Throttle. Protects the shared free-tier quota (GAP-12).
  const limit = rateLimit(`extract:${ownerId(session)}`, 10, 3600)
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: 'rate_limited',
        message: `Slow down a moment — try again in ${limit.retryAfterSeconds} seconds.`,
      },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds) } },
    )
  }

  // 3. Validate. Size first, so an oversized body is refused before reading it.
  const declaredLength = Number(req.headers.get('content-length') ?? '0')
  if (declaredLength > MAX_BYTES) {
    return NextResponse.json(
      { error: 'too_large', message: 'That file is over 10 MB — try a photo instead of a scan.' },
      { status: 413 },
    )
  }

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'no_file', message: 'No image was received. Try again.' },
      { status: 400 },
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'too_large', message: 'That file is over 10 MB — try a photo instead of a scan.' },
      { status: 413 },
    )
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const mimeType = sniff(bytes)
  if (!mimeType) {
    return NextResponse.json(
      {
        error: 'unsupported',
        message:
          "That doesn't look like a receipt image or PDF. Use a JPG, PNG, WEBP, HEIC or PDF.",
      },
      { status: 415 },
    )
  }

  // 4. Delegate.
  //    Strip EXIF server-side as well. The browser normally does it by
  //    re-encoding through a canvas, but that silently failed on mobile
  //    Safari — so GPS must not depend on the client succeeding (GAP-4).
  const clean = mimeType === 'image/jpeg' ? stripJpegMetadata(bytes) : bytes

  try {
    const result = await extractReceipt(Buffer.from(clean).toString('base64'), mimeType)
    await writeSession(session)
    if (dbConfigured) {
      insert('events', {
        user_key: ownerId(session),
        name: 'receipt_extracted',
        props: { source: result.source, kind: mimeType === 'application/pdf' ? 'pdf' : 'image' },
      }).catch(() => console.error('[extract] event save failed'))
    }

    // 5. Respond. rawText is dropped: it is receipt content, and the client
    //    already has the parsed items (SEC-7).
    return NextResponse.json({
      source: result.source,
      receipt: result.receipt,
      warnings: result.warnings,
    })
  } catch (err) {
    if (err instanceof ExtractionUnavailable) {
      // Both providers gone. Manual entry always works — never a dead end.
      return NextResponse.json(
        { error: 'extraction_unavailable', message: err.message, canEnterManually: true },
        { status: 503 },
      )
    }
    // Never leak internals to a user (UX-22).
    console.error('[extract] unexpected failure')
    return NextResponse.json(
      {
        error: 'extraction_failed',
        message: "Couldn't read that one — try again with more light, or type it in.",
        canEnterManually: true,
      },
      { status: 502 },
    )
  }
}
