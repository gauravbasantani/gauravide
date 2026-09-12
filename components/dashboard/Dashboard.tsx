import Link from 'next/link'
import { formatMoney } from '@/lib/money'
import { initials, type StoredSplit } from '@/lib/history'
import styles from './Dashboard.module.css'

type Props = {
  splits: StoredSplit[]
  unavailable?: boolean
}

function dateLabel(value: string | null, fallback: string): string {
  const date = value ? new Date(value + 'T12:00:00') : new Date(fallback)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    date,
  )
}

export function Dashboard({ splits, unavailable }: Props) {
  const activeSplits = splits.filter((split) => !split.archived_at)
  const archivedSplits = splits.filter((split) => split.archived_at)

  function SplitRows({ items, archived = false }: { items: StoredSplit[]; archived?: boolean }) {
    return (
      <section className={styles.list} aria-label={archived ? 'Archived splits' : 'Saved splits'}>
        {items.map((split) => {
          const data = split.data
          return (
            <Link key={split.id} href={'/split/' + split.id} className={styles.row}>
              <div className={styles.rowMain}>
                <strong>{data.merchant || 'Receipt'}</strong>
                <span>
                  {dateLabel(data.date, split.created_at)} · {data.groupName || 'No group'}
                </span>
              </div>
              <div className={styles.people} aria-label={'Split with ' + data.people.map((person) => person.name).join(', ')}>
                {initials(data.people) || 'You'}
              </div>
              <div className={styles.amount}>
                <strong>{formatMoney(data.totalCents, data.currency)}</strong>
                <span>{archived ? 'Archived' : '✓ in Splitwise'}</span>
              </div>
              <span className={styles.chevron} aria-hidden="true">›</span>
            </Link>
          )
        })}
      </section>
    )
  }

  return (
    <div className={[styles.page, 'shell'].join(' ')}>
      <section className={styles.head}>
        <div>
          <span className="t-label">Your receipts</span>
          <h1 className="t-title">Your splits</h1>
          <p className="t-meta">Private to your Splitwise account. Reopen any split whenever you need it.</p>
        </div>
        <Link href="/new" className={styles.newReceipt}>
          <span aria-hidden="true">＋</span> New receipt
        </Link>
      </section>

      {unavailable ? (
        <div className={styles.notice} role="status">
          <strong>Your history is temporarily unavailable.</strong>
          <span>New splits still work. Try refreshing in a moment.</span>
        </div>
      ) : null}

      {!unavailable && activeSplits.length === 0 && archivedSplits.length === 0 ? (
        <section className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">
            ⊕
          </span>
          <h2>No splits yet</h2>
          <p>Your completed receipts will appear here, private to your account, so you can find them again from any device.</p>
          <Link href="/new" className={styles.newReceipt}>
            Split your first receipt
          </Link>
        </section>
      ) : null}

      {activeSplits.length > 0 ? <SplitRows items={activeSplits} /> : null}
      {archivedSplits.length > 0 ? (
        <section className={styles.archived}>
          <h2>Archived receipts</h2>
          <p>Only you can see these. Open one to restore or remove it.</p>
          <SplitRows items={archivedSplits} archived />
        </section>
      ) : null}
    </div>
  )
}
