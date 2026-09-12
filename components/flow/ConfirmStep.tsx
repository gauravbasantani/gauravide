'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { colourOf, initialsOf } from './AvatarToggle'
import { formatMoney, parseMoney } from '@/lib/money'
import { netBalances, suggestTransfers } from '@/lib/split'
import { itemKey, type ExtractedReceipt } from '@/lib/receipt'
import type { Person, SplitSettings } from '@/lib/draft'
import { missingFrom, rankGroups, type SwGroup, type SwPerson } from '@/lib/useSplitwise'
import { GroupPicker } from './GroupPicker'
import {
  buildPlan,
  filledWeights,
  includedIds,
  isPayerProblem,
  payersFor,
  problemText,
  receiptTotal,
} from './plan'
import styles from './ConfirmStep.module.css'
import flow from './flow.module.css'

type Props = {
  receipt: ExtractedReceipt
  people: Person[]
  assignments: Record<string, string[]>
  settings: SplitSettings
  payerId: string | null
  meId: string | null
  onPayer: (id: string) => void
  onSettings: (settings: SplitSettings) => void
  /** Present when signed in — enables the push to Splitwise. */
  groups?: SwGroup[]
  signedIn?: boolean
  submitKey: string
  submittedExpenseId: number | null
  onSubmitted: (expenseId: number) => void
  onBack: () => void
  onDone: () => void
}

export function ConfirmStep({
  receipt,
  people,
  assignments,
  settings,
  payerId,
  meId,
  onPayer,
  onSettings,
  groups,
  signedIn,
  submitKey,
  submittedExpenseId,
  onSubmitted,
  onBack,
  onDone,
}: Props) {
  const [copied, setCopied] = useState(false)
  const [groupId, setGroupId] = useState<number | null>(null)
  const [pushing, setPushing] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)
  const [historyNotice, setHistoryNotice] = useState(false)
  const [availableGroups, setAvailableGroups] = useState<SwGroup[] | undefined>(groups)
  const [groupBusy, setGroupBusy] = useState(false)
  const [groupError, setGroupError] = useState<string | null>(null)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  const total = receiptTotal(receipt)
  const currency = receipt.currency
  const money = (cents: number) => formatMoney(cents, currency)
  const nameOf = (id: string) => {
    const person = people.find((p) => p.id === id)
    return person ? (id === meId ? 'You' : person.name) : 'Someone'
  }

  // You, if you're in the split; otherwise whoever was added first.
  const singlePayer =
    payerId && people.some((p) => p.id === payerId)
      ? payerId
      : (people.find((p) => p.id === meId)?.id ?? people[0]?.id ?? null)
  const multiple = settings.payers !== null
  const payers = payersFor(settings, singlePayer, people, total)
  const paidSum = payers.reduce((a, p) => a + p.cents, 0)

  const plan = useMemo(
    () => buildPlan(receipt, people, assignments, settings, payers),
    [receipt, people, assignments, settings, payers],
  )
  const net = plan.ok ? netBalances(plan.owed, plan.paid) : {}
  const transfers = plan.ok ? suggestTransfers(net) : []
  const problem = problemText(plan, currency)

  // Only people with something paid or owed go on the Splitwise expense.
  const participantIds = plan.ok ? plan.participants : people.map((p) => p.id)
  const allOnSplitwise = people.length > 0 && people.every((p) => /^\d+$/.test(p.id))
  const canPush = Boolean(signedIn) && allOnSplitwise
  const swPeople: SwPerson[] = useMemo(
    () =>
      people
        .filter((p) => participantIds.includes(p.id) && /^\d+$/.test(p.id))
        .map((p) => ({ id: Number(p.id), name: p.name })),
    [people, participantIds],
  )

  const suggestedGroupId = useMemo(() => {
    if (!availableGroups || availableGroups.length === 0) return 0
    const best = rankGroups(
      availableGroups,
      swPeople.map((p) => p.id),
    )[0]
    // Pre-select only a group that already holds everyone (FR-19b).
    return best && missingFrom(best, swPeople).length === 0 ? best.id : 0
  }, [availableGroups, swPeople])

  useEffect(() => {
    if (canPush) setGroupId((current) => current ?? suggestedGroupId)
  }, [canPush, suggestedGroupId])

  useEffect(() => {
    setAvailableGroups(groups)
  }, [groups])

  const selectedGroup = availableGroups?.find((group) => group.id === groupId) ?? null
  const missingPeople = selectedGroup ? missingFrom(selectedGroup, swPeople) : []
  const groupIsReady = groupId === 0 || missingPeople.length === 0
  const meInvolved = Boolean(meId && participantIds.includes(meId))

  function setMultiple(on: boolean) {
    onSettings({
      ...settings,
      payers: on && singlePayer ? [{ personId: singlePayer, cents: total }] : null,
    })
  }

  function setPaid(personId: string, cents: number) {
    const current = settings.payers ?? []
    const next = people
      .map((p) => ({
        personId: p.id,
        cents: p.id === personId ? cents : (current.find((x) => x.personId === p.id)?.cents ?? 0),
      }))
      .filter((p) => p.cents !== 0)
    onSettings({ ...settings, payers: next })
  }

  async function addPeopleToSelectedGroup() {
    if (!selectedGroup || missingPeople.length === 0) return
    setGroupBusy(true)
    setGroupError(null)
    try {
      const response = await fetch('/api/splitwise/group-members', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          groupId: selectedGroup.id,
          memberIds: missingPeople.map((person) => person.id),
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message ?? 'Couldn’t update the group.')
      setAvailableGroups((current) =>
        current?.map((group) =>
          group.id === selectedGroup.id
            ? { ...group, members: [...group.members, ...missingPeople] }
            : group,
        ),
      )
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : 'Couldn’t update the group.')
    } finally {
      setGroupBusy(false)
    }
  }

  async function createMatchingGroup() {
    const name = newGroupName.trim() || receipt.merchant?.trim() || 'New split'
    setGroupBusy(true)
    setGroupError(null)
    try {
      const response = await fetch('/api/splitwise/group', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, memberIds: swPeople.map((person) => person.id) }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.group) throw new Error(body.message ?? 'Couldn’t create the group.')
      setAvailableGroups((current) => [...(current ?? []), body.group])
      setGroupId(body.group.id)
      setCreatingGroup(false)
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : 'Couldn’t create the group.')
    } finally {
      setGroupBusy(false)
    }
  }

  const summaryText = useMemo(() => {
    const paidLine =
      payers.length === 1
        ? `Paid by ${nameOf(payers[0]?.personId ?? '')}`
        : `Paid by ${payers.map((p) => `${nameOf(p.personId)} (${money(p.cents)})`).join(' and ')}`
    return [
      `${receipt.merchant ?? 'Receipt'}${receipt.date ? ` — ${receipt.date}` : ''}`,
      `Total ${money(total)} · ${paidLine}`,
      '',
      ...people.map((p) => `${p.name}: ${money(plan.ok ? (plan.owed[p.id] ?? 0) : 0)}`),
      ...(transfers.length > 0 ? ['', ...transfers.map((t) => `${nameOf(t.from)} → ${nameOf(t.to)}: ${money(t.cents)}`)] : []),
    ].join('\n')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt, people, plan, transfers, payers, total])

  async function push() {
    if (groupId === null || !plan.ok) return
    setPushing(true)
    setPushError(null)
    setHistoryNotice(false)
    try {
      const res = await fetch('/api/splitwise/expense', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          merchant: receipt.merchant,
          date: receipt.date,
          currency,
          groupId,
          groupName: groupId === 0 ? 'No group' : (selectedGroup?.name ?? 'Splitwise group'),
          totalCents: total,
          taxCents: receipt.taxCents,
          tipCents: receipt.tipCents,
          feeCents: receipt.feeCents,
          taxLines: receipt.taxLines,
          mode: settings.mode,
          included: includedIds(settings, people).map(Number),
          weights: filledWeights(settings, people),
          exact: Object.fromEntries(people.map((p) => [p.id, settings.exact[p.id] ?? 0])),
          payers: payers.map((p) => ({ personId: Number(p.personId), cents: p.cents })),
          items: receipt.items.map((item, i) => ({
            name: item.name || `Item ${i + 1}`,
            cents: item.cents,
            ...(item.taxFlag ? { taxFlag: item.taxFlag } : {}),
            people: (assignments[itemKey(item, i)] ?? []).map(Number),
          })),
          people: people.map((p) => ({ id: Number(p.id), name: p.name })),
          idempotencyKey: submitKey, // one key per draft — never two expenses (FR-22)
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPushError(body.message ?? 'Couldn’t add it to Splitwise.')
        return
      }
      onSubmitted(body.id)
      // A Splitwise success remains a success even if the dashboard copy
      // failed. Never make the user retry and risk a duplicate expense.
      setHistoryNotice(body.historySaved === false)
    } catch {
      setPushError('Couldn’t reach Splitwise. Check your connection and try again.')
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

  /* ── Done: the expense exists. Never offer a second submit. ─────────── */
  if (submittedExpenseId) {
    return (
      <>
        <section className={styles.success} role="status">
          <span className={styles.successIcon} aria-hidden="true">
            ✓
          </span>
          <h1 className="t-title">Added to Splitwise</h1>
          <p className="t-meta">
            {receipt.merchant ?? 'Receipt'} · {money(total)}. Everyone in the split can see it now.
          </p>
          {transfers.length > 0 ? (
            <ul className={styles.transfers}>
              {transfers.map((t) => (
                <li key={t.from + t.to}>
                  <span>
                    <strong>{nameOf(t.from)}</strong> {t.from === meId ? 'owe' : 'owes'}{' '}
                    <strong>{nameOf(t.to)}</strong>
                  </span>
                  <span className={styles.owe} data-num>
                    {money(t.cents)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <a
            className={styles.openLink}
            href={`https://secure.splitwise.com/expenses/${submittedExpenseId}`}
            target="_blank"
            rel="noreferrer"
          >
            Open it in Splitwise ↗
          </a>
          {historyNotice ? (
            <p className={styles.historyNotice}>
              It’s in Splitwise, but we couldn’t save a copy to Your splits this time.
            </p>
          ) : null}
        </section>
        <div className={flow.cta}>
          <div className={flow.ctaInner}>
            <Button full onClick={onDone}>
              Done
            </Button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className={flow.head}>
        <div>
          <h1 className="t-title">Ready</h1>
          <p className="t-meta">Step 4 · Who paid, and a last look before anything is sent.</p>
        </div>
      </div>

      {/* ── Receipt summary ─────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroTile} aria-hidden="true">
          {(receipt.merchant ?? 'R').trim().charAt(0).toUpperCase()}
        </div>
        <div className={styles.heroMain}>
          <span className={styles.heroMerchant}>{receipt.merchant ?? 'Receipt'}</span>
          <span className="t-caption">
            {receipt.date ?? 'No date'} · {people.length}{' '}
            {people.length === 1 ? 'person' : 'people'} ·{' '}
            {settings.mode === 'items'
              ? 'split by item'
              : settings.mode === 'equal'
                ? 'split equally'
                : settings.mode === 'shares'
                  ? 'split by shares'
                  : 'exact amounts'}
          </span>
        </div>
        <div className={styles.heroTotal}>
          <span className={styles.amount} data-num>
            {money(total)}
          </span>
          {plan.ok || isPayerProblem(plan) ? (
            <span className={styles.check}>✓ Matches receipt</span>
          ) : (
            <span className={[styles.check, styles.fail].join(' ')}>✕ {problem}</span>
          )}
        </div>
      </section>

      {/* ── Who paid ─────────────────────────────────────────────── */}
      <section className={[flow.card, flow.gapTop].join(' ')} aria-labelledby="paid-title">
        <header className={flow.sectionHead}>
          <span className={flow.stepBadge} aria-hidden="true">
            $
          </span>
          <div>
            <h2 id="paid-title" className={flow.sectionTitle}>
              Who paid the bill?
            </h2>
            <p className={flow.sectionHint}>
              Pick whoever handed over the card or cash. If the bill was paid in parts, choose
              several people and enter what each put in.
            </p>
          </div>
        </header>

        <div className={flow.segmented} data-columns="2" role="radiogroup" aria-label="Paid by">
          {[
            { value: false, title: 'One person', hint: 'Paid it all', icon: '1' },
            { value: true, title: 'Several people', hint: 'Paid in parts', icon: '2+' },
          ].map((option) => (
            <label key={option.title} className={flow.segment} data-checked={multiple === option.value}>
              <input
                type="radio"
                name="payer-mode"
                className="sr-only"
                checked={multiple === option.value}
                onChange={() => setMultiple(option.value)}
              />
              <span className={flow.segmentIcon} aria-hidden="true">
                {option.icon}
              </span>
              <span className={flow.segmentTitle}>{option.title}</span>
              <span className={flow.segmentHint}>{option.hint}</span>
            </label>
          ))}
        </div>

        {!multiple ? (
          <div className={styles.payerChips} role="radiogroup" aria-label="Who paid">
            {people.map((p) => (
              <label key={p.id} className={styles.payerChip} data-checked={singlePayer === p.id}>
                <input
                  type="radio"
                  name="payer"
                  className="sr-only"
                  checked={singlePayer === p.id}
                  onChange={() => onPayer(p.id)}
                />
                <span className={styles.avatar} style={{ background: colourOf(p.id) }}>
                  {initialsOf(p.name)}
                </span>
                {p.id === meId ? 'You' : p.name}
              </label>
            ))}
          </div>
        ) : (
          <>
            <ul className={flow.rows}>
              {people.map((p) => (
                <li key={p.id} className={styles.paidRow}>
                  <span className={styles.avatar} style={{ background: colourOf(p.id) }}>
                    {initialsOf(p.name)}
                  </span>
                  <span className={styles.name}>{p.id === meId ? 'You' : p.name}</span>
                  <span className={styles.paidField}>
                    <Field
                      label={`${p.name} paid`}
                      money
                      defaultValue={(
                        (payers.find((x) => x.personId === p.id)?.cents ?? 0) / 100
                      ).toFixed(2)}
                      onBlur={(e) => {
                        const parsed = parseMoney(e.target.value || '0')
                        if (parsed.ok) setPaid(p.id, parsed.cents)
                      }}
                    />
                  </span>
                </li>
              ))}
            </ul>
            <p
              className={[styles.remaining, paidSum === total ? styles.remainingOk : '']
                .filter(Boolean)
                .join(' ')}
              aria-live="polite"
            >
              {paidSum === total
                ? `✓ Payments cover the ${money(total)} total`
                : paidSum < total
                  ? `${money(total - paidSum)} still to cover`
                  : `${money(paidSum - total)} more than the total`}
            </p>
          </>
        )}
      </section>

      {/* ── Who owes what ────────────────────────────────────────── */}
      <section className={[flow.card, flow.gapTop].join(' ')} aria-labelledby="owes-title">
        <header className={flow.sectionHead}>
          <span className={flow.stepBadge} aria-hidden="true">
            =
          </span>
          <div>
            <h2 id="owes-title" className={flow.sectionTitle}>
              How it settles
            </h2>
            <p className={flow.sectionHint}>
              Each person’s share of the bill, and what they owe or get back after what they paid.
            </p>
          </div>
        </header>
        <ul className={flow.rows}>
          {people.map((p) => {
            const owed = plan.ok ? (plan.owed[p.id] ?? 0) : 0
            const paid = plan.ok ? (plan.paid[p.id] ?? 0) : 0
            const balance = net[p.id] ?? 0
            return (
              <li key={p.id} className={styles.person}>
                <span className={styles.avatar} style={{ background: colourOf(p.id) }}>
                  {initialsOf(p.name)}
                </span>
                <span className={styles.personMain}>
                  <span className={styles.name}>{p.id === meId ? `${p.name} (you)` : p.name}</span>
                  <span className="t-caption">
                    Share{' '}
                    <span className={styles.personAmount} data-share data-num>
                      {money(owed)}
                    </span>
                    {paid > 0 ? ` · paid ${money(paid)}` : ''}
                  </span>
                </span>
                <span className={styles.balance}>
                  {!plan.ok ? (
                    <span className="t-caption">—</span>
                  ) : balance > 0 ? (
                    <>
                      <span className={styles.lent}>gets back</span>
                      <strong className={styles.lent} data-num>
                        {money(balance)}
                      </strong>
                    </>
                  ) : balance < 0 ? (
                    <>
                      <span className={styles.owe}>{p.id === meId ? 'you owe' : 'owes'}</span>
                      <strong className={styles.owe} data-num>
                        {money(-balance)}
                      </strong>
                    </>
                  ) : (
                    <span className="t-caption">settled</span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
        {transfers.length > 0 ? (
          <div className={styles.transferBox}>
            <strong>To settle up</strong>
            <ul className={styles.transfers}>
              {transfers.map((t) => (
                <li key={t.from + t.to}>
                  <span>
                    <strong>{nameOf(t.from)}</strong> {t.from === meId ? 'pay' : 'pays'}{' '}
                    <strong>{nameOf(t.to)}</strong>
                  </span>
                  <span data-num>{money(t.cents)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {!signedIn ? (
        <div className={styles.callout}>
          <strong>Not signed in to Splitwise</strong>
          <span>
            Copy the summary below, or <a href="/api/auth/login?next=/new">sign in with Splitwise</a>{' '}
            to add it in one tap — your split is saved on this device.
          </span>
        </div>
      ) : null}

      {signedIn && !allOnSplitwise ? (
        <div className={styles.callout}>
          <strong>Some people were added only to this split</strong>
          <span>
            To send it to Splitwise, go back and pick them from your Splitwise friends (or add them
            by email). You can still copy the summary.
          </span>
        </div>
      ) : null}

      {/* ── Destination ──────────────────────────────────────────── */}
      {canPush && availableGroups ? (
        <section className={[flow.card, flow.gapTop].join(' ')} aria-labelledby="group-title">
          <header className={flow.sectionHead}>
            <span className={flow.stepBadge} aria-hidden="true">
              ⌂
            </span>
            <div>
              <h2 id="group-title" className={flow.sectionTitle}>
                Where should it go in Splitwise?
              </h2>
              <p className={flow.sectionHint}>
                A group keeps it with that crew’s balances. “No group” adds it between you and each
                person directly.
              </p>
            </div>
          </header>
          <div className={styles.groupBody}>
            <GroupPicker
              groups={availableGroups}
              people={swPeople}
              selectedId={groupId}
              onSelect={(id) => {
                setGroupId(id)
                setGroupError(null)
                setCreatingGroup(false)
              }}
            />
            {groupId === 0 && !meInvolved ? (
              <p className={styles.hint}>
                You aren’t part of this split. Splitwise may only accept that inside a group — pick
                one if it’s refused.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {canPush && selectedGroup && missingPeople.length > 0 ? (
        <div className={styles.callout} role="status">
          <strong>
            {missingPeople.map((person) => person.name).join(', ')}{' '}
            {missingPeople.length === 1 ? 'is' : 'are'} not in {selectedGroup.name}
          </strong>
          <span>
            Choose what should happen first. Gauravide never adds anyone to a group without you
            asking.
          </span>
          <div className={styles.groupActions}>
            <Button onClick={() => void addPeopleToSelectedGroup()} loading={groupBusy}>
              Add {missingPeople.length === 1 ? missingPeople[0]?.name : 'them'} to{' '}
              {selectedGroup.name}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setCreatingGroup(true)
                setNewGroupName(receipt.merchant?.trim() || selectedGroup.name + ' split')
              }}
            >
              Create a new group
            </Button>
            <Button variant="tertiary" onClick={() => setGroupId(0)}>
              Use no group
            </Button>
          </div>
          {creatingGroup ? (
            <div className={styles.createGroup}>
              <Field
                label="New group name"
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder="Dinner crew"
              />
              <Button onClick={() => void createMatchingGroup()} loading={groupBusy}>
                Create group with everyone
              </Button>
            </div>
          ) : null}
          {groupError ? <span className={styles.groupError}>{groupError}</span> : null}
        </div>
      ) : null}

      <details className={styles.summary}>
        <summary>Copy a text summary</summary>
        <pre className={styles.pre}>{summaryText}</pre>
        <Button variant="secondary" onClick={copy}>
          {copied ? '✓ Copied' : 'Copy summary'}
        </Button>
      </details>

      {pushError ? (
        <div className={[styles.callout, styles.error].join(' ')} role="alert">
          <strong>{pushError}</strong>
          <span>Your split is still here — nothing was lost.</span>
        </div>
      ) : null}

      <div className={flow.cta}>
        <div className={flow.ctaInner}>
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
          {canPush ? (
            <Button
              full
              loading={pushing}
              onClick={push}
              disabled={!plan.ok || groupId === null || !groupIsReady}
              disabledReason={
                problem ??
                (!groupIsReady
                  ? 'Choose how to handle the people missing from this group'
                  : groupId === null
                    ? 'Choose where this expense should go'
                    : undefined)
              }
            >
              Add to Splitwise
            </Button>
          ) : (
            <Button full onClick={onDone} disabled={!plan.ok} disabledReason={problem}>
              Done
            </Button>
          )}
        </div>
      </div>
    </>
  )
}
