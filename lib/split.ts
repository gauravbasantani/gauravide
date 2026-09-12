/**
 * Split — turns item assignments into what each person owes (FR-16, FR-18).
 *
 * Pure. Imports only ./money. The server recomputes with this at submit time;
 * the client's running totals are a preview (ARCHITECTURE.md §5).
 */
import { allocate, sum, type Cents } from './money'

export type PersonId = string

export type Item = {
  id: string
  name: string
  cents: Cents
  /** Who shares this line. Empty = unassigned, which blocks submission (FR-14). */
  people: readonly PersonId[]
  /** The letter printed beside the line, e.g. Costco's A / E. */
  taxFlag?: string
  /** Explicit taxability, when the receipt states it without a flag. */
  taxable?: boolean
}

export type TaxLine = { flag: string; cents: Cents }

export type SplitInput = {
  items: readonly Item[]
  people: readonly PersonId[]
  taxCents?: Cents
  /** Per-flag tax, when the receipt breaks it out (Costco prints A and E). */
  taxLines?: readonly TaxLine[]
  tipCents?: Cents
  feeCents?: Cents
  /** The printed total. Everything must reconcile to this, to the cent. */
  totalCents: Cents
}

export type TaxMethod = 'by-flag' | 'by-taxable-subtotal' | 'proportional'

export type SplitResult = {
  shares: Record<PersonId, Cents>
  /** Per person, before tax/tip/fees — shown as "their items". */
  itemSubtotals: Record<PersonId, Cents>
  taxMethod: TaxMethod
  /** Items nobody is assigned to. Non-empty blocks submit (FR-14). */
  unassignedItemIds: string[]
  /** True when shares sum to totalCents exactly. Submit is refused otherwise (ACC-3). */
  reconciles: boolean
  computedTotal: Cents
}

const empty = (people: readonly PersonId[]): Record<PersonId, Cents> =>
  Object.fromEntries(people.map((p) => [p, 0]))

function addInto(target: Record<PersonId, Cents>, people: readonly PersonId[], parts: Cents[]) {
  people.forEach((p, i) => {
    target[p] = (target[p] ?? 0) + (parts[i] ?? 0)
  })
}

/** Is this line taxed? Flag beats the explicit boolean; default is taxable. */
function isTaxable(item: Item, taxedFlags: ReadonlySet<string>): boolean {
  if (item.taxFlag !== undefined) return taxedFlags.has(item.taxFlag)
  return item.taxable ?? true
}

export function computeSplit(input: SplitInput): SplitResult {
  const { items, people, totalCents } = input
  const taxCents = input.taxCents ?? 0
  const tipCents = input.tipCents ?? 0
  const feeCents = input.feeCents ?? 0

  const itemSubtotals = empty(people)
  const shares = empty(people)
  const unassignedItemIds: string[] = []

  // 0. "Split the total" — a bar tab, a card slip, a receipt whose items
  //    could not be read (GAP-1). With no lines to assign, the total splits
  //    evenly across everyone. Leaving the shares at zero here would let
  //    settleRounding load the entire bill onto one person.
  if (items.length === 0 && totalCents !== 0 && people.length > 0) {
    const parts = allocate(totalCents, people.map(() => 1))
    addInto(shares, people, parts)
    addInto(itemSubtotals, people, parts)
    return {
      shares,
      itemSubtotals,
      taxMethod: 'proportional',
      unassignedItemIds: [],
      reconciles: sum(people.map((p) => shares[p] ?? 0)) === totalCents,
      computedTotal: sum(people.map((p) => shares[p] ?? 0)),
    }
  }

  // 1. Each line splits evenly among whoever is on it.
  //    A line split into N units is N separate items upstream (FR-12a), so
  //    there is nothing special to do here.
  for (const item of items) {
    if (item.people.length === 0) {
      unassignedItemIds.push(item.id)
      continue
    }
    const parts = allocate(item.cents, item.people.map(() => 1))
    addInto(itemSubtotals, item.people, parts)
    addInto(shares, item.people, parts)
  }

  // 2. Tax. Preferred: use the receipt's own per-flag breakdown, so people who
  //    took only low-rate items are not billed for someone else's 8.1%.
  const taxLines = input.taxLines?.filter((l) => l.cents !== 0) ?? []
  const taxedFlags = new Set(taxLines.map((l) => l.flag))
  let taxMethod: TaxMethod = 'proportional'

  if (taxLines.length > 0) {
    taxMethod = 'by-flag'
    for (const line of taxLines) {
      // Each person's share of the items carrying THIS flag.
      const base = empty(people)
      for (const item of items) {
        if (item.taxFlag !== line.flag || item.people.length === 0) continue
        addInto(base, item.people, allocate(item.cents, item.people.map(() => 1)))
      }
      const weights = people.map((p) => Math.max(0, base[p] ?? 0))
      addInto(shares, people, allocate(line.cents, weights))
    }
  } else if (taxCents !== 0) {
    const anyFlags = items.some((i) => i.taxFlag !== undefined || i.taxable !== undefined)
    taxMethod = anyFlags ? 'by-taxable-subtotal' : 'proportional'

    const base = empty(people)
    for (const item of items) {
      if (item.people.length === 0) continue
      if (taxMethod === 'by-taxable-subtotal' && !isTaxable(item, taxedFlags)) continue
      addInto(base, item.people, allocate(item.cents, item.people.map(() => 1)))
    }
    let weights = people.map((p) => Math.max(0, base[p] ?? 0))
    // Everything exempt but tax was charged: fall back to overall share.
    if (weights.every((w) => w === 0)) {
      weights = people.map((p) => Math.max(0, itemSubtotals[p] ?? 0))
      taxMethod = 'proportional'
    }
    addInto(shares, people, allocate(taxCents, weights))
  }

  // 3. Tip and fees always prorate by share of the subtotal — they have no
  //    concept of taxability (FR-16b).
  const extras = tipCents + feeCents
  if (extras !== 0) {
    const weights = people.map((p) => Math.max(0, itemSubtotals[p] ?? 0))
    addInto(shares, people, allocate(extras, weights))
  }

  // 4. Reconcile. Rounding leftovers land on the payer upstream; here we only
  //    report the truth (ACC-3 check 3).
  const computedTotal = sum(people.map((p) => shares[p] ?? 0))

  return {
    shares,
    itemSubtotals,
    taxMethod,
    unassignedItemIds,
    reconciles: unassignedItemIds.length === 0 && computedTotal === totalCents,
    computedTotal,
  }
}

/* ───────────────────── Split modes and payers ───────────────────── */

/**
 * How the receipt is divided — the same four ways Splitwise offers, with
 * "by item" first because it is the reason this app exists (FR-24).
 */
export type SplitMode = 'items' | 'equal' | 'shares' | 'exact'

/** One person's contribution to paying the bill (FR-25). */
export type Payment = { personId: PersonId; cents: Cents }

export type PlanInput = SplitInput & {
  mode: SplitMode
  /** Equal mode: who is in. Defaults to everyone. */
  included?: readonly PersonId[]
  /** Shares mode: whole-number shares per person (2 = twice as much as 1). */
  weights?: Readonly<Record<PersonId, number>>
  /** Exact mode: what each person owes, in cents. Must sum to the total. */
  exact?: Readonly<Record<PersonId, Cents>>
  /** Who paid, and how much. Must sum to the total. */
  payers: readonly Payment[]
}

export type PlanProblem =
  | 'no_people'
  | 'unassigned'
  | 'items_mismatch'
  | 'nobody_included'
  | 'no_shares'
  | 'exact_mismatch'
  | 'no_payer'
  | 'payer_not_in_split'
  | 'payers_mismatch'

export type Plan =
  | {
      ok: true
      /** What each person's share of the bill is. Sums to the total. */
      owed: Record<PersonId, Cents>
      /** What each person put in. Sums to the total. */
      paid: Record<PersonId, Cents>
      /** Everyone with a non-zero paid or owed amount — who goes on the expense. */
      participants: PersonId[]
      taxMethod: TaxMethod | null
    }
  | {
      ok: false
      problem: PlanProblem
      /** Signed cents still to account for, when the problem is a sum. */
      gap?: Cents
      unassignedItemIds?: string[]
    }

/**
 * The single source of truth for "who owes what, who paid what".
 *
 * Both the confirm screen and the submit route call this, so the preview can
 * never disagree with what reaches Splitwise (ARCHITECTURE.md A5).
 */
export function planSplit(input: PlanInput): Plan {
  const { people, totalCents } = input
  if (people.length === 0) return { ok: false, problem: 'no_people' }

  let owed: Record<PersonId, Cents>
  let taxMethod: TaxMethod | null = null

  if (input.mode === 'items') {
    const r = computeSplit(input)
    if (r.unassignedItemIds.length > 0) {
      return { ok: false, problem: 'unassigned', unassignedItemIds: r.unassignedItemIds }
    }
    // Judge reconciliation BEFORE settling — see settleRounding.
    const gap = totalCents - r.computedTotal
    if (Math.abs(gap) > maxRoundingDrift(people.length)) {
      return { ok: false, problem: 'items_mismatch', gap }
    }
    owed = r.shares
    taxMethod = r.taxMethod
  } else if (input.mode === 'equal') {
    const included = people.filter((p) => (input.included ?? people).includes(p))
    if (included.length === 0) return { ok: false, problem: 'nobody_included' }
    owed = empty(people)
    addInto(owed, included, allocate(totalCents, included.map(() => 1)))
  } else if (input.mode === 'shares') {
    const weights = people.map((p) => Math.max(0, Math.floor(input.weights?.[p] ?? 0)))
    if (weights.every((w) => w === 0)) return { ok: false, problem: 'no_shares' }
    owed = empty(people)
    addInto(owed, people, allocate(totalCents, weights))
  } else {
    owed = empty(people)
    for (const p of people) owed[p] = Math.trunc(input.exact?.[p] ?? 0)
    const gap = totalCents - sum(Object.values(owed))
    if (gap !== 0) return { ok: false, problem: 'exact_mismatch', gap }
  }

  // Payers. Every payer must be in the split, and together they cover the
  // whole bill — Splitwise rejects anything else.
  const payers = input.payers.filter((p) => p.cents !== 0)
  if (payers.length === 0) return { ok: false, problem: 'no_payer' }
  if (payers.some((p) => !people.includes(p.personId))) {
    return { ok: false, problem: 'payer_not_in_split' }
  }
  const paid = empty(people)
  for (const p of payers) paid[p.personId] = (paid[p.personId] ?? 0) + Math.trunc(p.cents)
  const payGap = totalCents - sum(Object.values(paid))
  if (payGap !== 0) return { ok: false, problem: 'payers_mismatch', gap: payGap }

  // Genuine rounding only (items mode) goes to whoever paid the most (FR-18).
  const primary = [...payers].sort((a, b) => b.cents - a.cents)[0]?.personId ?? ''
  owed = settleRounding(owed, totalCents, primary)

  const participants = people.filter((p) => (owed[p] ?? 0) !== 0 || (paid[p] ?? 0) !== 0)
  return { ok: true, owed, paid, participants, taxMethod }
}

/**
 * Net position per person: positive gets money back, negative owes.
 * Always sums to zero.
 */
export function netBalances(
  owed: Readonly<Record<PersonId, Cents>>,
  paid: Readonly<Record<PersonId, Cents>>,
): Record<PersonId, Cents> {
  const ids = new Set([...Object.keys(owed), ...Object.keys(paid)])
  return Object.fromEntries([...ids].map((id) => [id, (paid[id] ?? 0) - (owed[id] ?? 0)]))
}

export type Transfer = { from: PersonId; to: PersonId; cents: Cents }

/**
 * Who should pay whom to settle this one receipt — "Alex owes Gaurav $24".
 * Greedy, in the order people were added, so it is stable between renders.
 */
export function suggestTransfers(net: Readonly<Record<PersonId, Cents>>): Transfer[] {
  const debtors = Object.entries(net)
    .filter(([, cents]) => cents < 0)
    .map(([id, cents]) => ({ id, left: -cents }))
  const creditors = Object.entries(net)
    .filter(([, cents]) => cents > 0)
    .map(([id, cents]) => ({ id, left: cents }))
  const out: Transfer[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]
    const c = creditors[j]
    if (!d || !c) break
    const cents = Math.min(d.left, c.left)
    if (cents > 0) out.push({ from: d.id, to: c.id, cents })
    d.left -= cents
    c.left -= cents
    if (d.left === 0) i++
    if (c.left === 0) j++
  }
  return out
}

/**
 * The largest gap that can legitimately come from rounding: at most one cent
 * per person per allocation pass (items, tax, tip/fees).
 */
export function maxRoundingDrift(peopleCount: number): Cents {
  return Math.max(1, peopleCount * 3)
}

/**
 * Force the shares to sum to the total by giving any leftover cents to the
 * payer (FR-18). Rounding across several allocations can leave a cent or two.
 *
 * CALLER BEWARE: this makes the sum equal the total BY CONSTRUCTION. Checking
 * `sum === total` afterwards is therefore always true and proves nothing — an
 * audit found exactly that dead guard in the submit route, which meant a
 * receipt whose items did not match its printed total had the whole
 * difference charged silently to the payer under a green "matches receipt"
 * badge. Check `reconciles` and the drift BEFORE calling this.
 */
export function settleRounding(
  shares: Record<PersonId, Cents>,
  totalCents: Cents,
  payer: PersonId,
): Record<PersonId, Cents> {
  const current = sum(Object.values(shares))
  const drift = totalCents - current
  if (drift === 0) return shares
  return { ...shares, [payer]: (shares[payer] ?? 0) + drift }
}
