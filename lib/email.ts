/**
 * Admin-only email delivery through Resend's HTTP API. Without RESEND_API_KEY
 * email-dependent features report their status clearly; data is never held in
 * memory waiting for an email service to come back.
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

export function feedbackNotification(input: {
  category: 'bug' | 'suggestion' | 'question' | 'other'
  message: string
  contact?: string | null
  reference: string
}): { subject: string; text: string } {
  const contact = input.contact ? `\nReply address: ${input.contact}\n` : '\nNo reply address was provided.\n'
  return {
    subject: `New Gauravide feedback — ${input.category}`,
    text: `A user sent feedback.\n\nCategory: ${input.category}\nReference: ${input.reference}${contact}\nMessage:\n${input.message}\n\nView all feedback: /admin`,
  }
}
