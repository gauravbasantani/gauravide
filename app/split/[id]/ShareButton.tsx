'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import styles from '@/components/split/split.module.css'

type Props = { splitId: string; token: string | null }

/**
 * Share a split, from the top of the page (FR-53, FR-54).
 *
 * This began life as a panel below the receipt, under the items, the Splitwise
 * panel and the manage panel — four screens of scrolling from the top. Sharing
 * is the most common thing anyone does on this page, so it now sits in the
 * action bar with Edit, and the link itself opens in a sheet: the page keeps
 * its shape whether or not a link exists.
 */
export function ShareButton({ splitId, token }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  /**
   * The token comes from the server; the origin only exists in the browser. So
   * the first render shows the path alone — identical on both sides — and the
   * full link replaces it on mount.
   */
  const [url, setUrl] = useState<string | null>(token ? `/s/${token}` : null)
  useEffect(() => {
    setUrl(token ? `${window.location.origin}/s/${token}` : null)
  }, [token])

  const [busy, setBusy] = useState<'create' | 'revoke' | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const live = Boolean(url)

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
    if (
      !window.confirm(
        'Turn off this link? Anyone you already sent it to will stop being able to open it.',
      )
    ) {
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

  /** Share sheets exist on phones and on Safari; everywhere else, copy. */
  async function shareNatively() {
    if (!url) return
    if (!navigator.share) return void copy()
    try {
      await navigator.share({ title: 'Receipt split', url })
    } catch {
      // Cancelling the OS share sheet throws. That is not an error.
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.share}
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        aria-haspopup="dialog"
      >
        <span aria-hidden="true">↗</span>
        Share
        {live ? (
          <>
            <span className={styles.shareDot} aria-hidden="true" />
            <span className="sr-only">— a link is currently on</span>
          </>
        ) : null}
      </button>

      <Sheet
        open={open}
        title="Share this receipt"
        description={
          live
            ? 'Anyone with this link can see the receipt, the items and who owes what, without signing in. They can’t change anything.'
            : 'Create a link that shows this receipt, the items and who owes what — read-only, no sign-in needed. Good for the people in the split who aren’t on Splitwise.'
        }
        onClose={() => setOpen(false)}
        actions={
          live ? (
            <>
              <Button variant="tertiary" onClick={() => void revoke()} loading={busy === 'revoke'}>
                Turn off link
              </Button>
              <Button onClick={() => void shareNatively()}>Send link</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void create()} loading={busy === 'create'}>
                Create share link
              </Button>
            </>
          )
        }
      >
        {live && url ? (
          <div className={styles.shareRow}>
            <input
              className={styles.shareLink}
              value={url}
              readOnly
              aria-label="Share link"
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button variant="secondary" onClick={() => void copy()}>
              {copied ? 'Copied ✓' : 'Copy'}
            </Button>
          </div>
        ) : null}
        <p className={styles.shareNote}>
          {live
            ? 'Turning the link off stops it working for everyone straight away, and removing this receipt removes its link too.'
            : 'You can turn the link off at any time. It can’t be guessed, and search engines are told not to index it — but anyone you send it to can pass it on, so treat it like the receipt itself.'}
        </p>
        {error ? (
          <p className={styles.shareError} role="alert">
            {error}
          </p>
        ) : null}
      </Sheet>
    </>
  )
}
