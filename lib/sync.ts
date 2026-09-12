/**
 * Comparing our saved copy with what Splitwise has now (FR-48).
 *
 * Pure, so every comparison is unit-tested. Splitwise stores an expense as a
 * cost plus per-person shares — it has no idea about items — so a change made
 * there can be pulled into the totals and shares, but the item breakdown stays
 * ours and is marked as possibly out of date.
 */
import type { StoredSplitData } from './history'
import type { SplitwiseExpense } from './splitwise'

export type RemoteExpense = {
  totalCents: number
  description: string
  date: string | null
  groupId: number
  currency: string | null
  deleted: boolean
  updatedAt: string | null
  /** Splitwise user id -> cents. */
  paid: Record<string, number>
  owed: Record<string, number>
}

export type Difference = { label: string; ours: string; theirs: string }

const toCents = (value: string | null | undefined): number =>
  Math.round(Number(value ?? '0') * 100) || 0

export function readRemote(expense: SplitwiseExpense): RemoteExpense {
  const paid: Record<string, number> = {}
  const owed: Record<string, number> = {}
  for (const share of expense.users ?? []) {
    const id = String(share.user_id ?? share.user?.id ?? '')
    if (!id) continue
    paid[id] = (paid[id] ?? 0) + toCents(share.paid_share)
    owed[id] = (owed[id] ?? 0) + toCents(share.owed_share)
  }
  return {
    totalCents: toCents(expense.cost),
    description: expense.description ?? '',
    // Splitwise returns a full timestamp; the receipt only ever had a day.
    date: expense.date ? expense.date.slice(0, 10) : null,
    groupId: expense.group_id ?? 0,
    currency: expense.currency_code ?? null,
    deleted: Boolean(expense.deleted_at),
    updatedAt: expense.updated_at ?? null,
    paid,
    owed,
  }
}

const sameMoneyMap = (a: Record<string, number> = {}, b: Record<string, number> = {}) => {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...ids].every((id) => (a[id] ?? 0) === (b[id] ?? 0))
}

/**
 * What changed in Splitwise since we saved it. Empty means they agree.
 * `format` renders cents the way the page does.
 */
export function differences(
  stored: StoredSplitData,
  remote: RemoteExpense,
  format: (cents: number) => string,
): Difference[] {
  const out: Difference[] = []
  if (stored.totalCents !== remote.totalCents) {
    out.push({ label: 'Total', ours: format(stored.totalCents), theirs: format(remote.totalCents) })
  }
  const ourDescription = stored.merchant?.trim() || 'Receipt'
  if (ourDescription !== remote.description) {
    out.push({ label: 'Name', ours: ourDescription, theirs: remote.description || '(none)' })
  }
  if ((stored.date ?? null) !== remote.date) {
    out.push({ label: 'Date', ours: stored.date ?? '(none)', theirs: remote.date ?? '(none)' })
  }
  if (stored.groupId !== remote.groupId) {
    out.push({
      label: 'Group',
      ours: stored.groupId === 0 ? 'No group' : stored.groupName || `Group ${stored.groupId}`,
      theirs: remote.groupId === 0 ? 'No group' : `Group ${remote.groupId}`,
    })
  }
  if (stored.owed && !sameMoneyMap(stored.owed, remote.owed)) {
    out.push({ label: 'Who owes what', ours: 'as saved here', theirs: 'changed in Splitwise' })
  }
  if (stored.paid && !sameMoneyMap(stored.paid, remote.paid)) {
    out.push({ label: 'Who paid', ours: 'as saved here', theirs: 'changed in Splitwise' })
  }
  return out
}

/**
 * Our saved copy, updated from Splitwise. Items are left alone — Splitwise
 * never had them — and flagged when the total no longer matches them.
 */
export function applyRemote(stored: StoredSplitData, remote: RemoteExpense): StoredSplitData {
  const itemSum = stored.items.reduce((a, item) => a + item.cents, 0)
  const extras = stored.taxCents + stored.tipCents + stored.feeCents
  return {
    ...stored,
    totalCents: remote.totalCents,
    merchant: remote.description || stored.merchant,
    date: remote.date ?? stored.date,
    groupId: remote.groupId,
    groupName: remote.groupId === 0 ? 'No group' : stored.groupName,
    currency: remote.currency || stored.currency,
    owed: remote.owed,
    paid: remote.paid,
    payerId: Number(
      Object.entries(remote.paid).sort(([, a], [, b]) => b - a)[0]?.[0] ?? stored.payerId,
    ),
    itemsStale: itemSum + extras !== remote.totalCents,
    syncedAt: new Date().toISOString(),
  }
}
