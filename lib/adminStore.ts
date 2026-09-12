/**
 * Where the admin password actually lives (SEC-26b).
 *
 * ADMIN_PASSWORD_HASH in the environment is the starting value only: the app
 * cannot rewrite its own environment, so "change password" and "forgot
 * password" would be impossible. The current credentials are kept as a small
 * private JSON object in Supabase Storage, which the server can update. The
 * environment value is used until the first change.
 *
 * Only ever a hash. A reset link is stored as a SHA-256 of the token, so the
 * stored copy cannot be replayed even by someone who could read it.
 */
import { createHash, randomBytes } from 'node:crypto'
import { CONFIG_BUCKET, getObject, putObject } from './storage'

const PATH = 'admin/credentials.json'

export type StoredAdmin = {
  username: string
  passwordHash: string
  updatedAt: string
  /** A live "forgot password" link, if one was requested. */
  reset?: { tokenHash: string; expiresAt: number } | null
}

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

export const makeResetToken = (): string => randomBytes(32).toString('base64url')

export async function readStoredAdmin(): Promise<StoredAdmin | null> {
  try {
    const object = await getObject(CONFIG_BUCKET, PATH)
    if (!object) return null
    const parsed = JSON.parse(Buffer.from(object.body).toString('utf8')) as StoredAdmin
    return parsed?.username && parsed?.passwordHash ? parsed : null
  } catch {
    // Storage off, or an unreadable object: fall back to the environment.
    return null
  }
}

export async function writeStoredAdmin(next: StoredAdmin): Promise<void> {
  await putObject(
    CONFIG_BUCKET,
    PATH,
    new TextEncoder().encode(JSON.stringify(next, null, 2)),
    'application/json',
  )
}
