import { discountParents } from '@/lib/receipt'
import type { SplitMode, TaxLine } from '@/lib/split'
import type { Draft, ItemSplit } from '@/lib/draft'

export type StoredPerson = { id: number; name: string }

/** One line as the submit route saved it: who shared it, and how. */
export type StoredItem = {
  name: string
  cents: number
  taxFlag?: string
  qty?: number
  people?: number[]
  split?: ItemSplit
}

export type StoredSplitData = {
  merchant: string | null
  date: string | null
  currency: string
  totalCents: number
  taxCents: number
  tipCents: number
  feeCents: number
  items: StoredItem[]
  people: StoredPerson[]
  /** The largest payer. Kept for rows saved before several payers existed. */
  payerId: number
  groupId: number
  groupName: string
  status: 'in_splitwise'
  /** Added with split modes. Absent on older rows — render without them. */
  mode?: SplitMode
  /** Splitwise user id -> cents. */
  owed?: Record<string, number>
  paid?: Record<string, number>
  idempotencyKey?: string
  /** Saved from 2026-09-12 so an edit reopens exactly as it was submitted. */
  taxLines?: TaxLine[]
  included?: number[] | null
  weights?: Record<string, number>
  exact?: Record<string, number>
  /** Set by syncing with Splitwise (FR-48). */
  syncedAt?: string
  deletedInSplitwise?: boolean
  /** Amounts came from Splitwise, so the item breakdown may no longer match. */
  itemsStale?: boolean
  /** Present while a read-only share link exists for this split (FR-53). */
  shareToken?: string
  sharedAt?: string
  /** Set when the owner removed their copy (DB-12). Contents are gone; counts stay. */
  removedAt?: string
  /** Recorded at removal, because the photo itself is deleted with the copy. */
  hadPhoto?: boolean
}

/** PostgREST filter for "rows the owner can still see" — removal is not erasure. */
export const NOT_REMOVED = { 'data->>removedAt': 'is.null' } as const

/**
 * What is left of a split after its owner removes it (DB-12).
 *
 * The receipt goes: merchant, date, line items, names, who owes whom. What
 * stays is the aggregate the admin dashboard already counts — amount, currency,
 * how many items and people, which Splitwise accounts were involved. Usage
 * history is a record of what the app did, and one person deleting their copy
 * must not rewrite it. Nothing kept here can reconstruct the receipt.
 */
export function redactedForRemoval(
  data: StoredSplitData & Record<string, unknown>,
  hadPhoto: boolean,
): Record<string, unknown> {
  const keep = ['currency', 'totalCents', 'mode', 'groupId', 'itemCount', 'peopleCount', 'payerCount'] as const
  const summary: Record<string, unknown> = { removedAt: new Date().toISOString(), hadPhoto }
  for (const field of keep) if (data[field] !== undefined) summary[field] = data[field]
  if (Array.isArray(data.participants)) summary.participants = data.participants
  return summary
}

export type StoredSplit = {
  id: string
  owner_id: string
  data: StoredSplitData
  expense_ids: string[]
  /** Private storage path of the receipt photo, when one was kept (FR-38). */
  image_path: string | null
  archived_at: string | null
  created_at: string
}

export function initials(names: StoredPerson[]): string {
  return names
    .map((person) =>
      person.name
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
    )
    .filter(Boolean)
    .join(' · ')
}

/**
 * The viewer's position on one split, the way Splitwise phrases it:
 * positive = "you lent", negative = "you borrowed". null for legacy rows.
 */
export function viewerBalance(split: StoredSplit): { net: number; paid: number } | null {
  const { owed, paid } = split.data
  if (!owed || !paid) return null
  const me = split.owner_id
  return { net: (paid[me] ?? 0) - (owed[me] ?? 0), paid: paid[me] ?? 0 }
}

/** Who put money in, largest first. Falls back to the single payer on old rows. */
export function payersOf(split: StoredSplit): [string, number][] {
  const { paid, payerId, totalCents } = split.data
  const entries: [string, number][] = paid
    ? Object.entries(paid).filter(([, cents]) => cents > 0)
    : [[String(payerId), totalCents]]
  return entries.sort((a, b) => b[1] - a[1])
}

/** "You paid $48.00", "Alex paid $48.00", or "2 people paid $48.00". */
export function paidByLabel(split: StoredSplit, formatted: (cents: number) => string): string {
  const { people, totalCents } = split.data
  const payers = payersOf(split)
  if (payers.length > 1) return `${payers.length} people paid ${formatted(totalCents)}`
  const [id] = payers[0] ?? ['']
  if (id === split.owner_id) return `You paid ${formatted(totalCents)}`
  const name = people.find((p) => String(p.id) === id)?.name.split(' ')[0] ?? 'Someone'
  return `${name} paid ${formatted(totalCents)}`
}

/**
 * Rebuild the in-progress draft from a saved split, so "Edit split" reopens
 * the flow exactly as it was submitted (FR-39).
 */
export function draftFromSplit(split: StoredSplit, makeId: () => string): Omit<Draft, 'savedAt'> {
  const d = split.data
  const ids = d.items.map(() => makeId())
  const idAt = (i: number) => ids[i] ?? String(i)
  const payers = payersOf(split)
  const mode = d.mode ?? 'items'
  // Rows saved before split settings were stored reopen as exact amounts,
  // which reproduces what was sent to Splitwise to the cent.
  const legacyNonItem =
    mode !== 'items' && d.included === undefined && d.weights === undefined && d.exact === undefined

  // A discount that followed its item was saved with that item's people.
  // Reopen it as following again, so changing who had the item still moves
  // the discount with it (FR-42).
  const parents = discountParents(
    d.items.map((item, i) => ({ key: String(i), name: item.name, cents: item.cents })),
  )
  const samePeople = (a: number[] = [], b: number[] = []) =>
    a.length > 0 && a.length === b.length && a.every((id) => b.includes(id))
  const followed = new Set(
    Object.entries(parents)
      .filter(([child, parent]) => samePeople(d.items[Number(child)]?.people, d.items[Number(parent)]?.people))
      .map(([child]) => Number(child)),
  )

  return {
    step: 'review',
    receipt: {
      merchant: d.merchant,
      date: d.date,
      currency: d.currency || 'USD',
      items: d.items.map((item, i) => ({
        id: idAt(i),
        name: item.name,
        qty: item.qty ?? 1,
        cents: item.cents,
        ...(item.taxFlag ? { taxFlag: item.taxFlag } : {}),
        confidence: 1,
      })),
      taxLines: d.taxLines ?? [],
      subtotalCents: null,
      taxCents: d.taxCents,
      tipCents: d.tipCents,
      feeCents: d.feeCents,
      totalCents: d.totalCents,
    },
    people: d.people.map((p) => ({ id: String(p.id), name: p.name })),
    assignments: Object.fromEntries(
      d.items.map((item, i) => [idAt(i), followed.has(i) ? [] : (item.people ?? []).map(String)]),
    ),
    payerId: payers[0]?.[0] ?? null,
    settings: {
      mode: legacyNonItem ? 'exact' : mode,
      included: d.included ? d.included.map(String) : null,
      weights: d.weights ?? {},
      exact: legacyNonItem ? (d.owed ?? {}) : (d.exact ?? {}),
      payers:
        payers.length > 1 ? payers.map(([personId, cents]) => ({ personId, cents })) : null,
      itemSplits: Object.fromEntries(
        d.items.flatMap((item, i) =>
          item.split && !followed.has(i) ? [[idAt(i), item.split]] : [],
        ),
      ),
    },
    submitKey: makeId(),
    submittedExpenseId: null,
    editing: {
      splitId: split.id,
      expenseId: Number(split.expense_ids[0] ?? 0),
      merchant: d.merchant,
      groupId: d.groupId,
    },
  }
}
