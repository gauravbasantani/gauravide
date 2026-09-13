'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import styles from './split.module.css'

type Props = { splitId: string; archived: boolean; hasSplitwiseExpense: boolean }

export function SplitActions({ splitId, archived, hasSplitwiseExpense }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<'archive' | 'remove' | 'splitwise' | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  async function remove(deleteFromSplitwise: boolean) {
    const warning = deleteFromSplitwise
      ? 'Delete this expense from Splitwise for everyone in the split? This can affect shared balances. You can restore it only in Splitwise.'
      : 'Remove this saved receipt from your Gauravide dashboard? The items and photo are deleted for good, and the Splitwise expense stays unchanged.'
    if (!window.confirm(warning)) return
    setBusy(deleteFromSplitwise ? 'splitwise' : 'remove')
    setError(null)
    try {
      await request('DELETE', { deleteFromSplitwise })
      router.push('/')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Couldn’t remove this saved split.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className={styles.actions} aria-label="Manage saved split">
      <div>
        <h2>Manage this receipt</h2>
        <p>
          {archived
            ? 'Archived receipts stay private to you and can be restored.'
            : 'Archive it to hide it from your active history without changing Splitwise.'}
        </p>
      </div>
      <div className={styles.actionButtons}>
        <Button variant="secondary" onClick={() => void archive()} loading={busy === 'archive'}>
          {archived ? 'Restore to active' : 'Archive receipt'}
        </Button>
        <Button variant="tertiary" onClick={() => void remove(false)} loading={busy === 'remove'}>
          Remove dashboard copy
        </Button>
        {hasSplitwiseExpense ? (
          <Button variant="tertiary" onClick={() => void remove(true)} loading={busy === 'splitwise'}>
            Delete from Splitwise too
          </Button>
        ) : null}
      </div>
      <p className={styles.actionHelp}>
        Removing the dashboard copy never changes Splitwise. It deletes the items, the photo and the
        names for good; an anonymous line stays in usage totals (amount, how many items and people),
        which is the only thing the app counts. Deleting from Splitwise too is a shared action and is
        always confirmed first.
      </p>
      {error ? <p className={styles.actionError}>{error}</p> : null}
    </section>
  )
}
