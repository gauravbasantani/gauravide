'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import styles from './admin.module.css'

/** Prove that feedback alerts actually arrive, without waiting for feedback. */
export function TestEmailButton() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function send() {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/test-email', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      setResult({ ok: res.ok, message: body.message ?? 'Couldn’t send the test email.' })
    } catch {
      setResult({ ok: false, message: 'Couldn’t reach the server. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.testEmail}>
      <Button variant="secondary" onClick={() => void send()} loading={busy}>
        Send a test alert
      </Button>
      {result ? (
        <span role="status" className={result.ok ? styles.testOk : styles.testFail}>
          {result.message}
        </span>
      ) : null}
    </div>
  )
}
