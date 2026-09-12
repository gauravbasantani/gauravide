import Link from 'next/link'
import styles from './page.module.css'

export default function Home() {
  return (
    <div className="shell">
      <div className={styles.hero}>
        <h1 className="t-title">Gauravide</h1>
        <p className={styles.tagline}>
          Split a receipt in 30 seconds. Snap a photo, tap who shares what, and it lands in
          Splitwise.
        </p>
        <p className={styles.privacy}>Your splits are saved to your account, private to you.</p>
      </div>

      <div className={styles.status}>
        <strong>Phase 1 — scaffold, design tokens and primitives.</strong>
        <ul className={styles.list}>
          <li>
            <Link href="/dev/tokens">View the design system demo</Link>
          </li>
        </ul>
      </div>
    </div>
  )
}
