'use client'

import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { AvatarToggle, colourOf, initialsOf } from './AvatarToggle'
import { ItemSplitSheet } from './ItemSplitSheet'
import { formatMoney, parseMoney } from '@/lib/money'
import { computeSplit } from '@/lib/split'
import { itemKey, unitCount, type ExtractedReceipt } from '@/lib/receipt'
import type { Person, SplitSettings } from '@/lib/draft'
import type { SwPerson } from '@/lib/useSplitwise'
import {
  buildPlan,
  effectiveAssignments,
  filledWeights,
  includedIds,
  isPayerProblem,
  MODES,
  planItems,
  problemText,
  receiptTotal,
} from './plan'
import styles from './AssignStep.module.css'
import flow from './flow.module.css'

type Props = {
  receipt: ExtractedReceipt
  people: Person[]
  /** The signed-in Splitwise user, when there is one. */
  me?: SwPerson | null
  /** Splitwise friends, when signed in. Absent means manual names. */
  available?: SwPerson[]
  assignments: Record<string, string[]>
  settings: SplitSettings
  onPeople: (people: Person[]) => void
  onAssignments: (a: Record<string, string[]>) => void
  onSettings: (settings: SplitSettings) => void
  onAddSplitwisePerson?: (input: { name: string; email: string }) => Promise<SwPerson>
  /** Turn a quantity line into separate unit lines (tomatoes ×4). */
  onSplitUnits?: (itemId: string) => void
  /** Signed out (and not still checking): lead with Splitwise sign-in. */
  canSignIn?: boolean
  /** Link a name-only person to a Splitwise friend (FR-40). */
  onReplacePerson?: (oldId: string, person: Person) => void
  onBack: () => void
  onNext: () => void
}

function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key))
}

export function AssignStep({
  receipt,
  people,
  me,
  available,
  assignments,
  settings,
  onPeople,
  onAssignments,
  onSettings,
  onAddSplitwisePerson,
  onSplitUnits,
  canSignIn,
  onReplacePerson,
  onBack,
  onNext,
}: Props) {
  const [splitting, setSplitting] = useState<string | null>(null)
  const [linking, setLinking] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [addingToSplitwise, setAddingToSplitwise] = useState(false)
  const addPersonTrigger = useRef<HTMLButtonElement>(null)

  const total = receiptTotal(receipt)
  const currency = receipt.currency
  const meId = me ? String(me.id) : null

  function closeAddPerson() {
    setAdding(false)
    setAddError(null)
    setLinking(null)
    // The sheet owns focus while it is open. Return it to the trigger after.
    window.requestAnimationFrame(() => addPersonTrigger.current?.focus())
  }

  // The split itself is judged without payers — those are chosen next.
  const plan = useMemo(
    () =>
      buildPlan(receipt, people, assignments, settings, [
        { personId: people[0]?.id ?? '', cents: total },
      ]),
    [receipt, people, assignments, settings, total],
  )

  // Running amounts, even while the split is incomplete — seeing numbers move
  // is how people understand what a tap did (UX-11).
  const running = useMemo<Record<string, number>>(() => {
    if (plan.ok) return plan.owed
    if (settings.mode === 'items') {
      return computeSplit({
        items: planItems(receipt, assignments, settings.itemSplits),
        people: people.map((p) => p.id),
        taxLines: receipt.taxLines,
        taxCents: receipt.taxCents,
        tipCents: receipt.tipCents,
        feeCents: receipt.feeCents,
        totalCents: total,
        // Items only while incomplete: spreading tax across people who have
        // nothing yet showed "$3.09" before a single tap.
      }).itemSubtotals
    }
    if (settings.mode === 'exact') return settings.exact
    return {}
  }, [plan, settings, receipt, assignments, people, total])

  const blocker = plan.ok || isPayerProblem(plan) ? undefined : problemText(plan, currency, people)
  // What actually applies — discounts follow the item they discount (FR-42).
  const effective = useMemo(
    () => effectiveAssignments(receipt, assignments, settings.itemSplits),
    [receipt, assignments, settings.itemSplits],
  )
  const assignedCount = receipt.items.filter(
    (item, i) => (effective.assignments[itemKey(item, i)] ?? []).length > 0,
  ).length

  function toggle(itemId: string, personId: string) {
    // A discount that was following its item starts from those same people.
    const explicit = assignments[itemId] ?? []
    const current = explicit.length > 0 ? explicit : (effective.assignments[itemId] ?? [])
    const next = current.includes(personId)
      ? current.filter((p) => p !== personId)
      : [...current, personId]
    onAssignments({ ...assignments, [itemId]: next })
    // Tapping faces means "split evenly between these people" again.
    if (settings.itemSplits[itemId]) {
      onSettings({ ...settings, itemSplits: omit(settings.itemSplits, itemId) })
    }
  }

  function assignEveryoneToEverything() {
    const all = people.map((p) => p.id)
    onAssignments(Object.fromEntries(receipt.items.map((item, i) => [itemKey(item, i), all])))
  }

  function addPerson(picked?: Person) {
    const name = picked?.name ?? newName.trim()
    if (!name) return
    const person: Person = picked ?? { id: crypto.randomUUID(), name }
    if (people.some((p) => p.id === person.id)) return
    onPeople([...people, person])
    // A new person joins every line that already has everyone on it, which is
    // almost always what's meant.
    const all = new Set(people.map((p) => p.id))
    const updated = { ...assignments }
    for (const [itemId, ids] of Object.entries(assignments)) {
      if (ids.length === all.size && all.size > 0) updated[itemId] = [...ids, person.id]
    }
    onAssignments(updated)
    setNewName('')
    setNewEmail('')
    closeAddPerson()
  }

  /** A friend was chosen in the sheet: link the name being linked, or add them. */
  function pick(person: Person) {
    if (linking && onReplacePerson) {
      onReplacePerson(linking, person)
      setNewName('')
      setNewEmail('')
      closeAddPerson()
      return
    }
    addPerson(person)
  }

  function removePerson(id: string) {
    onPeople(people.filter((p) => p.id !== id))
    onAssignments(
      Object.fromEntries(
        Object.entries(assignments).map(([k, v]) => [k, v.filter((personId) => personId !== id)]),
      ),
    )
    const without = (record: Record<string, number>) =>
      Object.fromEntries(Object.entries(record).filter(([key]) => key !== id))
    onSettings({ ...settings, weights: without(settings.weights), exact: without(settings.exact) })
  }

  async function addByEmail() {
    if (!onAddSplitwisePerson || !newName.trim() || !newEmail.trim()) return
    setAddingToSplitwise(true)
    setAddError(null)
    try {
      const person = await onAddSplitwisePerson({ name: newName.trim(), email: newEmail.trim() })
      pick({ id: String(person.id), name: person.name })
    } catch (error) {
      setAddError(error instanceof Error ? error.message : 'Couldn’t add that person to Splitwise.')
    } finally {
      setAddingToSplitwise(false)
    }
  }

  const methodLabel =
    plan.ok && plan.taxMethod === 'by-flag'
      ? 'Tax follows the tax code printed beside each item.'
      : plan.ok && plan.taxMethod === 'by-taxable-subtotal'
        ? 'Tax is shared across the taxable items.'
        : 'Tax, tip and fees follow each person’s share of the items.'

  const splittingIndex = splitting
    ? receipt.items.findIndex((item, i) => itemKey(item, i) === splitting)
    : -1
  const splittingItem = splittingIndex >= 0 ? receipt.items[splittingIndex] : undefined

  const included = includedIds(settings, people)
  const weights = filledWeights(settings, people)
  const exactSum = Object.entries(settings.exact)
    .filter(([id]) => people.some((p) => p.id === id))
    .reduce((a, [, cents]) => a + cents, 0)
  const friendMatches = (available ?? [])
    .filter((f) => !people.some((p) => p.id === String(f.id)))
    .filter((f) => f.name.toLowerCase().includes(newName.trim().toLowerCase()))
    .slice(0, 8)

  return (
    <>
      <div className={flow.head}>
        <div>
          <h1 className="t-title">Who’s splitting this?</h1>
          <p className="t-meta">
            Step 3 · {formatMoney(total, currency)}
            {receipt.merchant ? ` at ${receipt.merchant}` : ''}
          </p>
        </div>
      </div>

      {/* ── 1. People ─────────────────────────────────────────── */}
      <section className={flow.card} aria-labelledby="people-title">
        <header className={flow.sectionHead}>
          <span className={flow.stepBadge} aria-hidden="true">
            1
          </span>
          <div>
            <h2 id="people-title" className={flow.sectionTitle}>
              Add everyone on this bill
            </h2>
            <p className={flow.sectionHint}>
              Include yourself and anyone who ate, bought, or paid — even if a friend paid and you
              are just logging it. Only people added here can be given items or marked as the
              payer.
            </p>
          </div>
        </header>

        {people.length === 0 ? (
          <div className={styles.emptyPeople}>
            <span className={styles.emptyAvatars} aria-hidden="true">
              <span style={{ background: 'var(--person-1)' }}>A</span>
              <span style={{ background: 'var(--person-2)' }}>B</span>
              <span style={{ background: 'var(--person-3)' }}>C</span>
            </span>
            {canSignIn ? (
              <a className={styles.signIn} href="/api/auth/login?next=/new">
                <span className={styles.signInMark} aria-hidden="true">
                  S
                </span>
                <span className={styles.signInText}>
                  <strong>Sign in with Splitwise to add friends</strong>
                  <small>
                    Pick the people you already split with, then send it in one tap. Your receipt
                    is saved while you sign in.
                  </small>
                </span>
                <span className={styles.signInArrow} aria-hidden="true">
                  →
                </span>
              </a>
            ) : null}
            {canSignIn ? (
              <details className={styles.manual}>
                <summary>Split without signing in</summary>
                <p>
                  Type names just for this receipt. You’ll get the per-person totals to copy, but
                  it can’t be added to Splitwise until those people are Splitwise friends.
                </p>
                <Button
                  ref={addPersonTrigger}
                  variant="secondary"
                  onClick={() => {
                    setAddError(null)
                    setAdding(true)
                  }}
                >
                  + Add a name
                </Button>
              </details>
            ) : (
              <>
                <p>Nobody here yet. Start with you, then add the others.</p>
                <div className={styles.emptyActions}>
                  {me ? (
                    <Button onClick={() => addPerson({ id: String(me.id), name: me.name })}>
                      Add me ({me.name})
                    </Button>
                  ) : null}
                  <Button
                    ref={me ? undefined : addPersonTrigger}
                    variant={me ? 'secondary' : 'primary'}
                    onClick={() => {
                      setAddError(null)
                      setAdding(true)
                    }}
                  >
                    + Add person
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <ul className={styles.chips} aria-label="People in this split">
            {people.map((p) => (
              <li key={p.id} className={styles.chip}>
                <span className={styles.chipAvatar} style={{ background: colourOf(p.id) }}>
                  {initialsOf(p.name)}
                </span>
                <span className={styles.chipName}>
                  {p.name}
                  {p.id === meId ? <span className={styles.you}> (you)</span> : null}
                </span>
                {available && onReplacePerson && !/^\d+$/.test(p.id) ? (
                  <button
                    type="button"
                    className={styles.linkButton}
                    aria-label={`Link ${p.name} to a Splitwise friend`}
                    onClick={() => {
                      setAddError(null)
                      setLinking(p.id)
                      setNewName(p.name)
                      setAdding(true)
                    }}
                  >
                    Link
                  </button>
                ) : null}
                <button
                  type="button"
                  className={styles.chipRemove}
                  aria-label={`Remove ${p.name} from this split`}
                  onClick={() => removePerson(p.id)}
                >
                  ✕
                </button>
              </li>
            ))}
            <li>
              <button
                ref={addPersonTrigger}
                type="button"
                className={styles.addPerson}
                onClick={() => {
                  setAddError(null)
                  setAdding(true)
                }}
              >
                + Add person
              </button>
            </li>
          </ul>
        )}
        {people.length > 0 && canSignIn ? (
          <p className={styles.signInNote}>
            These names stay on this device.{' '}
            <a href="/api/auth/login?next=/new">Sign in with Splitwise</a> to link them to real
            friends and send the expense — nothing here is lost.
          </p>
        ) : null}
        {available && people.some((p) => !/^\d+$/.test(p.id)) ? (
          <p className={styles.signInNote}>
            Tap <strong>Link</strong> on a name to connect it to a Splitwise friend — needed before
            sending.
          </p>
        ) : null}
      </section>

      {/* ── 2. How to split ───────────────────────────────────── */}
      {people.length > 0 ? (
        <section className={[flow.card, flow.gapTop].join(' ')} aria-labelledby="mode-title">
          <header className={flow.sectionHead}>
            <span className={flow.stepBadge} aria-hidden="true">
              2
            </span>
            <div>
              <h2 id="mode-title" className={flow.sectionTitle}>
                How should it be split?
              </h2>
              <p className={flow.sectionHint}>
                Same choices as Splitwise. You can switch at any time — nothing is lost.
              </p>
            </div>
          </header>

          <div className={flow.segmented} role="radiogroup" aria-labelledby="mode-title">
            {MODES.map((mode) => (
              <label
                key={mode.value}
                className={flow.segment}
                data-checked={settings.mode === mode.value}
              >
                <input
                  type="radio"
                  name="split-mode"
                  className="sr-only"
                  checked={settings.mode === mode.value}
                  onChange={() => onSettings({ ...settings, mode: mode.value })}
                />
                <span className={flow.segmentIcon} aria-hidden="true">
                  {mode.icon}
                </span>
                <span className={flow.segmentTitle}>{mode.title}</span>
                <span className={flow.segmentHint}>{mode.hint}</span>
              </label>
            ))}
          </div>

          {settings.mode === 'items' ? (
            <>
              <div className={styles.toolbar}>
                <span className="t-caption">
                  {assignedCount} of {receipt.items.length} items assigned
                </span>
                <Button variant="secondary" onClick={assignEveryoneToEverything}>
                  Everyone shares everything
                </Button>
              </div>
              {receipt.items.length === 0 ? (
                <p className={styles.modeNote}>
                  This receipt has no item lines — choose Equally, By shares, or Exact amounts.
                </p>
              ) : (
                <ul className={flow.rows}>
                  {receipt.items.map((item, i) => {
                    const id = itemKey(item, i)
                    const assigned = effective.assignments[id] ?? []
                    const followsId = effective.follows[id]
                    const followsName = followsId
                      ? (receipt.items.find((it, j) => itemKey(it, j) === followsId)?.name ??
                        'the item above')
                      : ''
                    const none = assigned.length === 0
                    const label = item.name || `Item ${i + 1}`
                    const custom = followsId ? undefined : effective.itemSplits[id]
                    const customLabel = custom
                      ? people
                          .filter((p) => (custom.values[p.id] ?? 0) !== 0)
                          .map(
                            (p) =>
                              `${p.name.split(' ')[0]} ${
                                custom.kind === 'shares'
                                  ? `×${custom.values[p.id]}`
                                  : formatMoney(custom.values[p.id] ?? 0, currency)
                              }`,
                          )
                          .join(' · ')
                      : ''
                    return (
                      <li
                        key={id}
                        className={[styles.item, none ? styles.unassigned : '']
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <span className={styles.itemName}>{label}</span>
                        <span
                          className={[styles.itemPrice, item.cents < 0 ? styles.itemNeg : '']
                            .filter(Boolean)
                            .join(' ')}
                          data-num
                        >
                          {formatMoney(item.cents, currency)}
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
                          {none ? (
                            <span className={styles.warn}>Tap who had this</span>
                          ) : followsId ? (
                            <span className={styles.follows}>↳ Follows {followsName}</span>
                          ) : custom ? (
                            <span className={styles.customChip}>{customLabel}</span>
                          ) : assigned.length > 1 ? (
                            <span className={styles.shared}>
                              Shared {assigned.length} ways · about{' '}
                              {formatMoney(Math.round(item.cents / assigned.length), currency)} each
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className={styles.splitButton}
                            aria-label={`Split ${label} unevenly`}
                            onClick={() => setSplitting(id)}
                          >
                            {custom
                              ? 'Edit split'
                              : unitCount(item) >= 2
                                ? `Split ${unitCount(item)} units…`
                                : 'Split unevenly'}
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
              {receipt.items.length > 0 ? <p className={styles.method}>{methodLabel}</p> : null}
            </>
          ) : null}

          {settings.mode === 'equal' ? (
            <ul className={flow.rows}>
              {people.map((p) => {
                const isIn = included.includes(p.id)
                return (
                  <li key={p.id} className={styles.personRow}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isIn}
                      className={styles.check}
                      data-on={isIn}
                      onClick={() =>
                        onSettings({
                          ...settings,
                          included: isIn
                            ? included.filter((id) => id !== p.id)
                            : [...included, p.id],
                        })
                      }
                    >
                      <span aria-hidden="true">{isIn ? '✓' : ''}</span>
                      <span className="sr-only">Include {p.name}</span>
                    </button>
                    <span className={styles.personName}>{p.name}</span>
                    <span className={styles.personAmount} data-num>
                      {isIn ? formatMoney(running[p.id] ?? 0, currency) : 'Not included'}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : null}

          {settings.mode === 'shares' ? (
            <ul className={flow.rows}>
              {people.map((p) => {
                const count = weights[p.id] ?? 1
                const setCount = (n: number) =>
                  onSettings({
                    ...settings,
                    weights: { ...weights, [p.id]: Math.max(0, Math.min(99, n)) },
                  })
                return (
                  <li key={p.id} className={styles.personRow}>
                    <span className={styles.personName}>{p.name}</span>
                    <span className={styles.stepper}>
                      <button
                        type="button"
                        aria-label={`One fewer share for ${p.name}`}
                        onClick={() => setCount(count - 1)}
                        disabled={count === 0}
                      >
                        −
                      </button>
                      <output aria-live="polite" aria-label={`${p.name} shares`}>
                        {count}
                      </output>
                      <button
                        type="button"
                        aria-label={`One more share for ${p.name}`}
                        onClick={() => setCount(count + 1)}
                      >
                        +
                      </button>
                    </span>
                    <span className={styles.personAmount} data-num>
                      {formatMoney(running[p.id] ?? 0, currency)}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : null}

          {settings.mode === 'exact' ? (
            <>
              <ul className={flow.rows}>
                {people.map((p) => (
                  <li key={p.id} className={styles.personRow}>
                    <span className={styles.personName}>{p.name}</span>
                    <span className={styles.exactField}>
                      <Field
                        label={`${p.name} owes`}
                        money
                        defaultValue={((settings.exact[p.id] ?? 0) / 100).toFixed(2)}
                        onBlur={(e) => {
                          const parsed = parseMoney(e.target.value || '0')
                          if (parsed.ok) {
                            onSettings({
                              ...settings,
                              exact: { ...settings.exact, [p.id]: parsed.cents },
                            })
                          }
                        }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
              <p
                className={[styles.remaining, exactSum === total ? styles.remainingOk : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-live="polite"
              >
                {exactSum === total
                  ? `✓ ${formatMoney(total, currency)} fully assigned`
                  : exactSum < total
                    ? `${formatMoney(total - exactSum, currency)} left of ${formatMoney(total, currency)}`
                    : `${formatMoney(exactSum - total, currency)} over the total`}
              </p>
            </>
          ) : null}

          <div className={styles.running} aria-live="polite" aria-atomic="true">
            <span className={styles.runningLabel}>{plan.ok ? 'Each owes' : 'So far'}</span>
            {people.map((p) => (
              <span key={p.id} className={styles.runner}>
                <span
                  className={styles.runnerDot}
                  style={{ background: colourOf(p.id) }}
                  aria-hidden="true"
                />
                <span className={flow.muted}>{p.name.split(' ')[0]}</span>
                <span className={styles.runnerAmount} data-num>
                  {formatMoney(running[p.id] ?? 0, currency)}
                </span>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <div className={flow.cta}>
        <div className={flow.ctaInner}>
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
          <Button full onClick={onNext} disabled={Boolean(blocker)} disabledReason={blocker}>
            Next: who paid
          </Button>
        </div>
      </div>

      <ItemSplitSheet
        item={
          splitting && splittingItem
            ? {
                id: splitting,
                name: splittingItem.name || `Item ${splittingIndex + 1}`,
                cents: splittingItem.cents,
                qty: splittingItem.qty,
              }
            : null
        }
        people={people}
        currency={currency}
        assigned={splitting ? (effective.assignments[splitting] ?? []) : []}
        split={splitting ? effective.itemSplits[splitting] : undefined}
        onSplitUnits={
          onSplitUnits && splitting
            ? () => {
                onSplitUnits(splitting)
                setSplitting(null)
              }
            : undefined
        }
        onSave={(ids, split) => {
          if (!splitting) return
          onAssignments({ ...assignments, [splitting]: ids })
          onSettings({
            ...settings,
            itemSplits: split
              ? { ...settings.itemSplits, [splitting]: split }
              : omit(settings.itemSplits, splitting),
          })
          setSplitting(null)
        }}
        onClose={() => setSplitting(null)}
      />

      <Sheet
        open={adding}
        title={
          linking
            ? `Link “${people.find((p) => p.id === linking)?.name ?? ''}” to Splitwise`
            : 'Add someone to this split'
        }
        description={
          linking
            ? 'Pick the Splitwise friend this is. Their items, shares and payments move over.'
            : available
            ? 'Pick a Splitwise friend, or add someone new by email — Splitwise finds their account or sends them an invite.'
            : 'Type a name. To add the expense to Splitwise later, sign in so you can pick real friends.'
        }
        onClose={closeAddPerson}
        actions={
          <>
            <Button variant="secondary" onClick={closeAddPerson}>
              Cancel
            </Button>
            {onAddSplitwisePerson ? (
              <Button
                onClick={() => void addByEmail()}
                disabled={!newName.trim() || !newEmail.trim()}
                disabledReason={
                  !newName.trim() || !newEmail.trim() ? 'Enter a name and email' : undefined
                }
                loading={addingToSplitwise}
              >
                Add in Splitwise
              </Button>
            ) : (
              <Button onClick={() => addPerson()} disabled={!newName.trim()}>
                Add to split
              </Button>
            )}
          </>
        }
      >
        {friendMatches.length > 0 ? (
          <div className={styles.friendList} role="group" aria-label="Your Splitwise friends">
            {friendMatches.map((f) => (
              <button
                key={f.id}
                type="button"
                className={styles.friend}
                onClick={() => pick({ id: String(f.id), name: f.name })}
              >
                <span
                  className={styles.friendAvatar}
                  style={{ background: colourOf(String(f.id)) }}
                  aria-hidden="true"
                >
                  {initialsOf(f.name)}
                </span>
                {f.name}
                {String(f.id) === meId ? ' (you)' : ''}
              </button>
            ))}
          </div>
        ) : null}
        <Field
          label={available ? 'Name or friend search' : 'Name'}
          placeholder="Maya"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !onAddSplitwisePerson) addPerson()
          }}
        />
        {onAddSplitwisePerson ? (
          <>
            <p className={styles.sheetDivider}>Not in your friends list yet?</p>
            <Field
              label="Email for Splitwise"
              type="email"
              placeholder="maya@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              help="Only needed for someone who isn’t your Splitwise friend yet."
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addByEmail()
              }}
            />
            {!linking ? (
              <Button variant="tertiary" onClick={() => addPerson()} disabled={!newName.trim()}>
                Add only to this split (not Splitwise)
              </Button>
            ) : null}
          </>
        ) : null}
        {addError ? (
          <p className={styles.addError} role="alert">
            {addError}
          </p>
        ) : null}
      </Sheet>
    </>
  )
}
