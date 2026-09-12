'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import styles from '../login/login.module.css'

const MIN = 10

export function ResetForm({ token }: { token: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tooShort = password.length > 0 && password.length < MIN
  const mismatch = confirm.length > 0 && confirm !== password
  const blocked = password.length < MIN || confirm !== password

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || blocked) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.message ?? 'Couldn’t set that password.')
        return
      }
      router.replace('/admin')
      router.refresh()
    } catch {
      setError('Couldn’t reach the server. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
      <div className={styles.passwordWrap}>
        <Field
          label="New password"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          value={password}
          error={tooShort ? `Use at least ${MIN} characters.` : undefined}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="button"
          className={styles.reveal}
          aria-pressed={show}
          aria-label={show ? 'Hide password' : 'Show password'}
          onClick={() => setShow(!show)}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      <Field
        label="New password again"
        type={show ? 'text' : 'password'}
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
        disabledReason={blocked ? `Enter the same password twice, at least ${MIN} characters` : undefined}
      >
        Save and sign in
      </Button>
    </form>
  )
}
