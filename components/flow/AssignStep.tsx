'use client'

import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { AvatarToggle, initialsOf } from './AvatarToggle'
import { formatMoney } from '@/lib/money'
import { computeSplit, type Item } from '@/lib/split'
import type { ExtractedReceipt } from '@/lib/receipt'
import type { Person } from '@/lib/draft'
import type { SwPerson } from '@/lib/useSplitwise'
import styles from './AssignStep.module.css'
import flow from './flow.module.css'

type Props = {
  receipt: ExtractedReceipt
  people: Person[]
  /** Splitwise friends, when signed in. Absent means manual names. */
  available?: SwPerson[]
  assignments: Record<string, string[]>
  onPeople: (people: Person[]) => void
  onAssignments: (a: Record<string, string[]>) => void
  onBack: () => void
  onNext: () => void
}

export function AssignStep({
  receipt,
  people,
  available,
  assignments,
  onPeople,
  onAssignments,
  onBack,
  onNext,
}: Props) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const addPersonTrigger = useRef<HTMLButtonElement>(null)

  function closeAddPerson() {
    setAdding(false)
    // The sheet owns focus while it is open. Wait until it is removed before
    // returning focus so keyboard and mobile users always have a clear place
    // to continue from.
    window.requestAnimationFrame(() => addPersonTrigger.current?.focus())
  }

  const total =
    receipt.totalCents ??
    receipt.items.reduce((a, i) => a + i.cents, 0) +
      receipt.taxCents +
      receipt.tipCents +
      receipt.feeCents

  const items: Item[] = useMemo(
    () =>
      receipt.items.map((item, i) => ({
        id: String(i),
        name: item.name || `Item ${i + 1}`,
        cents: item.cents,
        ...(item.taxFlag ? { taxFlag: item.taxFlag } : {}),
        people: assignments[String(i)] ?? [],
      })),
    [receipt.items, assignments],
  )

  const result = useMemo(
    () =>
      computeSplit({
        items,
        people: people.map((p) => p.id),
        taxLines: receipt.taxLines,
        taxCents: receipt.taxCents,
        tipCents: receipt.tipCents,
        feeCents: receipt.feeCents,
        totalCents: total,
      }),
    [items, people, receipt, total],
  )

  const unassigned = result.unassignedItemIds.length

  function toggle(itemId: string, personId: string) {
    const current = assignments[itemId] ?? []
    const next = current.includes(personId)
      ? current.filter((p) => p !== personId)
      : [...current, personId]
    onAssignments({ ...assignments, [itemId]: next })
  }

  function assignEveryoneToEverything() {
    const all = people.map((p) => p.id)
    onAssignments(Object.fromEntries(receipt.items.map((_, i) => [String(i), all])))
  }

  function addPerson(picked?: Person) {
    const name = picked?.name ?? newName.trim()
    if (!name) return
    const person: Person = picked ?? { id: crypto.randomUUID(), name }
    if (people.some((p) => p.id === person.id)) return
    const next = [...people, person]
    onPeople(next)
    // A new person joins every line that already has everyone on it, which is
    // almost always what's meant.
    const all = new Set(people.map((p) => p.id))
    const updated = { ...assignments }
    for (const [itemId, ids] of Object.entries(assignments)) {
      if (ids.length === all.size && all.size > 0) updated[itemId] = [...ids, person.id]
    }
    onAssignments(updated)
    setNewName('')
    closeAddPerson()
  }

  const methodLabel =
    result.taxMethod === 'by-flag'
      ? 'Tax split by who bought what'
      : result.taxMethod === 'by-taxable-subtotal'
        ? 'Tax split across taxable items'
        : 'Tax and tip split in proportion to each person’s items'

  return (
    <>
      <div className={flow.head}>
        <div>
          <h1 className="t-title">Who shares what?</h1>
          <p className="t-meta">Step 3 · Assign each item to one or more people.</p>
        </div>
        <p className="t-caption">Totals update as you tap.</p>
      </div>

      <div className={flow.helper}>
        <span className={flow.helperIcon} aria-hidden="true">
          2×
        </span>
        <div className={flow.helperContent}>
          <strong>Sharing an item means splitting its cost</strong>
          <span>
            Add everyone first, then tap a person’s face on any item they shared. Discounts and tax
            follow the people assigned to the receipt lines.
          </span>
        </div>
      </div>

      <div className={flow.card}>
        <div className={styles.peopleBar}>
          {people.map((p) => (
            <span key={p.id} title={p.name}>
              <AvatarToggle
                name={p.name}
                personId={p.id}
                assigned
                onToggle={() => {
                  onPeople(people.filter((x) => x.id !== p.id))
                  onAssignments(
                    Object.fromEntries(
                      Object.entries(assignments).map(([k, v]) => [
                        k,
                        v.filter((id) => id !== p.id),
                      ]),
                    ),
                  )
                }}
              />
            </span>
          ))}
          <button
            ref={addPersonTrigger}
            type="button"
            className={styles.addPerson}
            onClick={() => setAdding(true)}
          >
            + Add person
          </button>
        </div>

        {people.length > 0 ? (
          <div className={styles.shortcuts}>
            <Button variant="secondary" onClick={assignEveryoneToEverything}>
              Everyone shares everything
            </Button>
          </div>
        ) : null}

        <ul className={flow.rows}>
          {receipt.items.map((item, i) => {
            const id = String(i)
            const assigned = assignments[id] ?? []
            const none = assigned.length === 0
            const label = item.name || `Item ${i + 1}`
            return (
              <li
                key={id}
                className={[styles.item, none ? styles.unassigned : ''].filter(Boolean).join(' ')}
              >
                <span className={styles.itemName}>{label}</span>
                <span
                  className={[styles.itemPrice, item.cents < 0 ? styles.itemNeg : '']
                    .filter(Boolean)
                    .join(' ')}
                  data-num
                >
                  {formatMoney(item.cents, receipt.currency)}
                </span>
                <div className={styles.avatars}>
                  {people.map((p) => (
                    <AvatarToggle
                      key={p.id}
                      name={p.name}
                      personId={p.id}
                      assigned={assigned.includes(p.id)}
                      context={label}
                      size="sm"
                      onToggle={() => toggle(id, p.id)}
                    />
                  ))}
                  {none ? <span className={styles.warn}>Nobody yet</span> : null}
                </div>
              </li>
            )
          })}
        </ul>

        <p className={styles.method}>{methodLabel}</p>

        {/* Announced politely as it changes; debounced by React's batching so
            rapid tapping doesn't queue up speech (ACCESSIBILITY.md §6). */}
        <div className={styles.running} aria-live="polite" aria-atomic="true">
          {people.length === 0 ? (
            <span className="t-meta">Add someone to start splitting.</span>
          ) : (
            people.map((p) => (
              <span key={p.id} className={styles.runner}>
                <span className={flow.muted}>{initialsOf(p.name)}</span>
                <span className={styles.runnerAmount} data-num>
                  {formatMoney(result.shares[p.id] ?? 0, receipt.currency)}
                </span>
              </span>
            ))
          )}
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
            disabled={people.length === 0 || unassigned > 0}
            disabledReason={
              people.length === 0
                ? 'Add at least one person'
                : unassigned > 0
                  ? `${unassigned} item${unassigned === 1 ? '' : 's'} still need someone`
                  : undefined
            }
          >
            Review
          </Button>
        </div>
      </div>

      <Sheet
        open={adding}
        title="Add someone"
        description={
          available
            ? 'Pick a Splitwise friend, or type a name for someone not on Splitwise.'
            : 'Sign in with Splitwise to pick real friends.'
        }
        onClose={closeAddPerson}
        actions={
          <>
            <Button variant="secondary" onClick={closeAddPerson}>
              Cancel
            </Button>
            <Button onClick={() => addPerson()} disabled={!newName.trim()}>
              Add to split
            </Button>
          </>
        }
      >
        {available && available.length > 0 ? (
          <div className={styles.friendList} role="group" aria-label="Your Splitwise friends">
            {available
              .filter((f) => !people.some((p) => p.id === String(f.id)))
              .filter((f) => f.name.toLowerCase().includes(newName.trim().toLowerCase()))
              .slice(0, 8)
              .map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={styles.friend}
                  onClick={() => addPerson({ id: String(f.id), name: f.name })}
                >
                  {f.name}
                </button>
              ))}
          </div>
        ) : null}
        <Field
          label={available ? 'Search, or type a new name' : 'Name'}
          placeholder="Maya"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addPerson()
          }}
        />
      </Sheet>
    </>
  )
}
