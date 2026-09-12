/**
 * Receipt photos — Supabase Storage, server only (FR-38).
 *
 * The bucket is private. Nothing is ever public: every read goes through an
 * API route that has already checked the split belongs to the signed-in user
 * (DB-4), so a storage path on its own is worthless outside the server.
 */
const URL_ = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY

export const BUCKET = 'receipts'
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024

export class StorageError extends Error {
  constructor(detail: string) {
    super(detail)
    this.name = 'StorageError'
  }
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  if (!URL_ || !KEY) throw new StorageError('storage not configured')
  return { apikey: KEY, authorization: `Bearer ${KEY}`, ...extra }
}

/** Created on first use, so a fresh project needs no manual setup. */
async function ensureBucket(): Promise<void> {
  const res = await fetch(`${URL_}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: false,
      file_size_limit: MAX_IMAGE_BYTES,
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'],
    }),
  })
  if (res.ok) return
  const text = await res.text().catch(() => '')
  // Another request may have created it a moment earlier.
  if (!/already exists|duplicate/i.test(text)) throw new StorageError(`bucket ${res.status}`)
}

export async function putObject(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const upload = () =>
    fetch(`${URL_}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: headers({ 'content-type': contentType, 'x-upsert': 'true' }),
      body: new Blob([bytes], { type: contentType }),
    })
  let res = await upload()
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (!/not found/i.test(text)) throw new StorageError(`upload ${res.status}`)
    await ensureBucket()
    res = await upload()
    if (!res.ok) throw new StorageError(`upload ${res.status}`)
  }
}

export async function getObject(
  path: string,
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const res = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${path}`, {
    headers: headers(),
    cache: 'no-store',
  })
  if (!res.ok) return null
  return {
    body: await res.arrayBuffer(),
    contentType: res.headers.get('content-type') ?? 'image/jpeg',
  }
}

export async function removeObject(path: string): Promise<void> {
  await fetch(`${URL_}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: headers({ 'content-type': 'application/json' }),
    body: JSON.stringify({ prefixes: [path] }),
  })
}
