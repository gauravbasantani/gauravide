/**
 * Admin credentials — the pure crypto, with no Next.js imports, so it is
 * unit-tested directly (SEC-26a).
 *
 * The password is never stored anywhere. ADMIN_PASSWORD_HASH holds a salted
 * scrypt hash, `scrypt:N:r:p:salt:hash` (colons, not `$`, because Next's env
 * loader expands `$` sequences). `scripts/admin-password.mjs` makes one.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual, webcrypto } from 'node:crypto'

const KEYLEN = 64
const COST = { N: 2 ** 15, r: 8, p: 1 }
const MAXMEM = 64 * 1024 * 1024

/** How long an admin sign-in lasts. */
export const ADMIN_MAX_AGE_SECONDS = 8 * 60 * 60

function derive(password: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r, p, maxmem: MAXMEM }, (error, key) =>
      error ? reject(error) : resolve(key),
    )
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, COST.N, COST.r, COST.p)
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64url'), key.toString('base64url')].join(':')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.trim().split(':')
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false
  const N = Number(n)
  // Refuse absurd cost parameters from a mistyped variable rather than hang.
  if (!Number.isInteger(N) || N < 2 ** 14 || N > 2 ** 17) return false
  const expected = Buffer.from(hash, 'base64url')
  const actual = await derive(password, Buffer.from(salt, 'base64url'), N, Number(r), Number(p)).catch(
    () => null,
  )
  return Boolean(actual && actual.length === expected.length && timingSafeEqual(actual, expected))
}

/** Equal-time comparison of two strings of any length. */
export function sameText(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
}

/** Username matches (case-insensitive) AND password matches. Both always run. */
export async function credentialsMatch(
  username: string,
  password: string,
  expectedUsername: string,
  storedHash: string,
): Promise<boolean> {
  const userOk = sameText(username.trim().toLowerCase(), expectedUsername.trim().toLowerCase())
  // Verify the password even when the username is wrong, so timing never
  // reveals which of the two was right.
  const passOk = await verifyPassword(password, storedHash)
  return userOk && passOk
}

async function tokenKey() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  // A separate key from the user session, so one cookie can never pass as the other.
  const material = await webcrypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('gauravide-admin-session:' + secret),
  )
  return webcrypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/** Encrypted, expiring proof of an admin sign-in. */
export async function sealAdminToken(now = Date.now()): Promise<string> {
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const body = new TextEncoder().encode(
    JSON.stringify({ role: 'admin', exp: now + ADMIN_MAX_AGE_SECONDS * 1000 }),
  )
  const cipher = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, await tokenKey(), body)
  return `${Buffer.from(iv).toString('base64url')}.${Buffer.from(cipher).toString('base64url')}`
}

export async function readAdminToken(token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token) return false
  try {
    const [ivPart, dataPart] = token.split('.')
    if (!ivPart || !dataPart) return false
    const plain = await webcrypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(Buffer.from(ivPart, 'base64url')) },
      await tokenKey(),
      new Uint8Array(Buffer.from(dataPart, 'base64url')),
    )
    const payload = JSON.parse(new TextDecoder().decode(plain)) as { role?: string; exp?: number }
    return payload.role === 'admin' && typeof payload.exp === 'number' && payload.exp > now
  } catch {
    // Tampered, expired key, or a rotated secret — not signed in.
    return false
  }
}
