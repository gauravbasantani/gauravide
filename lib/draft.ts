/**
 * The in-progress split, kept in the browser (UX-17).
 *
 * Restaurants have bad wifi and phones ring. Losing fourteen assignments to a
 * dropped connection would be the single most infuriating failure this app
 * could have, so the draft survives a refresh, a backgrounded tab, and a
 * navigation away.
 *
 * Every storage access is wrapped: private browsing and a full quota both
 * throw, and neither may block the flow (GAP-21).
 */
import type { ExtractedReceipt } from './receipt'
import type { Payment, SplitMode } from './split'

// v2: assignments are keyed by item id, not row position. v1 drafts are
// ignored rather than migrated — a misattached assignment costs real money.
const KEY = 'gauravide:draft:v2'

export type Person = { id: string; name: string }

export type Step = 'upload' | 'review' | 'assign' | 'confirm' | 'done'

export type SplitSettings = {
  mode: SplitMode
  /** Equal mode: who is in. null = everyone. */
  included: string[] | null
  /** Shares mode: shares per person id. */
  weights: Record<string, number>
  /** Exact mode: cents per person id. */
  exact: Record<string, number>
  /** Several payers with amounts. null = one payer (payerId) paid it all. */
  payers: Payment[] | null
  /** By-item mode: uneven splits of single lines, keyed by item id (FR-32). */
  itemSplits: Record<string, ItemSplit>
}

export type ItemSplit = { kind: 'shares' | 'exact'; values: Record<string, number> }

export const DEFAULT_SETTINGS: SplitSettings = {
  mode: 'items',
  included: null,
  weights: {},
  exact: {},
  payers: null,
  itemSplits: {},
}

export type Draft = {
  step: Step
  receipt: ExtractedReceipt
  people: Person[]
  /** item id -> person ids sharing that line. */
  assignments: Record<string, string[]>
  payerId: string | null
  settings: SplitSettings
  /**
   * One key per draft, so a refresh, a remount, or a double tap can never
   * create a second Splitwise expense (FR-22).
   */
  submitKey: string
  /** Set once Splitwise accepted it. A restored draft shows success, not a second submit. */
  submittedExpenseId: number | null
  /** Set when reopening a saved split: submitting updates that Splitwise expense (FR-39). */
  editing: EditTarget | null
  savedAt: number
}

export type EditTarget = {
  splitId: string
  expenseId: number
  merchant: string | null
  /** Where it lives now, so the group stays selected unless changed. */
  groupId: number
}

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as Draft
    // A draft older than a day is almost certainly abandoned.
    if (Date.now() - draft.savedAt > 24 * 60 * 60 * 1000) return null
    return {
      ...draft,
      settings: { ...DEFAULT_SETTINGS, ...draft.settings },
      editing: draft.editing ?? null,
    }
  } catch {
    return null
  }
}

export function saveDraft(draft: Omit<Draft, 'savedAt'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }))
  } catch {
    // Quota full or storage blocked. The flow continues; only recovery is lost.
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem('gauravide:draft:v1')
  } catch {
    /* nothing to do */
  }
}
