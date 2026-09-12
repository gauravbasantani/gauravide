/**
 * Who may see /admin (SEC-26, SEC-26a, SEC-26b).
 *
 * A username and password, checked on every request, and an encrypted
 * HttpOnly, SameSite=Strict cookie that expires in 8 hours. The credentials
 * come from Supabase Storage once they have ever been changed, otherwise from
 * ADMIN_USERNAME / ADMIN_PASSWORD_HASH.
 *
 * A Splitwise account listed in ADMIN_USER_IDS also counts as admin — that
 * list is empty on the deployed site, so the password is the only way in.
 */
import { timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { isAdmin } from './admin'
import {
  ADMIN_MAX_AGE_SECONDS,
  credentialsMatch,
  hashPassword,
  readAdminToken,
  sealAdminToken,
} from './adminCrypto'
import { hashToken, makeResetToken, readStoredAdmin, writeStoredAdmin } from './adminStore'
import { getSession, ownerId } from './session'

const COOKIE = 'gv_admin'
const RESET_MINUTES = 30

type CurrentAdmin = { username: string; passwordHash: string; source: 'stored' | 'env' }

export async function currentAdmin(): Promise<CurrentAdmin | null> {
  const stored = await readStoredAdmin()
  if (stored) {
    return { username: stored.username, passwordHash: stored.passwordHash, source: 'stored' }
  }
  const username = process.env.ADMIN_USERNAME?.trim()
  const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim()
  return username && passwordHash ? { username, passwordHash, source: 'env' } : null
}

/** Is there an admin account to sign in to at all? */
export async function adminSignInAvailable(): Promise<boolean> {
  if (!process.env.SESSION_SECRET) return false
  return (await currentAdmin()) !== null
}

export async function checkAdminCredentials(username: string, password: string): Promise<boolean> {
  const admin = await currentAdmin()
  if (!admin) return false
  return credentialsMatch(username, password, admin.username, admin.passwordHash)
}

/** `secure` follows the request: always true on the deployed https site. */
export async function startAdminSession(secure: boolean): Promise<void> {
  const jar = await cookies()
  jar.set(COOKIE, await sealAdminToken(), {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: ADMIN_MAX_AGE_SECONDS,
  })
}

export async function endAdminSession(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE)
}

/** Signed in with the admin password specifically (not the Splitwise allowlist). */
export async function hasAdminSession(): Promise<boolean> {
  const jar = await cookies()
  return readAdminToken(jar.get(COOKIE)?.value)
}

export async function isAdminRequest(): Promise<boolean> {
  const jar = await cookies()
  if (await readAdminToken(jar.get(COOKIE)?.value)) return true
  const session = await getSession()
  return Boolean(session.accessToken && isAdmin(ownerId(session)))
}

/* ─────────────────────── Changing the password ─────────────────────── */

export const PASSWORD_MIN = 10

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`
  if (password.length > 200) return 'That password is too long.'
  return null
}

/** Store a new password. Any outstanding reset link stops working. */
export async function setAdminPassword(password: string): Promise<void> {
  const admin = await currentAdmin()
  if (!admin) throw new Error('no admin account configured')
  await writeStoredAdmin({
    username: admin.username,
    passwordHash: await hashPassword(password),
    updatedAt: new Date().toISOString(),
    reset: null,
  })
}

/** Start a reset: returns the token to email. Only its hash is stored. */
export async function createResetToken(): Promise<{ token: string; minutes: number } | null> {
  const admin = await currentAdmin()
  if (!admin) return null
  const token = makeResetToken()
  await writeStoredAdmin({
    username: admin.username,
    passwordHash: admin.passwordHash,
    updatedAt: new Date().toISOString(),
    reset: { tokenHash: hashToken(token), expiresAt: Date.now() + RESET_MINUTES * 60_000 },
  })
  return { token, minutes: RESET_MINUTES }
}

/** Spend a reset link on a new password. Single use, and it expires. */
export async function resetPasswordWithToken(token: string, password: string): Promise<boolean> {
  const stored = await readStoredAdmin()
  const reset = stored?.reset
  if (!stored || !reset || reset.expiresAt < Date.now()) return false

  const provided = Buffer.from(hashToken(token), 'hex')
  const expected = Buffer.from(reset.tokenHash, 'hex')
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return false

  await writeStoredAdmin({
    username: stored.username,
    passwordHash: await hashPassword(password),
    updatedAt: new Date().toISOString(),
    reset: null,
  })
  return true
}
