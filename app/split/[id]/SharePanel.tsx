'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import styles from '@/components/split/split.module.css'

type Props = { splitId: string; token: string | null }

/**
 * Turn a read-only link on or off for one split (FR-53).
 *
 * The link is a capability, so the copy is blunt about it: anyone who has it
 * can read the receipt. Turning it off is instant and cannot be undone — the
 * next link is a different one.
 */
export function SharePanel({ splitId, token }: Props) {
  const router = useRouter()
  /**
   * The token comes from the server; the origin only exists in the browser. So
   * the first render shows the path alone — identical on both sides — and the
   * full link replaces it on mount. The panel never flickers between states.
   */
  const [url, setUrl] = useState<string | null>(token ? `/s/${token}` : null)
  useEffect(() => {
    setUrl(token ? `${window.location.origin}/s/${token}` : null)
  }, [token])
  const [busy, setBusy] = useState<'create' | 'revoke' | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy('create')
    setError(null)
    try {
      const res = await fetch(`/api/splits/${splitId}/share`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message ?? 'Couldn’t create a share link.')
      setUrl(body.url ?? `${window.location.origin}/s/${body.token}`)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Couldn’t create a share link.')
    } finally {
      setBusy(null)
    }
  }

  async function revoke() {
    if (!window.confirm('Turn off this link? Anyone you already sent it to will stop being able to open it.')) {
      return
    }
    setBusy('revoke')
    setError(null)
    try {
      const res = await fetch(`/api/splits/${splitId}/share`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message ?? 'Couldn’t turn the link off.')
      setUrl(null)
      setCopied(false)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Couldn’t turn the link off.')
    } finally {
      setBusy(null)
    }
  }

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused. The link is on screen and selectable,
      // so there is nothing to recover from — just don't claim it was copied.
      setError('Couldn’t copy automatically — select the link and copy it.')
    }
  }

  return (
    <section className={styles.share} aria-label="Share this split">
      <h2>Share this receipt</h2>
      {url ? (
        <>
          <p>
            Anyone with this link can see the receipt, the items and who owes what — without
            signing in. They can’t change anything.
          </p>
          <div className={styles.shareRow}>
            <input
              className={styles.shareLink}
              value={url}
              readOnly
              aria-label="Share link"
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button variant="secondary" onClick={() => void copy()}>
              {copied ? 'Copied ✓' : 'Copy link'}
            </Button>
            <Button variant="tertiary" onClick={() => void revoke()} loading={busy === 'revoke'}>
              Turn off link
            </Button>
          </div>
        </>
      ) : (
        <>
          <p>
            Create a link that shows this receipt, the items and who owes what — read-only, no
            sign-in needed. Useful for the people in the split who aren’t on Splitwise. You can
            turn it off at any time.
          </p>
          <div className={styles.shareRow}>
            <Button variant="secondary" onClick={() => void create()} loading={busy === 'create'}>
              Create share link
            </Button>
          </div>
        </>
      )}
      {error ? <p className={styles.shareError}>{error}</p> : null}
    </section>
  )
}
