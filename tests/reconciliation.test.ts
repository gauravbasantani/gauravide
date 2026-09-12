import { describe, it, expect } from 'vitest'
import { computeSplit, maxRoundingDrift, settleRounding } from '@/lib/split'
import { sum } from '@/lib/money'

/**
 * These tests exist because an audit found that the reconciliation guard was
 * dead code: settleRounding() forces the shares to sum to the total, and the
 * check ran AFTER it. Any discrepancy between the items and the printed total
 * was therefore loaded silently onto the payer, under a green "matches
 * receipt" badge.
 */
describe('reconciliation must catch a real mismatch', () => {
  it('computeSplit reports the truth before settling', () => {
    const r = computeSplit({
      items: [{ id: '1', name: 'Milk', cents: 1000, people: ['a'] }],
      people: ['a', 'b'],
      totalCents: 10000, // printed total is $100, items only add to $10
    })
    expect(r.computedTotal).toBe(1000)
    expect(r.reconciles).toBe(false) // the honest signal
  })

  it('settleRounding will happily absorb ANY gap — that is why order matters', () => {
    const settled = settleRounding({ a: 1000, b: 0 }, 10000, 'a')
    expect(sum(Object.values(settled))).toBe(10000)
    expect(settled.a).toBe(10000) // $90 of nowhere, charged to one person
  })

  it('a total-only split has no items to block on, so the math must be right', () => {
    const r = computeSplit({ items: [], people: ['a', 'b', 'c'], totalCents: 9000 })
    // Nothing is "unassigned" — there are no items — so unassignedItemIds
    // cannot be the safety net here. The shares themselves must be correct.
    expect(r.unassignedItemIds).toEqual([])
    expect(r.computedTotal).toBe(9000)
  })

  it('drift from rounding is tiny — a real mismatch is not', () => {
    // Legitimate rounding drift is at most one cent per person.
    const r = computeSplit({
      items: [
        { id: '1', name: 'A', cents: 1000, people: ['a', 'b', 'c'] },
        { id: '2', name: 'B', cents: 333, people: ['a', 'b', 'c'] },
      ],
      people: ['a', 'b', 'c'],
      totalCents: 1333,
    })
    expect(Math.abs(r.computedTotal - 1333)).toBeLessThanOrEqual(3)
  })
})

describe('after the fix', () => {
  it('a total-only split now divides evenly instead of zeroing out', () => {
    const r = computeSplit({ items: [], people: ['a', 'b', 'c'], totalCents: 9000 })
    expect(r.shares).toEqual({ a: 3000, b: 3000, c: 3000 })
    expect(r.computedTotal).toBe(9000)
    expect(r.reconciles).toBe(true)
  })

  it('an odd total-only split still sums exactly', () => {
    const r = computeSplit({ items: [], people: ['a', 'b', 'c'], totalCents: 10000 })
    expect(sum(Object.values(r.shares))).toBe(10000)
    expect(r.reconciles).toBe(true)
  })

  it('maxRoundingDrift tolerates real rounding but not a real gap', () => {
    expect(maxRoundingDrift(3)).toBeGreaterThanOrEqual(3)
    // A $90 discrepancy is nothing like rounding.
    expect(9000).toBeGreaterThan(maxRoundingDrift(3))
  })

  it('a genuine mismatch is now detectable by drift, not hidden by settling', () => {
    const r = computeSplit({
      items: [{ id: '1', name: 'Milk', cents: 1000, people: ['a'] }],
      people: ['a', 'b'],
      totalCents: 10000,
    })
    const drift = Math.abs(10000 - r.computedTotal)
    expect(drift).toBe(9000)
    expect(drift).toBeGreaterThan(maxRoundingDrift(2)) // submit must be blocked
  })
})
