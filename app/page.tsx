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

      <div style={{ marginTop: 'var(--space-8)' }}>
        <Link href="/new" className={styles.ctaLink}>
          ⊕ Split a receipt
        </Link>
      </div>

      <div className={styles.status}>
        <strong>In progress.</strong> Scanning, splitting and the maths all work. Pushing to
        Splitwise needs a Splitwise Pro subscription — until then, copy the summary at the end.
        <ul className={styles.list}>
          <li>
            <Link href="/dev/tokens">Design system demo</Link>
          </li>
        </ul>
      </div>
    </div>
  )
}
