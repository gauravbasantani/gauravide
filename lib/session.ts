/**
 * Session — an encrypted, signed, HttpOnly cookie. No server-side store
 * (SEC-2, SEC-3, ARCHITECTURE.md A7).
 *
 * Today it carries an anonymous id so a person's splits are theirs. When
 * Splitwise OAuth lands (P2) the same cookie gains `splitwiseUserId` and
 * `accessToken`; `ownerId()` then returns the Splitwise id, and nothing
 * downstream changes.
 */
import { cookies } from 'next/headers'

const COOKIE = 'gv_session'
const MAX_AGE = 60 * 60 * 24 // 24h (SEC-3)

export type Session = {
  /** Stable per-browser id. Owns the rows this person creates. */
  anonId: string
  /** Set at P2. Becomes the owner id once present. */
  splitwiseUserId?: string
  /** Never leaves the server, never reaches the database (SEC-24). */
  accessToken?: string
}

const enc = new TextEncoder()
const dec = new TextDecoder()

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET is not set')
  return enc.encode(s)
}

async function key(): Promise<CryptoKey> {
  const material = await crypto.subtle.digest('SHA-256', secret() as BufferSource)
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

const b64url = (buf: ArrayBuffer | Uint8Array): string =>
  Buffer.from(buf as Uint8Array).toString('base64url')

export async function seal(session: Session): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = enc.encode(JSON.stringify(session))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), data)
  return `${b64url(iv)}.${b64url(cipher)}`
}

export async function unseal(value: string): Promise<Session | null> {
  try {
    const [ivPart, dataPart] = value.split('.')
    if (!ivPart || !dataPart) return null
    const iv = Buffer.from(ivPart, 'base64url')
    const cipher = Buffer.from(dataPart, 'base64url')
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      await key(),
      new Uint8Array(cipher),
    )
    return JSON.parse(dec.decode(plain)) as Session
  } catch {
    // Tampered, expired key, or rotated secret — treat as signed out.
    return null
  }
}

/** Read the session, creating an anonymous one on first visit. */
export async function getSession(): Promise<Session> {
  const jar = await cookies()
  const raw = jar.get(COOKIE)?.value
  const existing = raw ? await unseal(raw) : null
  if (existing) return existing
  return { anonId: crypto.randomUUID() }
}

export async function writeSession(session: Session): Promise<void> {
  const jar = await cookies()
  jar.set(COOKIE, await seal(session), {
    httpOnly: true, // never readable by JavaScript (SEC-2)
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // CSRF defence for state-changing routes (SEC-16)
    path: '/',
    maxAge: MAX_AGE,
  })
}

export async function clearSession(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE)
}

/** Who owns rows created in this session. Splitwise id once signed in. */
export function ownerId(session: Session): string {
  return session.splitwiseUserId ?? session.anonId
}
