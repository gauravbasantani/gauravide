export function isAdmin(owner: string): boolean {
  const allowlist = (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return allowlist.includes(owner)
}

export async function opaqueUserId(owner: string): Promise<string> {
  const bytes = new TextEncoder().encode(owner)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Buffer.from(new Uint8Array(digest)).toString('hex').slice(0, 8)
}
