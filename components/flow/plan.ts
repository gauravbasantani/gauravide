/**
 * Glue between the draft (what the user has tapped) and lib/split (the math).
 * Every screen and the submit payload build their plan through here, so they
 * cannot drift apart.
 */
import { formatMoney } from '@/lib/money'
import { itemKey, type ExtractedReceipt } from '@/lib/receipt'
import { planSplit, type Item, type Payment, type Plan, type SplitMode } from '@/lib/split'
import type { ItemSplit, Person, SplitSettings } from '@/lib/draft'

export function receiptTotal(receipt: ExtractedReceipt): number {
  return (
    receipt.totalCents ??
    receipt.items.reduce((a, i) => a + i.cents, 0) +
      receipt.taxCents +
      receipt.tipCents +
      receipt.feeCents
  )
}

export function planItems(
  receipt: ExtractedReceipt,
  assignments: Record<string, string[]>,
  itemSplits: Record<string, ItemSplit> = {},
): Item[] {
  return receipt.items.map((item, i) => {
    const id = itemKey(item, i)
    const split = itemSplits[id]
    return {
      id,
      name: item.name || `Item ${i + 1}`,
      cents: item.cents,
      ...(item.taxFlag ? { taxFlag: item.taxFlag } : {}),
      people: assignments[id] ?? [],
      ...(split ? { split } : {}),
    }
  })
}

/** Shares default to 1 each, so switching to "By shares" starts as an even split. */
export function filledWeights(settings: SplitSettings, people: Person[]): Record<string, number> {
  return Object.fromEntries(people.map((p) => [p.id, settings.weights[p.id] ?? 1]))
}

export function includedIds(settings: SplitSettings, people: Person[]): string[] {
  const ids = people.map((p) => p.id)
  return settings.included ? ids.filter((id) => settings.included?.includes(id)) : ids
}

/** One payer covers everything unless the user chose several (FR-25). */
export function payersFor(
  settings: SplitSettings,
  payerId: string | null,
  people: Person[],
  total: number,
): Payment[] {
  const ids = new Set(people.map((p) => p.id))
  if (settings.payers) return settings.payers.filter((p) => ids.has(p.personId))
  return payerId && ids.has(payerId) ? [{ personId: payerId, cents: total }] : []
}

export function buildPlan(
  receipt: ExtractedReceipt,
  people: Person[],
  assignments: Record<string, string[]>,
  settings: SplitSettings,
  payers: Payment[],
): Plan {
  return planSplit({
    mode: settings.mode,
    items: planItems(receipt, assignments, settings.itemSplits),
    people: people.map((p) => p.id),
    included: includedIds(settings, people),
    weights: filledWeights(settings, people),
    exact: settings.exact,
    taxLines: receipt.taxLines,
    taxCents: receipt.taxCents,
    tipCents: receipt.tipCents,
    feeCents: receipt.feeCents,
    totalCents: receiptTotal(receipt),
    payers,
  })
}

/** A plain-language reason a plan cannot be sent yet. */
export function problemText(plan: Plan, currency: string): string | undefined {
  if (plan.ok) return undefined
  const fmt = (cents: number) => formatMoney(Math.abs(cents), currency)
  const gap = plan.gap ?? 0
  switch (plan.problem) {
    case 'no_people':
      return 'Add at least one person'
    case 'unassigned': {
      const n = plan.unassignedItemIds?.length ?? 0
      return `${n} item${n === 1 ? '' : 's'} still need${n === 1 ? 's' : ''} someone`
    }
    case 'items_mismatch':
      return gap > 0
        ? `The items are ${fmt(gap)} short of the receipt total — go back and check the amounts`
        : `The items are ${fmt(gap)} more than the receipt total — go back and check the amounts`
    case 'item_exact_mismatch':
      return gap > 0
        ? `One item’s amounts are ${fmt(gap)} short — tap “Edit split” on it`
        : `One item’s amounts are ${fmt(gap)} over — tap “Edit split” on it`
    case 'nobody_included':
      return 'Tick at least one person to split with'
    case 'no_shares':
      return 'Give at least one person a share'
    case 'exact_mismatch':
      return gap > 0 ? `${fmt(gap)} still to assign` : `${fmt(gap)} more than the total`
    case 'no_payer':
      return 'Choose who paid'
    case 'payer_not_in_split':
      return 'Whoever paid needs to be in the split'
    case 'payers_mismatch':
      return gap > 0
        ? `Payments are ${fmt(gap)} short of the total`
        : `Payments are ${fmt(gap)} more than the total`
  }
}

/** Problems that belong to the "who paid" section rather than the split itself. */
export const isPayerProblem = (plan: Plan): boolean =>
  !plan.ok && ['no_payer', 'payer_not_in_split', 'payers_mismatch'].includes(plan.problem)

export const MODES: { value: SplitMode; title: string; hint: string; icon: string }[] = [
  { value: 'items', title: 'By item', hint: 'Tap who had each line', icon: '🧾' },
  { value: 'equal', title: 'Equally', hint: 'Everyone pays the same', icon: '＝' },
  { value: 'shares', title: 'By shares', hint: 'A couple can count as 2', icon: '½' },
  { value: 'exact', title: 'Exact amounts', hint: 'Type what each owes', icon: '$' },
]
