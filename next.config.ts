import type { NextConfig } from 'next'

/**
 * Security headers — SEC-13…16 in requirements.md.
 * CSP intentionally has no `unsafe-inline` for scripts. Next injects a nonce
 * for its own bootstrap; anything else must be an external file.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'", // Next.js runtime; tightened to nonce-based in P2
  "style-src 'self' 'unsafe-inline'", // CSS-in-JS from Next; our styles are static files
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(), microphone=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
}

export default nextConfig
