import { notFound } from 'next/navigation'
import { dbConfigured, selectAll } from '@/lib/db'
import { isAdmin, opaqueUserId } from '@/lib/admin'
import { getSession, ownerId } from '@/lib/session'
import type { StoredSplit } from '@/lib/history'
import { formatMoney } from '@/lib/money'
import styles from './admin.module.css'

type Event = { user_key: string; name: string; created_at: string }
type Feedback = {
  id: string
  user_key: string
  category: string
  message: string
  contact: string | null
  created_at: string
}

const since = (days: number) => Date.now() - days * 24 * 60 * 60 * 1000

export default async function AdminPage() {
  const session = await getSession()
  if (!session.accessToken || !isAdmin(ownerId(session))) notFound()
  if (!dbConfigured) notFound()

  let splits: StoredSplit[] = []
  let events: Event[] = []
  let feedback: Feedback[] = []
  try {
    ;[splits, events, feedback] = await Promise.all([
      selectAll<StoredSplit>('splits'),
      selectAll<Event>('events'),
      selectAll<Feedback>('feedback', 100),
    ])
  } catch {
    return <div className="shell">Admin data is temporarily unavailable.</div>
  }

  const splitOwners = new Set(splits.map((split) => split.owner_id))
  const allOwners = new Set([...splitOwners, ...events.map((event) => event.user_key)])
  const activeOwners = new Set(
    events.filter((event) => new Date(event.created_at).getTime() >= since(7)).map((event) => event.user_key),
  )
  const recentSplits = splits.filter((split) => new Date(split.created_at).getTime() >= since(30))
  const extracts = events.filter((event) => event.name === 'receipt_extracted').length
  const submitted = events.filter((event) => event.name === 'split_submitted').length
  const valueByCurrency = splits.reduce<Record<string, number>>((totals, split) => {
    const currency = split.data.currency || 'USD'
    totals[currency] = (totals[currency] ?? 0) + split.data.totalCents
    return totals
  }, {})
  const valueLabels = Object.entries(valueByCurrency)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, cents]) => formatMoney(cents, currency))
  const userRows = await Promise.all(
    [...allOwners].slice(0, 12).map(async (userKey) => ({
      id: await opaqueUserId(userKey),
      joined: [...splits, ...events]
        .filter((row) => ('owner_id' in row ? row.owner_id : row.user_key) === userKey)
        .map((row) => row.created_at)
        .sort()[0],
      last: [...splits, ...events]
        .filter((row) => ('owner_id' in row ? row.owner_id : row.user_key) === userKey)
        .map((row) => row.created_at)
        .sort()
        .at(-1),
      count: splits.filter((split) => split.owner_id === userKey).length,
    })),
  )

  return (
    <div className={[styles.page, 'shell'].join(' ')}>
      <section className={styles.head}>
        <span className="t-label">Superuser only</span>
        <h1 className="t-title">App overview</h1>
        <p className="t-meta">Aggregate monitoring only. Receipt contents, merchants, individual amounts, groups, and images are never shown here.</p>
      </section>

      <section className={styles.metrics} aria-label="Usage overview">
        <Metric label="Users with splits" value={String(splitOwners.size)} note={activeOwners.size + ' active in 7 days'} />
        <Metric label="Saved splits" value={String(splits.length)} note={recentSplits.length + ' in 30 days'} />
        <Metric label="Split value" value={valueLabels[0] ?? '—'} note={valueLabels.slice(1).join(' · ') || 'aggregate only'} />
        <Metric label="Receipts read" value={String(extracts)} note="content never recorded" />
        <Metric label="Splitwise submits" value={String(submitted)} note="exact-count only" />
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>Anonymous activity</h2>
          <span>Opaque identifier · dates · split count only</span>
        </div>
        <div className={styles.table}>
          {userRows.length === 0 ? (
            <p>No activity yet.</p>
          ) : (
            userRows.map((user) => (
              <div key={user.id} className={styles.userRow}>
                <code>{user.id}</code>
                <span>Joined {user.joined ? new Date(user.joined).toLocaleDateString() : '—'}</span>
                <span>Last {user.last ? new Date(user.last).toLocaleDateString() : '—'}</span>
                <strong>{user.count} splits</strong>
              </div>
            ))
          )}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>Feedback inbox</h2>
          <span>{feedback.length} latest messages</span>
        </div>
        <div className={styles.feedback}>
          {feedback.length === 0 ? <p>No feedback yet.</p> : null}
          {feedback.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.category}</strong>
                <span>{new Date(item.created_at).toLocaleDateString()}</span>
              </div>
              <p>{item.message}</p>
              {item.contact ? <small>Reply address: {item.contact}</small> : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  )
}
