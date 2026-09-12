'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import styles from '../prose.module.css'
import form from './contact.module.css'

type Category = 'bug' | 'suggestion' | 'question' | 'other'

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'bug', label: 'Something’s broken' },
  { value: 'suggestion', label: 'An idea' },
  { value: 'question', label: 'A question' },
  { value: 'other', label: 'Something else' },
]

export default function Contact() {
  const [category, setCategory] = useState<Category>('bug')
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [diagnostics, setDiagnostics] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!message.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          category,
          message: message.trim(),
          contact: contact.trim() || undefined,
          diagnostics: diagnostics
            ? {
                userAgent: navigator.userAgent.slice(0, 300),
                screen: `${window.innerWidth}x${window.innerHeight}`,
                path: window.location.pathname,
              }
            : undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.message ?? 'Couldn’t send that just now.')
        return
      }
      setSent(body.reference ?? 'sent')
    } catch {
      setError('Couldn’t send that just now. Your message is still here — try again.')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className={['shell', styles.page].join(' ')}>
        <h1>Thanks — that’s been sent</h1>
        <div className={styles.callout} role="status">
          <p>
            Reference <strong>{sent}</strong>. {contact.trim() ? 'We’ll reply if we can.' : ''}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={['shell', styles.page].join(' ')}>
      <h1>Get in touch</h1>
      <p className={styles.lead}>
        Bugs, ideas and awkward receipts all welcome. Suggestions genuinely shape what gets built
        next.
      </p>

      <div className={styles.card}>
        <fieldset className={form.fieldset}>
          <legend className={form.legend}>What’s this about?</legend>
          <div className={form.radios}>
            {CATEGORIES.map((c) => (
              <label key={c.value} className={form.radio}>
                <input
                  type="radio"
                  name="category"
                  value={c.value}
                  checked={category === c.value}
                  onChange={() => setCategory(c.value)}
                />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className={form.field}>
          <label className={form.label} htmlFor="message">
            Your message
          </label>
          <textarea
            id="message"
            className={form.textarea}
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-describedby="message-help"
          />
          <p id="message-help" className={form.help}>
            Please don’t paste receipt contents or personal financial details.
          </p>
        </div>

        <div className={form.field}>
          <Field
            label="How to reach you (optional)"
            type="email"
            placeholder="you@example.com"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            help="Leave blank if you’d rather not hear back."
          />
        </div>

        <label className={form.checkbox}>
          <input
            type="checkbox"
            checked={diagnostics}
            onChange={(e) => setDiagnostics(e.target.checked)}
          />
          <span>
            Include diagnostic info
            <span className={form.help}>
              Browser, window size and the page you’re on. Never your receipt or items.
            </span>
          </span>
        </label>

        {error ? (
          <p className={form.error} role="alert">
            {error}
          </p>
        ) : null}

        <div className={form.actions}>
          <Button
            onClick={send}
            loading={sending}
            disabled={!message.trim()}
            disabledReason={!message.trim() ? 'Write a message first' : undefined}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}
