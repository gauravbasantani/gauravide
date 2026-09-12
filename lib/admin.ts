export function isAdmin(owner: string): boolean {
  const allowlist = (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return allowlist.includes(owner)
}

/**
 * A label for a user that the admin page can show without revealing who they
 * are (MET-2).
 *
 * Keyed, not a plain hash: Splitwise ids are small integers, so SHA-256 of the
 * id alone could be reversed by trying every id in seconds (review finding 4).
 * The key is derived from SESSION_SECRET so no new secret is needed.
 */
export async function opaqueUserId(owner: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode('gauravide-admin-ids:' + (process.env.SESSION_SECRET ?? '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(owner))
  return Buffer.from(new Uint8Array(signature)).toString('hex').slice(0, 10)
}

/** Signed-in Splitwise users only; anonymous browser ids are not "users". */
export const isAccountId = (owner: string): boolean => /^\d+$/.test(owner)
