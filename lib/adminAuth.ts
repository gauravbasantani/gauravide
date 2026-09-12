/**
 * Who may see /admin (SEC-26, SEC-26a). Two ways in, both server-checked on
 * every request:
 *
 *   1. Username + password (ADMIN_USERNAME, ADMIN_PASSWORD_HASH) → an
 *      encrypted HttpOnly, SameSite=Strict cookie that expires in 8 hours.
 *   2. Signing in with a Splitwise account listed in ADMIN_USER_IDS.
 */
import { cookies } from 'next/headers'
import { isAdmin } from './admin'
import {
  ADMIN_MAX_AGE_SECONDS,
  credentialsMatch,
  readAdminToken,
  sealAdminToken,
} from './adminCrypto'
import { getSession, ownerId } from './session'

const COOKIE = 'gv_admin'

export function adminLoginConfigured(): boolean {
  return Boolean(
    process.env.ADMIN_USERNAME?.trim() &&
      process.env.ADMIN_PASSWORD_HASH?.trim() &&
      process.env.SESSION_SECRET,
  )
}

export async function checkAdminCredentials(username: string, password: string): Promise<boolean> {
  const expected = process.env.ADMIN_USERNAME?.trim()
  const stored = process.env.ADMIN_PASSWORD_HASH?.trim()
  if (!expected || !stored) return false
  return credentialsMatch(username, password, expected, stored)
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

export async function isAdminRequest(): Promise<boolean> {
  const jar = await cookies()
  if (await readAdminToken(jar.get(COOKIE)?.value)) return true
  const session = await getSession()
  return Boolean(session.accessToken && isAdmin(ownerId(session)))
}
