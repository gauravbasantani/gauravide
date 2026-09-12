import { CONTACT_EMAIL } from '@/components/ui/Footer'

export const runtime = 'nodejs'

/**
 * security.txt (RFC 9116): where to report a vulnerability. A researcher
 * looks here first, and an app that handles money and photos should answer.
 */
export function GET() {
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  const body = [
    `Contact: mailto:${CONTACT_EMAIL}`,
    `Expires: ${expires}`,
    'Preferred-Languages: en',
    'Canonical: https://gauravide.vercel.app/.well-known/security.txt',
    'Policy: https://gauravide.vercel.app/security',
    '',
    '# Gauravide is a small, free app run by one person.',
    '# Please report privately first; you will get a reply.',
    '',
  ].join('\n')

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  })
}
