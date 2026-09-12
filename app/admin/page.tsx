import { notFound } from 'next/navigation'
import { dbConfigured, selectAll } from '@/lib/db'
import { isAccountId, isAdmin, opaqueUserId } from '@/lib/admin'
import { getSession, ownerId } from '@/lib/session'
import { formatMoney } from '@/lib/money'
import styles from './admin.module.css'

// Narrow columns only. The admin page has no code path to receipt contents,
// people, or per-person amounts (SEC-27).
type SplitRow = { owner_id: string; created_at: string; currency: string | null; total: string | null }
type Event = { user_key: string; name: string; created_at: string }
type Feedback = {
  id: string
  category: string
  message: string
  contact: string | null
  created_at: string
}

const ROW_LIMIT = 10_000
const since = (days: number) => Date.now() - days * 24 * 60 * 60 * 1000

export default async function AdminPage() {
  const session = await getSession()
  if (!session.accessToken || !isAdmin(ownerId(session))) notFound()
  if (!dbConfigured) notFound()

  let splits: SplitRow[] = []
  let events: Event[] = []
  let feedback: Feedback[] = []
  try {
    ;[splits, events, feedback] = await Promise.all([
      selectAll<SplitRow>(
        'splits',
        ROW_LIMIT,
        'owner_id,created_at,currency:data->>currency,total:data->>totalCents',
      ),
      selectAll<Event>('events', ROW_LIMIT, 'user_key,name,created_at'),
      selectAll<Feedback>('feedback', 50, 'id,category,message,contact,created_at'),
    ])
  } catch {
    return <div className="shell">Admin data is temporarily unavailable.</div>
  }

  const truncated = splits.length >= ROW_LIMIT || events.length >= ROW_LIMIT
  const accountEvents = events.filter((event) => isAccountId(event.user_key))
  const splitOwners = new Set(splits.map((split) => split.owner_id))
  const accounts = new Set([...splitOwners, ...accountEvents.map((event) => event.user_key)])
  const activeAccounts = new Set(
    accountEvents
      .filter((event) => new Date(event.created_at).getTime() >= since(7))
      .map((event) => event.user_key),
  )
  const splitCounts = new Map<string, number>()
  for (const split of splits) splitCounts.set(split.owner_id, (splitCounts.get(split.owner_id) ?? 0) + 1)
  const repeatUsers = [...splitCounts.values()].filter((count) => count > 1).length
  const recentSplits = splits.filter((split) => new Date(split.created_at).getTime() >= since(30))
  const extracts = events.filter((event) => event.name === 'receipt_extracted').length
  const submitted = events.filter((event) => event.name === 'split_submitted').length

  const valueByCurrency = splits.reduce<Record<string, number>>((totals, split) => {
    const currency = split.currency || 'USD'
    totals[currency] = (totals[currency] ?? 0) + (Number(split.total) || 0)
    return totals
  }, {})
  const valueLabels = Object.entries(valueByCurrency)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, cents]) => formatMoney(cents, currency))

  // First and last activity per account, in one pass rather than per row.
  const seen = new Map<string, { first: string; last: string }>()
  for (const row of [
    ...splits.map((s) => ({ key: s.owner_id, at: s.created_at })),
    ...accountEvents.map((e) => ({ key: e.user_key, at: e.created_at })),
  ]) {
    const current = seen.get(row.key)
    seen.set(row.key, {
      first: !current || row.at < current.first ? row.at : current.first,
      last: !current || row.at > current.last ? row.at : current.last,
    })
  }
  const userRows = await Promise.all(
    [...accounts]
      .sort((a, b) => (seen.get(b)?.last ?? '').localeCompare(seen.get(a)?.last ?? ''))
      .slice(0, 25)
      .map(async (key) => ({
        id: await opaqueUserId(key),
        joined: seen.get(key)?.first,
        last: seen.get(key)?.last,
        count: splitCounts.get(key) ?? 0,
      })),
  )

  return (
    <div className={[styles.page, 'shell'].join(' ')}>
      <section className={styles.head}>
        <span className="t-label">Superuser only</span>
        <h1 className="t-title">App overview</h1>
        <p className="t-meta">
          Usage is aggregate: receipt images, merchants, items, people, groups and per-person
          amounts are never loaded here. The feedback inbox below shows what people chose to send
          you.
        </p>
      </section>

      {truncated ? (
        <p className={styles.warning} role="status">
          Showing the most recent {ROW_LIMIT.toLocaleString()} rows — totals are lower bounds.
        </p>
      ) : null}

      <section className={styles.metrics} aria-label="Usage overview">
        <Metric
          label="Signed-in users"
          value={String(accounts.size)}
          note={activeAccounts.size + ' active in 7 days'}
        />
        <Metric
          label="Saved splits"
          value={String(splits.length)}
          note={recentSplits.length + ' in 30 days'}
        />
        <Metric
          label="Came back"
          value={String(repeatUsers)}
          note="users with 2+ splits"
        />
        <Metric
          label="Split value"
          value={valueLabels[0] ?? '—'}
          note={valueLabels.slice(1).join(' · ') || 'all users combined'}
        />
        <Metric label="Receipts read" value={String(extracts)} note="includes signed-out use" />
        <Metric label="Splitwise submits" value={String(submitted)} note="expenses created" />
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>Recent accounts</h2>
          <span>Keyed pseudonym · dates · split count only</span>
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
                <strong>
                  {user.count} {user.count === 1 ? 'split' : 'splits'}
                </strong>
              </div>
            ))
          )}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>Feedback inbox</h2>
          <span>{feedback.length} latest · sent to you on purpose</span>
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
