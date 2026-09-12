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

const KEY = 'gauravide:draft:v1'

export type Person = { id: string; name: string }

export type Step = 'upload' | 'review' | 'assign' | 'confirm' | 'done'

export type Draft = {
  step: Step
  receipt: ExtractedReceipt
  people: Person[]
  /** itemIndex -> person ids sharing that line. */
  assignments: Record<string, string[]>
  payerId: string | null
  savedAt: number
}

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as Draft
    // A draft older than a day is almost certainly abandoned.
    if (Date.now() - draft.savedAt > 24 * 60 * 60 * 1000) return null
    return draft
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
  } catch {
    /* nothing to do */
  }
}
