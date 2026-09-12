/**
 * The one email this app sends: an admin password reset link (SEC-26c).
 *
 * Resend's HTTP API, so there is no SMTP library and no mail server. Without
 * RESEND_API_KEY the feature reports itself as unavailable and the UI points
 * at the command-line reset instead — it never silently does nothing.
 */
const API = process.env.RESEND_API_URL?.trim() || 'https://api.resend.com/emails'

/** Where reset links go. Only ever this address. */
export const adminEmail = (): string => process.env.ADMIN_EMAIL?.trim() || 'gaurav.inbox29@gmail.com'

export const emailConfigured = (): boolean => Boolean(process.env.RESEND_API_KEY?.trim())

export class EmailError extends Error {
  constructor(detail: string) {
    super(detail)
    this.name = 'EmailError'
  }
}

/** Mask an address for the UI: g****@gmail.com. */
export function maskEmail(address: string): string {
  const [user = '', domain = ''] = address.split('@')
  return `${user.slice(0, 1)}${'*'.repeat(Math.max(1, user.length - 1))}@${domain}`
}

export async function sendAdminEmail(subject: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) throw new EmailError('email not configured')
  const res = await fetch(API, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.ADMIN_EMAIL_FROM?.trim() || 'Gauravide <onboarding@resend.dev>',
      to: [adminEmail()],
      subject,
      text,
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new EmailError(`resend ${res.status} ${detail.slice(0, 200)}`)
  }
}
