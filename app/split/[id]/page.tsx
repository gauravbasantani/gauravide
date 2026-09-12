import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { formatMoney } from '@/lib/money'
import { dbConfigured, selectOneOwned } from '@/lib/db'
import { getSession, ownerId } from '@/lib/session'
import {
  paidByLabel,
  payersOf,
  viewerBalance,
  type StoredItem,
  type StoredSplit,
} from '@/lib/history'
import { netBalances, suggestTransfers } from '@/lib/split'
import { colourOf, initialsOf } from '@/lib/avatar'
import { EditSplitButton } from './EditSplitButton'
import { SplitActions } from './SplitActions'
import { SyncPanel } from './SyncPanel'
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
  const person = (personId: string) => data.people.find((p) => String(p.id) === personId)
  const nameOf = (personId: string) =>
    personId === me ? 'You' : (person(personId)?.name ?? 'Someone')
  const nameIn = (personId: string) => (personId === me ? 'you' : nameOf(personId))
  const firstName = (personId: string) =>
    personId === me ? 'You' : (person(personId)?.name.split(' ')[0] ?? 'Someone')

  const balance = viewerBalance(split)
  const net = data.owed && data.paid ? netBalances(data.owed, data.paid) : null
  const transfers = net ? suggestTransfers(net) : []
  const payers = payersOf(split)
  const merchant = data.merchant || 'Receipt'
  const itemsTotal = data.items.reduce((a, item) => a + item.cents, 0)
  const extras = data.taxCents + data.tipCents + data.feeCents
  const mode = data.mode ?? 'items'

  /** "You · Alex · $6.00 each", "You ×2 · Alex ×1", or "You $7.00 · Alex $3.00". */
  function sharedBy(item: StoredItem): string | null {
    const ids = (item.people ?? []).map(String)
    if (ids.length === 0) return null
    const values = item.split?.values ?? {}
    if (item.split?.kind === 'shares') {
      return ids.map((pid) => `${firstName(pid)} ×${values[pid] ?? 0}`).join(' · ')
    }
    if (item.split?.kind === 'exact') {
      return ids.map((pid) => `${firstName(pid)} ${money(values[pid] ?? 0)}`).join(' · ')
    }
    if (ids.length === 1) return firstName(ids[0] ?? '')
    return `${ids.map(firstName).join(' · ')} · ${money(Math.round(item.cents / ids.length))} each`
  }

  return (
    <div className={[styles.page, 'shell'].join(' ')}>
      <div className={styles.topBar}>
        <Link href="/" className={styles.back}>
          ← Your splits
        </Link>
        <div className={styles.topActions}>
          <EditSplitButton split={split} />
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
        </div>
      </div>

      {/* ── Summary ─────────────────────────────────────────────── */}
      {data.deletedInSplitwise ? (
        <p className={styles.flag} role="status">
          This expense was deleted in Splitwise. What you see here is your own saved copy.
        </p>
      ) : null}
      {data.itemsStale ? (
        <p className={styles.flag} role="status">
          The amounts came from Splitwise after someone changed them there, so the item breakdown
          below may not add up to the total any more.
        </p>
      ) : null}

      <section className={styles.hero}>
        <span className={styles.tile} style={{ background: colourOf(split.id) }} aria-hidden="true">
          {merchant.charAt(0).toUpperCase()}
        </span>
        <div className={styles.heroMain}>
          <h1 className={styles.title}>{merchant}</h1>
          <p className="t-meta">
            {data.date ?? new Date(split.created_at).toLocaleDateString()} · {data.groupName} ·{' '}
            {MODE_LABEL[mode]}
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

      <div className={[styles.grid, split.image_path ? styles.withPhoto : ''].join(' ')}>
        {/* ── Receipt photo ─────────────────────────────────────── */}
        {split.image_path ? (
          <section className={[styles.card, styles.photoCard].join(' ')} aria-label="Receipt photo">
            <h2>Receipt</h2>
            <a
              href={`/api/splits/${split.id}/image`}
              target="_blank"
              rel="noreferrer"
              className={styles.photoLink}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/splits/${split.id}/image`}
                alt={`Receipt from ${merchant}`}
                className={styles.photo}
              />
              <span>Open full size ↗</span>
            </a>
          </section>
        ) : null}

        <div className={styles.column}>
          {/* ── Who paid ──────────────────────────────────────── */}
          <section className={styles.card}>
            <h2>Who paid</h2>
            <ul className={styles.people}>
              {payers.map(([pid, cents]) => (
                <li key={pid}>
                  <span className={styles.avatar} style={{ background: colourOf(pid) }} aria-hidden="true">
                    {initialsOf(person(pid)?.name ?? '?')}
                  </span>
                  <span className={styles.personMain}>
                    <strong>{nameOf(pid)}</strong>
                    <span>{payers.length > 1 ? 'Paid part of the bill' : 'Paid the whole bill'}</span>
                  </span>
                  <span className={styles.amount}>{money(cents)}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* ── Who owes what ─────────────────────────────────── */}
          <section className={styles.card}>
            <h2>Who owes what</h2>
            <ul className={styles.people}>
              {data.people.map((p) => {
                const pid = String(p.id)
                const owed = data.owed?.[pid]
                const personNet = net?.[pid] ?? 0
                return (
                  <li key={p.id}>
                    <span className={styles.avatar} style={{ background: colourOf(pid) }} aria-hidden="true">
                      {initialsOf(p.name)}
                    </span>
                    <span className={styles.personMain}>
                      <strong>{pid === me ? `${p.name} (you)` : p.name}</strong>
                      <span>{owed !== undefined ? `Share ${money(owed)}` : 'Shared'}</span>
                    </span>
                    {net ? (
                      personNet > 0 ? (
                        <span className={[styles.balance, styles.lent].join(' ')}>
                          gets back <strong>{money(personNet)}</strong>
                        </span>
                      ) : personNet < 0 ? (
                        <span className={[styles.balance, styles.borrowed].join(' ')}>
                          {pid === me ? 'you owe' : 'owes'} <strong>{money(-personNet)}</strong>
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
                <strong>To settle up</strong>
                {transfers.map((t) => (
                  <p key={t.from + t.to}>
                    <span>
                      <strong>{nameOf(t.from)}</strong> {t.from === me ? 'pay' : 'pays'}{' '}
                      <strong>{nameIn(t.to)}</strong>
                    </span>
                    <span>{money(t.cents)}</span>
                  </p>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {/* ── Items, and who shared each ─────────────────────────── */}
      {data.items.length > 0 ? (
        <section className={styles.card}>
          <h2>Items</h2>
          {mode !== 'items' ? (
            <p className={styles.modeNote}>
              {MODE_LABEL[mode]} — the total was divided, so items weren’t given to people one by
              one.
            </p>
          ) : null}
          <ul className={styles.items}>
            {data.items.map((item, index) => {
              const shared = mode === 'items' ? sharedBy(item) : null
              const ids = (item.people ?? []).map(String)
              return (
                <li key={index}>
                  <span className={styles.itemMain}>
                    <span className={styles.itemName}>{item.name}</span>
                    {shared ? (
                      <span className={styles.itemPeople}>
                        <span className={styles.stack} aria-hidden="true">
                          {ids.slice(0, 4).map((pid) => (
                            <span key={pid} style={{ background: colourOf(pid) }}>
                              {initialsOf(person(pid)?.name ?? '?')}
                            </span>
                          ))}
                        </span>
                        {shared}
                      </span>
                    ) : null}
                  </span>
                  <span className={item.cents < 0 ? styles.discount : styles.price}>
                    {money(item.cents)}
                  </span>
                </li>
              )
            })}
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
          <div className={[styles.totalLine, styles.grand].join(' ')}>
            <span>Total</span>
            <span>{money(data.totalCents)}</span>
          </div>
        </section>
      ) : null}

      <SyncPanel
        splitId={split.id}
        syncedAt={data.syncedAt ?? null}
        deletedInSplitwise={data.deletedInSplitwise ?? false}
      />

      <SplitActions
        splitId={split.id}
        archived={Boolean(split.archived_at)}
        hasSplitwiseExpense={split.expense_ids.length > 0}
      />
    </div>
  )
}
