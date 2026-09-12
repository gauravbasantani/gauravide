import Link from 'next/link'
import styles from './status.module.css'

export default function NotFound() {
  return (
    <div className={['shell', styles.wrap].join(' ')}>
      <span className={styles.icon} aria-hidden="true">
        🧾
      </span>
      <h1 className="t-title">This page doesn’t exist</h1>
      <p className={styles.body}>
        The link may be wrong, or the split may have been deleted.
      </p>
      <Link href="/" className={styles.action}>
        Go to my splits
      </Link>
    </div>
  )
}
