import type { ExtractedReceipt } from '@/lib/receipt'
import type { SplitMode } from '@/lib/split'

export type StoredPerson = { id: number; name: string }

export type StoredSplitData = {
  merchant: string | null
  date: string | null
  currency: string
  totalCents: number
  taxCents: number
  tipCents: number
  feeCents: number
  items: ExtractedReceipt['items']
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
}

export type StoredSplit = {
  id: string
  owner_id: string
  data: StoredSplitData
  expense_ids: string[]
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

/** "You paid $48.00", "Alex paid $48.00", or "2 people paid $48.00". */
export function paidByLabel(split: StoredSplit, formatted: (cents: number) => string): string {
  const { paid, people, payerId, totalCents } = split.data
  const payers = paid
    ? Object.entries(paid).filter(([, cents]) => cents > 0)
    : [[String(payerId), totalCents] as const]
  if (payers.length > 1) return `${payers.length} people paid ${formatted(totalCents)}`
  const [id] = payers[0] ?? ['']
  if (id === split.owner_id) return `You paid ${formatted(totalCents)}`
  const name = people.find((p) => String(p.id) === id)?.name.split(' ')[0] ?? 'Someone'
  return `${name} paid ${formatted(totalCents)}`
}
