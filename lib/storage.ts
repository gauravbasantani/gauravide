/**
 * Supabase Storage — server only (FR-38, SEC-26b).
 *
 * Two private buckets, both created on first use so a fresh project needs no
 * manual setup:
 *   receipts   — receipt photos, read only through an owner-checked route
 *   app-config — small server-owned JSON (the admin credentials)
 *
 * Nothing is ever public, so a storage path on its own is worthless outside
 * the server.
 */
const URL_ = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY

export const RECEIPTS_BUCKET = 'receipts'
export const CONFIG_BUCKET = 'app-config'
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024

const BUCKET_TYPES: Record<string, string[]> = {
  [RECEIPTS_BUCKET]: ['image/jpeg', 'image/png', 'image/webp'],
  [CONFIG_BUCKET]: ['application/json'],
}

export const storageConfigured = (): boolean => Boolean(URL_ && KEY)

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

async function ensureBucket(bucket: string): Promise<void> {
  const res = await fetch(`${URL_}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: false,
      file_size_limit: MAX_IMAGE_BYTES,
      allowed_mime_types: BUCKET_TYPES[bucket] ?? ['application/json'],
    }),
  })
  if (res.ok) return
  const text = await res.text().catch(() => '')
  // Another request may have created it a moment earlier.
  if (!/already exists|duplicate/i.test(text)) throw new StorageError(`bucket ${res.status}`)
}

export async function putObject(
  bucket: string,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const upload = () =>
    fetch(`${URL_}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: headers({ 'content-type': contentType, 'x-upsert': 'true' }),
      body: new Blob([bytes], { type: contentType }),
    })
  let res = await upload()
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (!/not found/i.test(text)) throw new StorageError(`upload ${res.status}`)
    await ensureBucket(bucket)
    res = await upload()
    if (!res.ok) throw new StorageError(`upload ${res.status}`)
  }
}

export async function getObject(
  bucket: string,
  path: string,
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const res = await fetch(`${URL_}/storage/v1/object/${bucket}/${path}`, {
    headers: headers(),
    cache: 'no-store',
  })
  if (!res.ok) return null
  return {
    body: await res.arrayBuffer(),
    contentType: res.headers.get('content-type') ?? 'application/octet-stream',
  }
}

export async function removeObject(bucket: string, path: string): Promise<void> {
  await fetch(`${URL_}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers: headers({ 'content-type': 'application/json' }),
    body: JSON.stringify({ prefixes: [path] }),
  })
}
