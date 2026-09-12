import Link from 'next/link'
import styles from './Footer.module.css'

/**
 * Same links, same place, on every page — WCAG 2.2 §3.2.6 (Consistent Help).
 */
export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <nav className={styles.links} aria-label="About this app">
          <Link href="/about">About</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <p style={{ margin: 0 }}>Not affiliated with Splitwise.</p>
      </div>
    </footer>
  )
}
