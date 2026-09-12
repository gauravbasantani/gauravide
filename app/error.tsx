'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import styles from './status.module.css'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Type and digest only — never the message, which could carry receipt
    // content from a failed render (SEC-7).
    console.error(`[render] ${error.name}${error.digest ? ` digest=${error.digest}` : ''}`)
  }, [error])

  return (
    <div className={['shell', styles.wrap].join(' ')}>
      <span className={styles.icon} aria-hidden="true">
        ⚠️
      </span>
      <h1 className="t-title">Something went wrong on our side</h1>
      <p className={styles.body}>
        <strong>Your work is saved.</strong> Your split is kept on this device, so nothing is
        lost — try again.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={reset}>
          Try again
        </button>
        <Link href="/" className={styles.secondary}>
          Go to my splits
        </Link>
      </div>
      {error.digest ? (
        <p className={styles.ref}>
          Reference: <code>{error.digest}</code> — include this if you report it.
        </p>
      ) : null}
    </div>
  )
}
