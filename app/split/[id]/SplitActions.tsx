'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import styles from './split.module.css'

type Props = { splitId: string; archived: boolean; hasSplitwiseExpense: boolean }

/** Seconds the user has to change their mind before anything is destroyed (FR-51). */
const UNDO_SECONDS = 30

export function SplitActions({ splitId, archived, hasSplitwiseExpense }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<'archive' | 'remove' | 'splitwise' | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** A removal the user has asked for but which has not happened yet. */
  const [pending, setPending] = useState<{ splitwise: boolean } | null>(null)
  const [left, setLeft] = useState(UNDO_SECONDS)
  // Read by the unload handler, which must not close over stale state.
  const pendingRef = useRef<{ splitwise: boolean } | null>(null)
  pendingRef.current = pending

  async function request(method: 'PATCH' | 'DELETE', body: object) {
    const response = await fetch('/api/splits/' + splitId, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.message ?? 'Something went wrong. Try again.')
  }

  async function archive() {
    setBusy('archive')
    setError(null)
    try {
      await request('PATCH', { action: archived ? 'restore' : 'archive' })
      router.push('/')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Couldn’t update this saved split.')
    } finally {
      setBusy(null)
    }
  }

  /** The real deletion, once the undo window has closed. */
  const commit = useCallback(
    async (deleteFromSplitwise: boolean) => {
      setBusy(deleteFromSplitwise ? 'splitwise' : 'remove')
      try {
        await request('DELETE', { deleteFromSplitwise })
        setPending(null)
        pendingRef.current = null
        router.push('/')
        router.refresh()
      } catch (cause) {
        setPending(null)
        pendingRef.current = null
        setError(cause instanceof Error ? cause.message : 'Couldn’t remove this saved split.')
      } finally {
        setBusy(null)
      }
    },
    [router, splitId], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Count down, then do it. Nothing is destroyed until this reaches zero.
  useEffect(() => {
    if (!pending) return
    setLeft(UNDO_SECONDS)
    const started = Date.now()
    const tick = setInterval(() => {
      const remaining = UNDO_SECONDS - Math.floor((Date.now() - started) / 1000)
      setLeft(Math.max(0, remaining))
      if (remaining <= 0) {
        clearInterval(tick)
        void commit(pending.splitwise)
      }
    }, 250)
    return () => clearInterval(tick)
  }, [pending, commit])

  /*
   * If the page is closed or navigated away mid-countdown, flush the removal so
   * it does not sit half-done. `keepalive` lets the request outlive the page.
   * If it fails, nothing was destroyed — the split simply stays, which is the
   * safe direction to fail in.
   */
  useEffect(() => {
    const flush = () => {
      const waiting = pendingRef.current
      if (!waiting) return
      pendingRef.current = null
      void fetch('/api/splits/' + splitId, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deleteFromSplitwise: waiting.splitwise }),
        keepalive: true,
      }).catch(() => undefined)
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [splitId])

  function startRemoval(deleteFromSplitwise: boolean) {
    // Deleting in Splitwise changes a shared expense, so it is still confirmed
    // first. The undo window then covers both kinds of removal.
    if (
      deleteFromSplitwise &&
      !window.confirm(
        'Delete this expense from Splitwise for everyone in the split? This can affect shared balances. You can restore it only in Splitwise.',
      )
    ) {
      return
    }
    setError(null)
    setPending({ splitwise: deleteFromSplitwise })
  }

  function undo() {
    setPending(null)
    pendingRef.current = null
    setLeft(UNDO_SECONDS)
  }

  if (pending) {
    return (
      <section className={[styles.actions, styles.pending].join(' ')} aria-label="Removal pending">
        <div>
          <h2>{pending.splitwise ? 'Deleting this everywhere' : 'Removing this receipt'}</h2>
          <p role="status">
            {pending.splitwise
              ? 'The items and photo will be deleted here, and the expense will be deleted in Splitwise for everyone.'
              : 'The items and photo will be deleted for good. Splitwise keeps the expense.'}{' '}
            Nothing has happened yet.
          </p>
        </div>
        <div className={styles.actionButtons}>
          <Button variant="secondary" onClick={undo} data-undo>
            Undo ({left}s)
          </Button>
          <Button
            variant="tertiary"
            onClick={() => void commit(pending.splitwise)}
            loading={busy !== null}
          >
            Do it now
          </Button>
        </div>
        <p className={styles.actionHelp}>
          If you leave this page or close the tab, the removal goes ahead. Undo is the only way
          back.
        </p>
      </section>
    )
  }

  return (
    <section className={styles.actions} aria-label="Manage saved split">
      <div>
        <h2>Manage this receipt</h2>
        <p>
          {archived
            ? 'Archived receipts stay private to you and can be restored at any time. Expenses deleted in Splitwise are archived here automatically, so the copy survives.'
            : 'Archive it to move it out of your active list and keep it. Remove it to delete it for good. Archiving and removing never change Splitwise.'}
        </p>
      </div>
      <div className={styles.actionButtons}>
        <Button variant="secondary" onClick={() => void archive()} loading={busy === 'archive'}>
          {archived ? 'Restore to active' : 'Archive receipt'}
        </Button>
        <Button variant="tertiary" onClick={() => startRemoval(false)}>
          Remove for good
        </Button>
        {hasSplitwiseExpense ? (
          <Button variant="tertiary" onClick={() => startRemoval(true)}>
            Delete from Splitwise too
          </Button>
        ) : null}
      </div>
      <p className={styles.actionHelp}>
        Both removals wait {UNDO_SECONDS} seconds with an Undo button before anything happens.
        Removing the dashboard copy never changes Splitwise: it deletes the items, the photo and the
        names for good, and an anonymous line stays in usage totals (amount, how many items and
        people), which is the only thing the app counts. Deleting from Splitwise too is a shared
        action and is always confirmed first.
      </p>
      {error ? <p className={styles.actionError}>{error}</p> : null}
    </section>
  )
}
