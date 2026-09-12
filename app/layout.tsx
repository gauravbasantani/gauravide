import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Gauravide',
  description: 'Split a receipt in 30 seconds — scan it, tap who shares what, done.',
  applicationName: 'Gauravide',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Never block zoom — users must be able to reach 200% (WCAG 1.4.4).
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1120' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <main id="main">{children}</main>
      </body>
    </html>
  )
}
