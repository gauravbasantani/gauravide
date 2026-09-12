'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import styles from '../login/login.module.css'

export function ForgotForm() {
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/forgot', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.message ?? 'Couldn’t send the reset link.')
        return
      }
      setSent(body.sentTo ?? 'your inbox')
    } catch {
      setError('Couldn’t reach the server. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className={styles.sent} role="status">
        <strong>Check {sent}</strong>
        <span>
          The link works once and expires in 30 minutes. If it doesn’t arrive, look in spam.
        </span>
      </div>
    )
  }

  return (
    <div className={styles.form}>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <Button full loading={busy} onClick={() => void send()}>
        Email me a reset link
      </Button>
    </div>
  )
}
