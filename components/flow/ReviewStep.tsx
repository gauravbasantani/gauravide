'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { CURRENCIES, currencyLabel, formatMoney, parseMoney } from '@/lib/money'
import { splitQuantityIntoItems, unitCount, type ExtractedReceipt } from '@/lib/receipt'
import styles from './ReviewStep.module.css'
import flow from './flow.module.css'

type Props = {
  receipt: ExtractedReceipt
  warnings: string[]
  onChange: (next: ExtractedReceipt) => void
  onBack: () => void
  onNext: () => void
  /** The scanned photo, to check the lines against. */
  imageUrl?: string | null
}

const LOW_CONFIDENCE = 0.7

export function ReviewStep({ receipt, warnings, imageUrl, onChange, onBack, onNext }: Props) {
  const [itemRevision, setItemRevision] = useState(0)
  const currency = receipt.currency
  const money = (cents: number) => formatMoney(cents, currency)
  const symbol = formatMoney(0, currency).replace(/[\d.,\s]/g, '') || '$'

  const itemSum = useMemo(() => receipt.items.reduce((a, i) => a + i.cents, 0), [receipt.items])
  const extras = receipt.taxCents + receipt.tipCents + receipt.feeCents
  const total = receipt.totalCents ?? itemSum + extras
  const addsUp = itemSum + extras === total
  const namedItems = receipt.items.filter((item) => item.name.trim()).length
  const lowLines = receipt.items.filter((item) => (item.confidence ?? 1) < LOW_CONFIDENCE).length
  const quantityLines = receipt.items.filter((item) => unitCount(item) >= 2).length

  function patchItem(index: number, patch: Partial<ExtractedReceipt['items'][number]>) {
    const items = receipt.items.map((item, i) => (i === index ? { ...item, ...patch } : item))
    onChange({ ...receipt, items })
  }

  function setMoney(index: number, raw: string) {
    const parsed = parseMoney(raw)
    if (parsed.ok) patchItem(index, { cents: parsed.cents, confidence: 1 })
  }

  function splitQuantity(index: number) {
    const item = receipt.items[index]
    if (!item || unitCount(item) < 2) return

    const rows = splitQuantityIntoItems(item)
    onChange({
      ...receipt,
      items: [...receipt.items.slice(0, index), ...rows, ...receipt.items.slice(index + 1)],
    })
    // Inputs use defaultValue so partially typed money remains editable. Only
    // a quantity expansion changes one line into several, so remount then.
    setItemRevision((revision) => revision + 1)
  }

  function addItem() {
    // Manual entry opens with one blank starter row. Treat the first "Add
    // item" tap as an invitation to use that row, not a duplicate blank line.
    const starter =
      receipt.items.length === 1 && receipt.items[0]?.name.trim() === '' && receipt.items[0]?.cents === 0
    if (starter) {
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLInputElement>('[aria-label="Item 1 name"]')?.focus()
      })
      return
    }
    onChange({
      ...receipt,
      items: [...receipt.items, { id: crypto.randomUUID(), name: '', qty: 1, cents: 0, confidence: 1 }],
    })
  }

  return (
    <>
      <div className={flow.head}>
        <div>
          <h1 className="t-title">Check the items</h1>
          <p className="t-meta">
            Step 2 · {receipt.items.length} {receipt.items.length === 1 ? 'line' : 'lines'} ·{' '}
            {money(total)}
          </p>
        </div>
      </div>

      <div className={flow.helper}>
        <span className={flow.helperIcon} aria-hidden="true">
          ✓
        </span>
        <div className={flow.helperContent}>
          <strong>
            {namedItems > 0
              ? `We read ${namedItems} item${namedItems === 1 ? '' : 's'} — give them a quick look`
              : 'Add what’s on the receipt'}
          </strong>
          <span>
            Fix anything that looks off. These names are what everyone sees in Splitwise.
            {lowLines > 0
              ? ` ${lowLines} highlighted line${lowLines === 1 ? ' was' : 's were'} hard to read.`
              : ''}
            {quantityLines > 0
              ? ' A line with a quantity (like 4 bags of tomatoes) can be split into units for different people.'
              : ''}
          </span>
        </div>
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

      {imageUrl ? (
        <details className={styles.photo}>
          <summary>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className={styles.photoThumb} />
            <span className={styles.photoText}>
              <strong>Your receipt photo</strong>
              <small>Open it to compare against the lines below</small>
            </span>
          </summary>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="The receipt you scanned" className={styles.photoFull} />
        </details>
      ) : null}

      {/* ── 1. Where and when ─────────────────────────────────── */}
      <section className={flow.card} aria-labelledby="where-title">
        <header className={flow.sectionHead}>
          <span className={flow.stepBadge} aria-hidden="true">
            1
          </span>
          <div>
            <h2 id="where-title" className={flow.sectionTitle}>
              Where and when
            </h2>
            <p className={flow.sectionHint}>Becomes the expense name and date in Splitwise.</p>
          </div>
        </header>
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
          {/* Read from the receipt, but a dollar sign is shared by a dozen
              countries — and this is the last chance to correct it before
              the expense reaches Splitwise. */}
          <div className={styles.currencyField}>
            <label className={styles.currencyLabel} htmlFor="receipt-currency">
              Currency
            </label>
            <select
              id="receipt-currency"
              className={styles.currencySelect}
              value={CURRENCIES.includes(currency as (typeof CURRENCIES)[number]) ? currency : 'USD'}
              onChange={(e) => onChange({ ...receipt, currency: e.target.value })}
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {currencyLabel(code)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* ── 2. Items ──────────────────────────────────────────── */}
      <section className={[flow.card, flow.gapTop].join(' ')} aria-labelledby="items-title">
        <header className={flow.sectionHead}>
          <span className={flow.stepBadge} aria-hidden="true">
            2
          </span>
          <div className={styles.itemsHead}>
            <div>
              <h2 id="items-title" className={flow.sectionTitle}>
                Items
              </h2>
              <p className={flow.sectionHint}>
                Tap a name or price to edit. Discounts stay negative.
              </p>
            </div>
            <span className={styles.itemsSum} data-num>
              {money(itemSum)}
            </span>
          </div>
        </header>

        {receipt.items.length > 0 ? (
          <div className={styles.columns} aria-hidden="true">
            <span>Item</span>
            <span>Price</span>
            <span />
          </div>
        ) : null}

        <ul className={flow.rows}>
          {receipt.items.map((item, i) => {
            const low = (item.confidence ?? 1) < LOW_CONFIDENCE
            const units = unitCount(item)
            return (
              <li
                key={item.id ?? itemRevision + ':' + i}
                className={[styles.item, low ? styles.low : ''].filter(Boolean).join(' ')}
              >
                <div className={styles.itemMain}>
                  <input
                    className={styles.name}
                    defaultValue={item.name}
                    placeholder="Item name"
                    aria-label={`Item ${i + 1} name`}
                    onBlur={(e) => patchItem(i, { name: e.target.value })}
                  />
                  <div className={styles.meta}>
                    {item.cents < 0 ? <span className={styles.discount}>Discount</span> : null}
                    {item.taxFlag ? (
                      <span className={styles.flag} title="Tax code printed on the receipt">
                        Tax {item.taxFlag}
                      </span>
                    ) : null}
                    {units >= 2 ? (
                      <button
                        type="button"
                        className={styles.splitQty}
                        onClick={() => splitQuantity(i)}
                      >
                        Split into {units}
                      </button>
                    ) : item.qty > 1 ? (
                      <span className={styles.qty}>Qty {item.qty} · shared as one line</span>
                    ) : null}
                    {low ? <span className={styles.check}>Check this one</span> : null}
                  </div>
                </div>
                <label
                  className={[styles.priceWrap, item.cents < 0 ? styles.negative : '']
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span aria-hidden="true">{symbol}</span>
                  <input
                    className={styles.price}
                    defaultValue={(item.cents / 100).toFixed(2)}
                    inputMode="decimal"
                    aria-label={`Price of ${item.name}`}
                    onBlur={(e) => setMoney(i, e.target.value)}
                  />
                </label>
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
              </li>
            )
          })}
        </ul>

        <div className={styles.add}>
          <Button variant="tertiary" onClick={addItem}>
            + Add item
          </Button>
        </div>
      </section>

      {/* ── 3. Tax, tip, fees ─────────────────────────────────── */}
      <section className={[flow.card, flow.gapTop].join(' ')} aria-labelledby="extras-title">
        <header className={flow.sectionHead}>
          <span className={flow.stepBadge} aria-hidden="true">
            3
          </span>
          <div>
            <h2 id="extras-title" className={flow.sectionTitle}>
              Tax, tip and fees
            </h2>
            <p className={flow.sectionHint}>
              Use what’s printed. These are shared by what each person had, not evenly.
            </p>
          </div>
        </header>
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
            help="Often handwritten"
            onBlur={(e) => {
              const p = parseMoney(e.target.value)
              if (p.ok) onChange({ ...receipt, tipCents: p.cents })
            }}
          />
          <Field
            label="Fees"
            money
            defaultValue={(receipt.feeCents / 100).toFixed(2)}
            help="Delivery, service"
            onBlur={(e) => {
              const p = parseMoney(e.target.value)
              if (p.ok) onChange({ ...receipt, feeCents: p.cents })
            }}
          />
        </div>

        <div className={styles.totals}>
          <div className={styles.totalLine}>
            <span>Items</span>
            <span data-num>{money(itemSum)}</span>
          </div>
          <div className={styles.totalLine}>
            <span>Tax, tip and fees</span>
            <span data-num>{money(extras)}</span>
          </div>
          <div className={[styles.totalLine, styles.grand].join(' ')}>
            <span>Total to split</span>
            <span data-num>{money(total)}</span>
          </div>
          <p className={addsUp ? styles.ok : styles.warn} aria-live="polite">
            {addsUp
              ? '✓ Adds up to the receipt total'
              : `Items plus extras come to ${money(itemSum + extras)} — the receipt says ${money(total)}. Check a price or the tax.`}
          </p>
        </div>
      </section>

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
