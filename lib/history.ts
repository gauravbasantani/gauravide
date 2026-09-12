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
      d.items.map((item, i) => [idAt(i), (item.people ?? []).map(String)]),
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
        d.items.flatMap((item, i) => (item.split ? [[idAt(i), item.split]] : [])),
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
