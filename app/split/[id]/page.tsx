import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { formatMoney } from '@/lib/money'
import { dbConfigured, selectOneOwned } from '@/lib/db'
import { getSession, ownerId } from '@/lib/session'
import { paidByLabel, viewerBalance, type StoredSplit } from '@/lib/history'
import { netBalances, suggestTransfers } from '@/lib/split'
import { colourOf, initialsOf } from '@/components/flow/AvatarToggle'
import { SplitActions } from './SplitActions'
import styles from './split.module.css'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MODE_LABEL = {
  items: 'Split by item',
  equal: 'Split equally',
  shares: 'Split by shares',
  exact: 'Exact amounts',
} as const

export default async function SplitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.accessToken) redirect('/')
  if (!dbConfigured) notFound()

  const { id } = await params
  if (!UUID.test(id)) notFound()
  let split: StoredSplit | null = null
  try {
    split = await selectOneOwned<StoredSplit>('splits', ownerId(session), id)
  } catch {
    notFound()
  }
  if (!split) notFound()

  const data = split.data
  const money = (cents: number) => formatMoney(cents, data.currency)
  const me = split.owner_id
  const nameOf = (personId: string) =>
    personId === me ? 'You' : (data.people.find((p) => String(p.id) === personId)?.name ?? 'Someone')
  const balance = viewerBalance(split)
  const net = data.owed && data.paid ? netBalances(data.owed, data.paid) : null
  const transfers = net ? suggestTransfers(net) : []
  const merchant = data.merchant || 'Receipt'
  const itemsTotal = data.items.reduce((a, item) => a + item.cents, 0)
  const extras = data.taxCents + data.tipCents + data.feeCents

  return (
    <div className={[styles.page, 'shell'].join(' ')}>
      <Link href="/" className={styles.back}>
        ← Your splits
      </Link>

      <section className={styles.hero}>
        <span className={styles.tile} style={{ background: colourOf(split.id) }} aria-hidden="true">
          {merchant.charAt(0).toUpperCase()}
        </span>
        <div className={styles.heroMain}>
          <h1 className={styles.title}>{merchant}</h1>
          <p className="t-meta">
            {data.date ?? new Date(split.created_at).toLocaleDateString()} · {data.groupName}
            {data.mode ? ` · ${MODE_LABEL[data.mode]}` : ''}
          </p>
          <p className={styles.paidBy}>{paidByLabel(split, money)}</p>
        </div>
        <div className={styles.total}>
          <strong>{money(data.totalCents)}</strong>
          {balance && balance.net > 0 ? (
            <span className={styles.lent}>you lent {money(balance.net)}</span>
          ) : balance && balance.net < 0 ? (
            <span className={styles.borrowed}>you borrowed {money(-balance.net)}</span>
          ) : (
            <span className={styles.lent}>✓ in Splitwise</span>
          )}
        </div>
      </section>

      <section className={styles.card}>
        <h2>Who owes what</h2>
        <ul className={styles.people}>
          {data.people.map((person) => {
            const pid = String(person.id)
            const owed = data.owed?.[pid]
            const paid = data.paid?.[pid] ?? (person.id === data.payerId ? data.totalCents : 0)
            const personNet = net?.[pid] ?? 0
            return (
              <li key={person.id}>
                <span className={styles.avatar} style={{ background: colourOf(pid) }} aria-hidden="true">
                  {initialsOf(person.name)}
                </span>
                <span className={styles.personMain}>
                  <strong>{pid === me ? `${person.name} (you)` : person.name}</strong>
                  <span>
                    {owed !== undefined ? `Share ${money(owed)}` : 'Shared'}
                    {paid > 0 ? ` · paid ${money(paid)}` : ''}
                  </span>
                </span>
                {net ? (
                  personNet > 0 ? (
                    <span className={[styles.balance, styles.lent].join(' ')}>
                      gets back <strong>{money(personNet)}</strong>
                    </span>
                  ) : personNet < 0 ? (
                    <span className={[styles.balance, styles.borrowed].join(' ')}>
                      owes <strong>{money(-personNet)}</strong>
                    </span>
                  ) : (
                    <span className={styles.balance}>settled</span>
                  )
                ) : null}
              </li>
            )
          })}
        </ul>
        {transfers.length > 0 ? (
          <div className={styles.transfers}>
            {transfers.map((t) => (
              <p key={t.from + t.to}>
                <span>
                  <strong>{nameOf(t.from)}</strong> {t.from === me ? 'owe' : 'owes'}{' '}
                  <strong>{nameOf(t.to)}</strong>
                </span>
                <span>{money(t.cents)}</span>
              </p>
            ))}
          </div>
        ) : null}
      </section>

      {data.items.length > 0 ? (
        <section className={styles.card}>
          <h2>Items</h2>
          <ul className={styles.items}>
            {data.items.map((item, index) => (
              <li key={index}>
                <span>{item.name}</span>
                <span>{money(item.cents)}</span>
              </li>
            ))}
          </ul>
          <div className={styles.totalLine}>
            <span>Items</span>
            <span>{money(itemsTotal)}</span>
          </div>
          {extras !== 0 ? (
            <div className={styles.totalLine}>
              <span>Tax, tip and fees</span>
              <span>{money(extras)}</span>
            </div>
          ) : null}
        </section>
      ) : null}

      {split.expense_ids[0] ? (
        <a
          className={styles.open}
          href={'https://secure.splitwise.com/expenses/' + split.expense_ids[0]}
          target="_blank"
          rel="noreferrer"
        >
          Open in Splitwise ↗
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
