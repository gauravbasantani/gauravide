'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import styles from './login.module.css'

export function AdminLoginForm() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || !username.trim() || !password) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.message ?? 'Couldn’t sign in. Try again.')
        setPassword('')
        return
      }
      router.replace('/admin')
      router.refresh()
    } catch {
      setError('Couldn’t reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const missing = !username.trim() || !password

  return (
    <form className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
      <Field
        label="Username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <div className={styles.passwordWrap}>
        <Field
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="button"
          className={styles.reveal}
          aria-pressed={showPassword}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          onClick={() => setShowPassword(!showPassword)}
        >
          {showPassword ? 'Hide' : 'Show'}
        </button>
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        full
        loading={busy}
        disabled={missing}
        disabledReason={missing ? 'Enter your username and password' : undefined}
      >
        Sign in
      </Button>
    </form>
  )
}
