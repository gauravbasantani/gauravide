'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import styles from '@/components/split/split.module.css'

type Difference = { label: string; ours: string; theirs: string }
type Status = 'idle' | 'same' | 'different' | 'deleted' | 'pulled' | 'pushed'

type Props = {
  splitId: string
  syncedAt?: string | null
  deletedInSplitwise?: boolean
}

/**
 * Splitwise is the shared copy; this is ours. Either can change without the
 * other knowing, so the user can compare them and pick a direction (FR-48).
 * Nothing syncs by itself: overwriting a shared expense affects everyone in it.
 */
export function SyncPanel({ splitId, syncedAt, deletedInSplitwise }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>(deletedInSplitwise ? 'deleted' : 'idle')
  const [differences, setDifferences] = useState<Difference[]>([])
  const [busy, setBusy] = useState<'check' | 'pull' | 'push' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(action: 'check' | 'pull' | 'push') {
    setBusy(action)
    setError(null)
    try {
      const res = await fetch(`/api/splits/${splitId}/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.message ?? 'Couldn’t check Splitwise.')
        return
      }
      setStatus(body.status as Status)
      setDifferences(body.differences ?? [])
      if (body.status !== 'different') router.refresh()
    } catch {
      setError('Couldn’t reach the server. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className={styles.sync} aria-labelledby="sync-title">
      <div className={styles.syncHead}>
        <div>
          <h2 id="sync-title">Splitwise copy</h2>
          <p>
            Anyone in this expense can change it in Splitwise, and you can change it here. Compare
            the two whenever you like — nothing moves on its own.
            {syncedAt ? ` Last checked ${new Date(syncedAt).toLocaleString()}.` : ''}
          </p>
        </div>
        <Button variant="secondary" loading={busy === 'check'} onClick={() => void run('check')}>
          Check Splitwise
        </Button>
      </div>

      {status === 'same' ? (
        <p className={styles.syncOk} role="status">
          ✓ Splitwise matches this page.
        </p>
      ) : null}

      {status === 'pulled' ? (
        <p className={styles.syncOk} role="status">
          ✓ Updated from Splitwise.
        </p>
      ) : null}

      {status === 'pushed' ? (
        <p className={styles.syncOk} role="status">
          ✓ Splitwise now matches this page.
        </p>
      ) : null}

      {status === 'deleted' ? (
        <div className={styles.syncWarn} role="status">
          <strong>This expense no longer exists in Splitwise.</strong>
          <span>
            Someone deleted it there. This page is now just your own record — remove the dashboard
            copy below if you don’t want it, or split the receipt again to re-create it.
          </span>
        </div>
      ) : null}

      {status === 'different' ? (
        <div className={styles.syncDiff}>
          <strong>Splitwise has a different version</strong>
          <table className={styles.syncTable}>
            <thead>
              <tr>
                <th scope="col">What</th>
                <th scope="col">Here</th>
                <th scope="col">In Splitwise</th>
              </tr>
            </thead>
            <tbody>
              {differences.map((d) => (
                <tr key={d.label}>
                  <td>{d.label}</td>
                  <td>{d.ours}</td>
                  <td>{d.theirs}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.syncNote}>
            Pulling updates the amounts here; your item breakdown stays and is flagged if it no
            longer adds up. Pushing changes the expense for everyone in it.
          </p>
          <div className={styles.syncActions}>
            <Button loading={busy === 'pull'} onClick={() => void run('pull')}>
              Use Splitwise’s version
            </Button>
            <Button variant="secondary" loading={busy === 'push'} onClick={() => void run('push')}>
              Push my version
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className={styles.actionError} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
