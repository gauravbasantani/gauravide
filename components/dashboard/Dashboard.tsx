import Link from 'next/link'
import { formatMoney } from '@/lib/money'
import { paidByLabel, viewerBalance, type StoredSplit } from '@/lib/history'
import { colourOf } from '@/lib/avatar'
import styles from './Dashboard.module.css'

type Props = {
  splits: StoredSplit[]
  unavailable?: boolean
}

const when = (split: StoredSplit) =>
  split.data.date ? new Date(split.data.date + 'T12:00:00') : new Date(split.created_at)

const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
const shortMonth = new Intl.DateTimeFormat('en-US', { month: 'short' })

/** Rows grouped under "September 2026" headings, newest first. */
function byMonth(splits: StoredSplit[]): [string, StoredSplit[]][] {
  const groups = new Map<string, StoredSplit[]>()
  for (const split of [...splits].sort((a, b) => when(b).getTime() - when(a).getTime())) {
    const key = monthLabel.format(when(split))
    groups.set(key, [...(groups.get(key) ?? []), split])
  }
  return [...groups]
}

/** Totals per currency — never add dollars to euros. */
function totals(splits: StoredSplit[]) {
  const lent = new Map<string, number>()
  const borrowed = new Map<string, number>()
  for (const split of splits) {
    const balance = viewerBalance(split)
    if (!balance) continue
    const currency = split.data.currency || 'USD'
    if (balance.net > 0) lent.set(currency, (lent.get(currency) ?? 0) + balance.net)
    if (balance.net < 0) borrowed.set(currency, (borrowed.get(currency) ?? 0) - balance.net)
  }
  const label = (map: Map<string, number>) =>
    [...map].map(([currency, cents]) => formatMoney(cents, currency)).join(' · ') || formatMoney(0)
  return { lent: label(lent), borrowed: label(borrowed) }
}

function SplitRow({ split, archived }: { split: StoredSplit; archived?: boolean }) {
  const data = split.data
  const date = when(split)
  const money = (cents: number) => formatMoney(cents, data.currency)
  const balance = viewerBalance(split)
  const merchant = data.merchant || 'Receipt'

  return (
    <Link href={'/split/' + split.id} className={styles.row}>
      <span className={styles.date} aria-hidden="true">
        <span>{shortMonth.format(date)}</span>
        <strong>{String(date.getDate()).padStart(2, '0')}</strong>
      </span>
      <span className={styles.tile} style={{ background: colourOf(split.id) }} aria-hidden="true">
        {merchant.trim().charAt(0).toUpperCase()}
      </span>
      <span className={styles.rowMain}>
        <strong>{merchant}</strong>
        <span>
          {split.image_path ? <span aria-hidden="true">📷 </span> : null}
          {paidByLabel(split, money)}
          {data.groupName && data.groupName !== 'No group' ? ` · ${data.groupName}` : ''}
        </span>
      </span>
      <span className={styles.amount}>
        {archived ? (
          <>
            <span>archived</span>
            <strong className={styles.neutral}>{money(data.totalCents)}</strong>
          </>
        ) : !balance ? (
          <>
            <span className={styles.lent}>in Splitwise</span>
            <strong className={styles.neutral}>{money(data.totalCents)}</strong>
          </>
        ) : balance.net > 0 ? (
          <>
            <span className={styles.lent}>you lent</span>
            <strong className={styles.lent}>{money(balance.net)}</strong>
          </>
        ) : balance.net < 0 ? (
          <>
            <span className={styles.borrowed}>you borrowed</span>
            <strong className={styles.borrowed}>{money(-balance.net)}</strong>
          </>
        ) : (
          <>
            <span>not involved</span>
            <strong className={styles.neutral}>{money(data.totalCents)}</strong>
          </>
        )}
      </span>
      <span className="sr-only">
        {date.toLocaleDateString()}, split with {data.people.map((p) => p.name).join(', ')}
      </span>
    </Link>
  )
}

export function Dashboard({ splits, unavailable }: Props) {
  const activeSplits = splits.filter((split) => !split.archived_at)
  const archivedSplits = splits.filter((split) => split.archived_at)
  const sum = totals(activeSplits)

  return (
    <div className={[styles.page, 'shell'].join(' ')}>
      <section className={styles.head}>
        <div>
          <span className={styles.eyebrow}>Private to your Splitwise account</span>
          <h1 className={styles.title}>Your splits</h1>
        </div>
        <Link href="/new" className={styles.newReceipt}>
          <span aria-hidden="true">＋</span> New receipt
        </Link>
      </section>

      {activeSplits.length > 0 ? (
        <section className={styles.stats} aria-label="Balances from your receipts">
          <div className={styles.stat}>
            <span>You lent</span>
            <strong className={styles.lent}>{sum.lent}</strong>
          </div>
          <div className={styles.stat}>
            <span>You borrowed</span>
            <strong className={styles.borrowed}>{sum.borrowed}</strong>
          </div>
          <div className={styles.stat}>
            <span>Receipts</span>
            <strong>{activeSplits.length}</strong>
          </div>
        </section>
      ) : null}

      {unavailable ? (
        <div className={styles.notice} role="status">
          <strong>Your history is temporarily unavailable.</strong>
          <span>New splits still work. Try refreshing in a moment.</span>
        </div>
      ) : null}

      {!unavailable && splits.length === 0 ? (
        <section className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">
            🧾
          </span>
          <h2>No splits yet</h2>
          <p>
            Snap your first receipt. Once it’s in Splitwise, it shows up here — who paid, who owes
            what — on any device you sign in from.
          </p>
          <Link href="/new" className={styles.newReceipt}>
            Split your first receipt
          </Link>
        </section>
      ) : null}

      {byMonth(activeSplits).map(([month, rows]) => (
        <section key={month} className={styles.month} aria-label={month}>
          <h2 className={styles.monthTitle}>{month}</h2>
          <div className={styles.list}>
            {rows.map((split) => (
              <SplitRow key={split.id} split={split} />
            ))}
          </div>
        </section>
      ))}

      {archivedSplits.length > 0 ? (
        <details className={styles.archived}>
          <summary>
            Archived receipts <span>({archivedSplits.length})</span>
          </summary>
          <p>Only you can see these. Open one to restore or remove it.</p>
          <div className={styles.list}>
            {archivedSplits.map((split) => (
              <SplitRow key={split.id} split={split} archived />
            ))}
          </div>
        </details>
      ) : null}

      {splits.length >= 50 ? (
        <p className={styles.more}>Showing your 50 most recent receipts.</p>
      ) : null}
    </div>
  )
}
