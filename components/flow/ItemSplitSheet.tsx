'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { colourOf, initialsOf } from './AvatarToggle'
import { allocate, formatMoney, parseMoney } from '@/lib/money'
import { unitCount } from '@/lib/receipt'
import type { ItemSplit, Person } from '@/lib/draft'
import styles from './ItemSplitSheet.module.css'
import flow from './flow.module.css'

type Kind = 'equal' | 'shares' | 'exact'

type Props = {
  /** The line being split. null = sheet closed. */
  item: { id: string; name: string; cents: number; qty: number } | null
  people: Person[]
  currency: string
  /** Who is on the line right now. */
  assigned: string[]
  split?: ItemSplit
  onSave: (people: string[], split: ItemSplit | null) => void
  /** Present for quantity lines: make each unit its own line instead. */
  onSplitUnits?: () => void
  onClose: () => void
}

const KINDS: { value: Kind; title: string; hint: string; icon: string }[] = [
  { value: 'equal', title: 'Equally', hint: 'Same for each', icon: '＝' },
  { value: 'shares', title: 'By shares', hint: 'e.g. 2 : 1', icon: '½' },
  { value: 'exact', title: 'Exact', hint: 'Type amounts', icon: '=' },
]

const zip = (ids: string[], values: number[]) =>
  Object.fromEntries(ids.map((id, i) => [id, values[i] ?? 0]))

/**
 * Split ONE receipt line unevenly (FR-32) — the steak two people shared but
 * one ate most of, or a bottle split 2 : 1. Tax on the line follows the same
 * split automatically, because lib/split uses these parts for tax weights too.
 */
export function ItemSplitSheet({
  item,
  people,
  currency,
  assigned,
  split,
  onSave,
  onSplitUnits,
  onClose,
}: Props) {
  const [kind, setKind] = useState<Kind>('equal')
  const [included, setIncluded] = useState<string[]>([])
  const [shares, setShares] = useState<Record<string, number>>({})
  const [exact, setExact] = useState<Record<string, number>>({})

  // Start from what the line already has whenever a different line opens.
  useEffect(() => {
    if (!item) return
    const start = assigned.length > 0 ? assigned : people.map((p) => p.id)
    setKind(split?.kind ?? 'equal')
    setIncluded(start)
    setShares(
      split?.kind === 'shares'
        ? split.values
        : Object.fromEntries(people.map((p) => [p.id, start.includes(p.id) ? 1 : 0])),
    )
    setExact(
      split?.kind === 'exact' ? split.values : zip(start, allocate(item.cents, start.map(() => 1))),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id])

  if (!item) return null

  const money = (cents: number) => formatMoney(cents, currency)
  const ids = people.map((p) => p.id)
  const totalShares = ids.reduce((a, id) => a + (shares[id] ?? 0), 0)
  const exactSum = ids.reduce((a, id) => a + (exact[id] ?? 0), 0)
  const gap = item.cents - exactSum
  const inIds = ids.filter((id) => included.includes(id))

  const amounts: Record<string, number> =
    kind === 'equal'
      ? zip(inIds, allocate(item.cents, inIds.map(() => 1)))
      : kind === 'shares'
        ? totalShares > 0
          ? zip(ids, allocate(item.cents, ids.map((id) => shares[id] ?? 0)))
          : {}
        : exact

  const problem =
    kind === 'equal' && inIds.length === 0
      ? 'Choose at least one person'
      : kind === 'shares' && totalShares === 0
        ? 'Give at least one person a share'
        : kind === 'exact' && gap !== 0
          ? gap > 0
            ? `${money(gap)} still to assign`
            : `${money(-gap)} more than this item`
          : undefined

  function save() {
    if (problem) return
    if (kind === 'equal') {
      onSave(inIds, null)
      return
    }
    const source = kind === 'shares' ? shares : exact
    const values = Object.fromEntries(
      ids.filter((id) => (source[id] ?? 0) !== 0).map((id) => [id, source[id] ?? 0]),
    )
    onSave(Object.keys(values), { kind, values })
  }

  const units = unitCount(item)

  return (
    <Sheet
      open
      title={`Split “${item.name}”`}
      description={`${money(item.cents)} — choose who had it and how to divide this one line. Its tax follows the same split.`}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={Boolean(problem)} disabledReason={problem}>
            Save split
          </Button>
        </>
      }
    >
      {onSplitUnits && units >= 2 ? (
        <div className={styles.units}>
          <div>
            <strong>This line is {units} separate units</strong>
            <span>Different people took different ones? Give each unit its own line.</span>
          </div>
          <Button variant="secondary" onClick={onSplitUnits}>
            Split into {units} lines
          </Button>
        </div>
      ) : null}

      <div
        className={[flow.segmented, styles.kinds].join(' ')}
        data-columns="3"
        role="radiogroup"
        aria-label="How to divide this item"
      >
        {KINDS.map((option) => (
          <label key={option.value} className={flow.segment} data-checked={kind === option.value}>
            <input
              type="radio"
              name={`item-split-${item.id}`}
              className="sr-only"
              checked={kind === option.value}
              onChange={() => setKind(option.value)}
            />
            <span className={flow.segmentIcon} aria-hidden="true">
              {option.icon}
            </span>
            <span className={flow.segmentTitle}>{option.title}</span>
            <span className={flow.segmentHint}>{option.hint}</span>
          </label>
        ))}
      </div>

      <ul className={styles.rows}>
        {people.map((p) => {
          const isIn = included.includes(p.id)
          const count = shares[p.id] ?? 0
          return (
            <li key={p.id} className={styles.row}>
              <span className={styles.avatar} style={{ background: colourOf(p.id) }} aria-hidden="true">
                {initialsOf(p.name)}
              </span>
              <span className={styles.name}>{p.name}</span>

              {kind === 'equal' ? (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isIn}
                  aria-label={`${p.name} had this`}
                  className={styles.check}
                  data-on={isIn}
                  onClick={() =>
                    setIncluded(isIn ? included.filter((id) => id !== p.id) : [...included, p.id])
                  }
                >
                  {isIn ? '✓' : ''}
                </button>
              ) : null}

              {kind === 'shares' ? (
                <span className={styles.stepper}>
                  <button
                    type="button"
                    aria-label={`One fewer share for ${p.name}`}
                    onClick={() => setShares({ ...shares, [p.id]: Math.max(0, count - 1) })}
                    disabled={count === 0}
                  >
                    −
                  </button>
                  <output aria-label={`${p.name} shares`}>{count}</output>
                  <button
                    type="button"
                    aria-label={`One more share for ${p.name}`}
                    onClick={() => setShares({ ...shares, [p.id]: Math.min(99, count + 1) })}
                  >
                    +
                  </button>
                </span>
              ) : null}

              {kind === 'exact' ? (
                <span className={styles.exact}>
                  <Field
                    key={`${item.id}-${p.id}`}
                    label={`${p.name} pays`}
                    money
                    defaultValue={((exact[p.id] ?? 0) / 100).toFixed(2)}
                    onBlur={(e) => {
                      const parsed = parseMoney(e.target.value || '0')
                      if (parsed.ok) setExact({ ...exact, [p.id]: parsed.cents })
                    }}
                  />
                </span>
              ) : (
                <span className={styles.amount} data-num>
                  {amounts[p.id] ? money(amounts[p.id] ?? 0) : '—'}
                </span>
              )}
            </li>
          )
        })}
      </ul>

      {kind === 'exact' ? (
        <p className={gap === 0 ? styles.ok : styles.warn} aria-live="polite">
          {gap === 0 ? `✓ All ${money(item.cents)} assigned` : problem}
        </p>
      ) : null}
    </Sheet>
  )
}
