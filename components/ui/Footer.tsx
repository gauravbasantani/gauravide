import Link from 'next/link'
import Image from 'next/image'
import styles from './Footer.module.css'

/**
 * Same links, same place, on every page — WCAG 2.2 §3.2.6 (Consistent Help) —
 * plus a real way to reach a person, and where the security story lives.
 */
export const CONTACT_EMAIL = 'gaurav.inbox29@gmail.com'

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandCol}>
          <Link href="/" className={styles.brand}>
            <Image className={styles.mark} src="/gauravide-mark.png" alt="" width={28} height={28} />
            <span>Gauravide</span>
          </Link>
          <p className={styles.tagline}>
            Split any receipt in 30 seconds, straight into Splitwise. Free, and no Splitwise Pro
            needed.
          </p>
          <p className={styles.madeBy}>Made by Gaurav Basantani · Tempe, Arizona</p>
        </div>

        <nav className={styles.col} aria-label="About this app">
          <h2>The app</h2>
          <Link href="/about">About</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/new">Split a receipt</Link>
        </nav>

        <nav className={styles.col} aria-label="Trust">
          <h2>Trust</h2>
          <Link href="/security">Security &amp; privacy</Link>
          <Link href="/faq#data">What’s stored</Link>
          <a href="/.well-known/security.txt">Report an issue</a>
        </nav>

        <div className={styles.col}>
          <h2>Contact</h2>
          <Link href="/contact">Send feedback</Link>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </div>
      </div>

      <div className={styles.baseline}>
        <p>© {new Date().getFullYear()} Gaurav Basantani. Free to use, always.</p>
        <p>Not affiliated with, endorsed by, or sponsored by Splitwise.</p>
      </div>
    </footer>
  )
}
