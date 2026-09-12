'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { colourOf } from './AvatarToggle'
import { formatMoney } from '@/lib/money'
import { computeSplit, settleRounding, type Item } from '@/lib/split'
import type { ExtractedReceipt } from '@/lib/receipt'
import type { Person } from '@/lib/draft'
import styles from './ConfirmStep.module.css'
import flow from './flow.module.css'

type Props = {
  receipt: ExtractedReceipt
  people: Person[]
  assignments: Record<string, string[]>
  payerId: string | null
  onPayer: (id: string) => void
  onBack: () => void
  onDone: () => void
}

export function ConfirmStep({
  receipt,
  people,
  assignments,
  payerId,
  onPayer,
  onBack,
  onDone,
}: Props) {
  const [copied, setCopied] = useState(false)

  const total =
    receipt.totalCents ??
    receipt.items.reduce((a, i) => a + i.cents, 0) +
      receipt.taxCents +
      receipt.tipCents +
      receipt.feeCents

  const payer = payerId ?? people[0]?.id ?? ''

  const { shares, reconciles } = useMemo(() => {
    const items: Item[] = receipt.items.map((item, i) => ({
      id: String(i),
      name: item.name || `Item ${i + 1}`,
      cents: item.cents,
      ...(item.taxFlag ? { taxFlag: item.taxFlag } : {}),
      people: assignments[String(i)] ?? [],
    }))
    const r = computeSplit({
      items,
      people: people.map((p) => p.id),
      taxLines: receipt.taxLines,
      taxCents: receipt.taxCents,
      tipCents: receipt.tipCents,
      feeCents: receipt.feeCents,
      totalCents: total,
    })
    // Any rounding drift lands on the payer (FR-18).
    const settled = payer ? settleRounding(r.shares, total, payer) : r.shares
    const sum = Object.values(settled).reduce((a, b) => a + b, 0)
    return { shares: settled, reconciles: sum === total && r.unassignedItemIds.length === 0 }
  }, [receipt, people, assignments, total, payer])

  const summaryText = useMemo(() => {
    const lines = [
      `${receipt.merchant ?? 'Receipt'}${receipt.date ? ` — ${receipt.date}` : ''}`,
      `Total ${formatMoney(total, receipt.currency)}`,
      '',
      ...people.map((p) => `${p.name}: ${formatMoney(shares[p.id] ?? 0, receipt.currency)}`),
    ]
    return lines.join('\n')
  }, [receipt, people, shares, total])

  async function copy() {
    try {
      await navigator.clipboard.writeText(summaryText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <div className={flow.head}>
        <h1 className="t-title">Ready</h1>
      </div>

      <div className={styles.blocked}>
        <strong>Pushing to Splitwise isn’t wired up yet.</strong>
        <span>
          Splitwise now requires a Pro subscription to register an app. Until then, copy the
          summary below and add it in Splitwise — everything else here is done for you.
        </span>
      </div>

      <div className={flow.card}>
        <div className={styles.total}>
          <span className="t-meta">
            {receipt.merchant ?? 'Receipt'}
            {receipt.date ? ` · ${receipt.date}` : ''}
          </span>
          <span className={styles.amount} data-num>
            {formatMoney(total, receipt.currency)}
          </span>
          <span className={[styles.check, reconciles ? '' : styles.fail].join(' ')}>
            {reconciles ? '✓ matches receipt' : '✕ the numbers don’t add up yet'}
          </span>
        </div>

        <div className={styles.payer}>
          <label className="t-meta" htmlFor="payer">
            Paid by
          </label>
          <select
            id="payer"
            className={styles.select}
            value={payer}
            onChange={(e) => onPayer(e.target.value)}
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {people.map((p) => (
          <div key={p.id} className={styles.person}>
            <span
              className={styles.dot}
              style={{ background: colourOf(p.id) }}
              aria-hidden="true"
            />
            <span className={styles.personName}>
              {p.name}
              {p.id === payer ? <span className={styles.sub}> · paid</span> : null}
            </span>
            <span className={styles.personAmount} data-num>
              {formatMoney(shares[p.id] ?? 0, receipt.currency)}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.summary}>
        <strong>Summary to paste into Splitwise</strong>
        <pre className={styles.pre}>{summaryText}</pre>
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Button variant="secondary" onClick={copy}>
            {copied ? '✓ Copied' : 'Copy summary'}
          </Button>
        </div>
      </div>

      <div className={flow.cta}>
        <div className={flow.ctaInner}>
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
          <Button
            full
            onClick={onDone}
            disabled={!reconciles}
            disabledReason={
              reconciles ? undefined : 'The shares don’t add up to the total — go back and check'
            }
          >
            Done
          </Button>
        </div>
      </div>
    </>
  )
}
