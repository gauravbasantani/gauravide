'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import styles from '../login/login.module.css'

const MIN = 10

export function ChangePasswordForm() {
  const router = useRouter()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const tooShort = next.length > 0 && next.length < MIN
  const mismatch = confirm.length > 0 && confirm !== next
  const blocked = !current || next.length < MIN || confirm !== next

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || blocked) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ current, next }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.message ?? 'Couldn’t change the password.')
        return
      }
      setDone(true)
      setCurrent('')
      setNext('')
      setConfirm('')
      router.refresh()
    } catch {
      setError('Couldn’t reach the server. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className={styles.sent} role="status">
        <strong>Password changed</strong>
        <span>Use the new one next time you sign in. This session stays signed in.</span>
      </div>
    )
  }

  return (
    <form className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
      <Field
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        value={next}
        error={tooShort ? `Use at least ${MIN} characters.` : undefined}
        onChange={(e) => setNext(e.target.value)}
      />
      <Field
        label="New password again"
        type="password"
        autoComplete="new-password"
        value={confirm}
        error={mismatch ? 'Those two don’t match.' : undefined}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        full
        loading={busy}
        disabled={blocked}
        disabledReason={blocked ? 'Fill in all three, at least 10 characters' : undefined}
      >
        Change password
      </Button>
    </form>
  )
}
