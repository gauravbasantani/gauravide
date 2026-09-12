'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { formatMoney, parseMoney } from '@/lib/money'
import type { ExtractedReceipt } from '@/lib/receipt'
import styles from './ReviewStep.module.css'
import flow from './flow.module.css'

type Props = {
  receipt: ExtractedReceipt
  warnings: string[]
  onChange: (next: ExtractedReceipt) => void
  onBack: () => void
  onNext: () => void
}

const LOW_CONFIDENCE = 0.7

export function ReviewStep({ receipt, warnings, onChange, onBack, onNext }: Props) {
  const itemSum = useMemo(
    () => receipt.items.reduce((a, i) => a + i.cents, 0),
    [receipt.items],
  )

  const subtotal = receipt.subtotalCents ?? itemSum
  const total = receipt.totalCents ?? subtotal + receipt.taxCents + receipt.tipCents + receipt.feeCents

  function patchItem(index: number, patch: Partial<ExtractedReceipt['items'][number]>) {
    const items = receipt.items.map((item, i) => (i === index ? { ...item, ...patch } : item))
    onChange({ ...receipt, items })
  }

  function setMoney(index: number, raw: string) {
    const parsed = parseMoney(raw)
    if (parsed.ok) patchItem(index, { cents: parsed.cents, confidence: 1 })
  }

  return (
    <>
      <div className={flow.head}>
        <div>
          <h1 className="t-title">Check the items</h1>
          <p className="t-meta">
            {receipt.merchant ?? 'Receipt'}
            {receipt.date ? ` · ${receipt.date}` : ''}
          </p>
        </div>
        <p className="t-caption">Tap anything to fix it.</p>
      </div>

      {warnings.length > 0 ? (
        <div className={flow.notice} style={{ marginBottom: 'var(--space-5)' }}>
          <span className={flow.noticeIcon} aria-hidden="true">
            !
          </span>
          <div>
            <strong>Worth a second look</strong>
            <ul className={flow.noticeList}>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className={flow.card}>
        <div className={styles.headRow}>
          <Field
            label="Merchant"
            defaultValue={receipt.merchant ?? ''}
            placeholder="Where was this?"
            onBlur={(e) => onChange({ ...receipt, merchant: e.target.value || null })}
          />
          <Field
            label="Date"
            type="date"
            defaultValue={receipt.date ?? ''}
            onBlur={(e) => onChange({ ...receipt, date: e.target.value || null })}
          />
        </div>

        <ul className={flow.rows}>
          {receipt.items.map((item, i) => {
            const low = (item.confidence ?? 1) < LOW_CONFIDENCE
            return (
              <li key={i} className={[styles.item, low ? styles.low : ''].filter(Boolean).join(' ')}>
                <input
                  className={styles.name}
                  defaultValue={item.name}
                  aria-label={`Item ${i + 1} name`}
                  onBlur={(e) => patchItem(i, { name: e.target.value })}
                />
                <input
                  className={[styles.price, item.cents < 0 ? styles.negative : '']
                    .filter(Boolean)
                    .join(' ')}
                  defaultValue={(item.cents / 100).toFixed(2)}
                  inputMode="decimal"
                  aria-label={`Price of ${item.name}`}
                  onBlur={(e) => setMoney(i, e.target.value)}
                />
                <div className={styles.meta}>
                  {item.taxFlag ? (
                    <span className={styles.flag} title="Tax code printed on the receipt">
                      Tax {item.taxFlag}
                    </span>
                  ) : null}
                  {low ? <span className="t-caption">Check this one</span> : null}
                  <button
                    type="button"
                    className={styles.remove}
                    onClick={() =>
                      onChange({ ...receipt, items: receipt.items.filter((_, j) => j !== i) })
                    }
                    aria-label={`Remove ${item.name}`}
                  >
                    ✕
                  </button>
                </div>
              </li>
            )
          })}
        </ul>

        <div className={styles.add}>
          <Button
            variant="tertiary"
            onClick={() =>
              onChange({
                ...receipt,
                items: [...receipt.items, { name: '', qty: 1, cents: 0, confidence: 1 }],
              })
            }
          >
            + Add item
          </Button>
        </div>

        <div className={styles.adjust}>
          <Field
            label="Tax"
            money
            defaultValue={(receipt.taxCents / 100).toFixed(2)}
            onBlur={(e) => {
              const p = parseMoney(e.target.value)
              if (p.ok) onChange({ ...receipt, taxCents: p.cents })
            }}
          />
          <Field
            label="Tip"
            money
            defaultValue={(receipt.tipCents / 100).toFixed(2)}
            help="Often not printed"
            onBlur={(e) => {
              const p = parseMoney(e.target.value)
              if (p.ok) onChange({ ...receipt, tipCents: p.cents })
            }}
          />
          <Field
            label="Fees"
            money
            defaultValue={(receipt.feeCents / 100).toFixed(2)}
            onBlur={(e) => {
              const p = parseMoney(e.target.value)
              if (p.ok) onChange({ ...receipt, feeCents: p.cents })
            }}
          />
        </div>

        <div className={flow.totals}>
          <div className={flow.totalLine}>
            <span className={flow.muted}>Items</span>
            <span data-num>{formatMoney(itemSum, receipt.currency)}</span>
          </div>
          <div className={flow.totalLine}>
            <span className={flow.muted}>Tax</span>
            <span data-num>{formatMoney(receipt.taxCents, receipt.currency)}</span>
          </div>
          <div className={[flow.totalLine, flow.grand].join(' ')}>
            <span>Total</span>
            <span data-num>{formatMoney(total, receipt.currency)}</span>
          </div>
        </div>
      </div>

      <div className={flow.cta}>
        <div className={flow.ctaInner}>
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
          <Button
            full
            onClick={onNext}
            disabled={receipt.items.length === 0 && total === 0}
            disabledReason={
              receipt.items.length === 0 && total === 0
                ? 'Add at least one item, or enter a total to split'
                : undefined
            }
          >
            Looks right
          </Button>
        </div>
      </div>
    </>
  )
}
