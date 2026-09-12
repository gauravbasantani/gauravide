import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { formatMoney } from '@/lib/money'
import { dbConfigured, selectOneOwned } from '@/lib/db'
import { getSession, ownerId } from '@/lib/session'
import type { StoredSplit } from '@/lib/history'
import { SplitActions } from './SplitActions'
import styles from './split.module.css'

export default async function SplitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.accessToken) redirect('/')
  if (!dbConfigured) notFound()

  const { id } = await params
  let split: StoredSplit | null = null
  try {
    split = await selectOneOwned<StoredSplit>('splits', ownerId(session), id)
  } catch {
    notFound()
  }
  if (!split) notFound()

  const data = split.data
  return (
    <div className={[styles.page, 'shell'].join(' ')}>
      <Link href="/" className={styles.back}>
        ← Your splits
      </Link>
      <section className={styles.head}>
        <div>
          <span className="t-label">Saved split</span>
          <h1 className="t-title">{data.merchant || 'Receipt'}</h1>
          <p className="t-meta">
            {data.date ?? new Date(split.created_at).toLocaleDateString()} · {data.groupName}
          </p>
        </div>
        <div className={styles.total}>
          <strong>{formatMoney(data.totalCents, data.currency)}</strong>
          <span>✓ in Splitwise</span>
        </div>
      </section>

      <section className={styles.card}>
        <h2>Items</h2>
        <ul className={styles.items}>
          {data.items.map((item, index) => (
            <li key={index}>
              <span>{item.name}</span>
              <span>{formatMoney(item.cents, data.currency)}</span>
            </li>
          ))}
        </ul>
        <div className={styles.totalLine}>
          <span>Tax and tip</span>
          <span>{formatMoney(data.taxCents + data.tipCents + data.feeCents, data.currency)}</span>
        </div>
      </section>

      <section className={styles.card}>
        <h2>Split with</h2>
        <ul className={styles.people}>
          {data.people.map((person) => (
            <li key={person.id}>
              <span>{person.name}</span>
              <span>{person.id === data.payerId ? 'Paid' : 'Shared'}</span>
            </li>
          ))}
        </ul>
      </section>

      {split.expense_ids[0] ? (
        <a
          className={styles.open}
          href={'https://secure.splitwise.com/expenses/' + split.expense_ids[0]}
          target="_blank"
          rel="noreferrer"
        >
          Open in Splitwise
        </a>
      ) : null}

      <SplitActions
        splitId={split.id}
        archived={Boolean(split.archived_at)}
        hasSplitwiseExpense={split.expense_ids.length > 0}
      />
    </div>
  )
}
