'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { colourOf } from './AvatarToggle'
import { formatMoney } from '@/lib/money'
import { computeSplit, maxRoundingDrift, settleRounding, type Item } from '@/lib/split'
import type { ExtractedReceipt } from '@/lib/receipt'
import type { Person } from '@/lib/draft'
import { rankGroups, type SwGroup, type SwPerson } from '@/lib/useSplitwise'
import { GroupPicker } from './GroupPicker'
import styles from './ConfirmStep.module.css'
import flow from './flow.module.css'

type Props = {
  receipt: ExtractedReceipt
  people: Person[]
  assignments: Record<string, string[]>
  payerId: string | null
  onPayer: (id: string) => void
  /** Present when signed in — enables the push to Splitwise. */
  groups?: SwGroup[]
  signedIn?: boolean
  onBack: () => void
  onDone: () => void
}

export function ConfirmStep({
  receipt,
  people,
  assignments,
  payerId,
  onPayer,
  groups,
  signedIn,
  onBack,
  onDone,
}: Props) {
  const [copied, setCopied] = useState(false)
  const [groupId, setGroupId] = useState<number | null>(null)
  const [pushing, setPushing] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)
  const [pushed, setPushed] = useState<number | null>(null)
  const [idemKey] = useState(() => crypto.randomUUID())

  // Everyone in the split must be a real Splitwise user to push.
  const swPeople: SwPerson[] = people
    .filter((p) => /^\d+$/.test(p.id))
    .map((p) => ({ id: Number(p.id), name: p.name }))
  const canPush = Boolean(signedIn) && swPeople.length === people.length && people.length > 0
  const suggestedGroupId = useMemo(() => {
    if (!groups || groups.length === 0) return 0
    return rankGroups(groups, swPeople.map((person) => person.id))[0]?.id ?? 0
  }, [groups, swPeople])

  // Make the safe, common choice available immediately. The user can still
  // pick another group or no group before submitting.
  useEffect(() => {
    if (canPush) setGroupId((current) => current ?? suggestedGroupId)
  }, [canPush, suggestedGroupId])

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
    // Judge reconciliation BEFORE settling. settleRounding forces the sum to
    // match, so testing it afterwards always passes and proves nothing — the
    // green "matches receipt" badge would be unconditional.
    const drift = Math.abs(total - r.computedTotal)
    const reconciles = drift <= maxRoundingDrift(people.length) && r.unassignedItemIds.length === 0

    // Only genuine rounding is settled onto the payer (FR-18).
    const settled = payer ? settleRounding(r.shares, total, payer) : r.shares
    return { shares: settled, reconciles }
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

  async function push() {
    if (groupId === null || !payer) return
    setPushing(true)
    setPushError(null)
    try {
      const res = await fetch('/api/splitwise/expense', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          merchant: receipt.merchant,
          date: receipt.date,
          currency: receipt.currency,
          groupId,
          payerId: Number(payer),
          totalCents: total,
          taxCents: receipt.taxCents,
          tipCents: receipt.tipCents,
          feeCents: receipt.feeCents,
          taxLines: receipt.taxLines,
          items: receipt.items.map((item, i) => ({
            name: item.name || `Item ${i + 1}`,
            cents: item.cents,
            ...(item.taxFlag ? { taxFlag: item.taxFlag } : {}),
            people: (assignments[String(i)] ?? []).map(Number),
          })),
          idempotencyKey: idemKey, // a double-tap creates one expense (FR-22)
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setPushError(body.message ?? 'Couldn’t add it to Splitwise.')
        return
      }
      setPushed(body.id)
    } catch {
      setPushError('Couldn’t reach Splitwise.')
    } finally {
      setPushing(false)
    }
  }

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
        <div>
          <h1 className="t-title">Ready</h1>
          <p className="t-meta">Step 4 · One last look before anything is sent.</p>
        </div>
        <p className="t-caption">You can still go back and change it.</p>
      </div>

      <div className={flow.helper}>
        <span className={flow.helperIcon} aria-hidden="true">
          →
        </span>
        <div className={flow.helperContent}>
          <strong>Your split is ready to share</strong>
          <span>
            Choose who paid, check the per-person totals, then add it to Splitwise or copy the
            summary for another app. Nothing is submitted from this screen until you tap the action
            below.
          </span>
        </div>
      </div>

      {!signedIn ? (
        <div className={styles.blocked}>
          <strong>Not signed in to Splitwise.</strong>
          <span>
            Copy the summary below and add it yourself, or{' '}
            <a href="/api/auth/login?next=/new">sign in with Splitwise</a> to push it in one tap.
          </span>
        </div>
      ) : null}

      {signedIn && !canPush ? (
        <div className={styles.blocked}>
          <strong>Some people aren’t Splitwise friends.</strong>
          <span>
            Everyone in the split needs to be on Splitwise to push it. Go back and pick them from
            your friends, or copy the summary below instead.
          </span>
        </div>
      ) : null}

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
            {reconciles
              ? '✓ matches receipt'
              : '✕ the items don’t add up to the total — go back and check'}
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

      {canPush && groups ? (
        <div className={styles.summary}>
          <strong>Add to</strong>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <GroupPicker
              groups={groups}
              people={swPeople}
              selectedId={groupId}
              onSelect={setGroupId}
            />
          </div>
        </div>
      ) : null}

      {pushError ? (
        <div className={styles.blocked} role="alert" style={{ marginTop: 'var(--space-4)' }}>
          <strong>{pushError}</strong>
          <span>Your split is still here — nothing was lost.</span>
        </div>
      ) : null}

      {pushed ? (
        <div className={styles.summary} role="status">
          <strong>✓ Added to Splitwise</strong>
          <p className={styles.sub} style={{ marginTop: 'var(--space-2)' }}>
            <a
              href={`https://secure.splitwise.com/expenses/${pushed}`}
              target="_blank"
              rel="noreferrer"
            >
              Open it in Splitwise
            </a>
          </p>
        </div>
      ) : null}

      <div className={flow.cta}>
        <div className={flow.ctaInner}>
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
          {canPush && !pushed ? (
            <Button
              full
              loading={pushing}
              onClick={push}
              disabled={!reconciles || groupId === null}
              disabledReason={
                !reconciles
                  ? 'The shares don’t add up to the total — go back and check'
                  : groupId === null
                    ? 'Choose where this expense should go'
                    : undefined
              }
            >
              Add to Splitwise
            </Button>
          ) : (
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
          )}
        </div>
      </div>
    </>
  )
}
