/**
 * Read-only share links for one saved split (FR-53).
 *
 * A share link is a capability: whoever holds the token sees the receipt, and
 * nobody else can find it. So the token is 192 bits of randomness, it lives
 * only on the split it belongs to, and the owner can revoke it at any time by
 * throwing it away — the next visit to the old link is simply "not found".
 *
 * The token is kept inside the split's JSON `data` rather than in its own
 * column, which means removing a split (which redacts `data`) takes the share
 * link with it. That is the behaviour we want: a removed receipt must not stay
 * readable through a link somebody kept.
 */
import { findByDataField, updateOwned } from '@/lib/db'
import type { StoredSplit } from '@/lib/history'

/** 32 url-safe characters. Long enough that guessing is not a threat model. */
export function newShareToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

/** Tokens we will even look up — anything else is rejected before the query. */
export const SHARE_TOKEN = /^[A-Za-z0-9_-]{16,64}$/

export function shareUrl(token: string, origin?: string): string {
  const base = (origin || process.env.APP_URL || '').replace(/\/$/, '')
  return `${base}/s/${token}`
}

/** The existing token, or a fresh one saved to the split. */
export async function ensureShareToken(split: StoredSplit): Promise<string> {
  if (split.data.shareToken) return split.data.shareToken
  const token = newShareToken()
  const saved = await updateOwned('splits', split.owner_id, split.id, {
    data: { ...split.data, shareToken: token, sharedAt: new Date().toISOString() },
  })
  if (!saved) throw new Error('could not save the share link')
  return token
}

export async function revokeShareToken(split: StoredSplit): Promise<boolean> {
  const data: Record<string, unknown> = { ...split.data }
  delete data.shareToken
  delete data.sharedAt
  return updateOwned('splits', split.owner_id, split.id, { data })
}

/**
 * The split a token opens, or null. A removed split has no `data.shareToken`
 * left to match, so it cannot be reached here at all.
 */
export async function splitByShareToken(token: string): Promise<StoredSplit | null> {
  if (!SHARE_TOKEN.test(token)) return null
  return findByDataField<StoredSplit>('splits', 'shareToken', token)
}
