import type { ExtractedReceipt } from '@/lib/receipt'

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
  payerId: number
  groupId: number
  groupName: string
  status: 'in_splitwise'
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
