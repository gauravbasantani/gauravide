import { describe, it, expect } from 'vitest'
import { parseMoney, formatMoney, allocate, sum } from '@/lib/money'

describe('parseMoney', () => {
  it('parses plain amounts', () => {
    expect(parseMoney('5.49')).toEqual({ ok: true, cents: 549 })
    expect(parseMoney('$108.50')).toEqual({ ok: true, cents: 10850 })
    expect(parseMoney('0.60')).toEqual({ ok: true, cents: 60 })
    expect(parseMoney('20')).toEqual({ ok: true, cents: 2000 })
  })

  it('parses US grouping', () => {
    expect(parseMoney('1,234.56')).toEqual({ ok: true, cents: 123456 })
  })

  // GAP-16. Misreading this is a 100x money error, not a typo.
  it('parses European decimals', () => {
    expect(parseMoney('1.234,56')).toEqual({ ok: true, cents: 123456 })
    expect(parseMoney('12,50')).toEqual({ ok: true, cents: 1250 })
  })

  it("handles Costco's trailing-minus negatives", () => {
    expect(parseMoney('3.00-')).toEqual({ ok: true, cents: -300 })
    expect(parseMoney('-3.00')).toEqual({ ok: true, cents: -300 })
  })

  it('rejects nonsense rather than guessing', () => {
    expect(parseMoney('').ok).toBe(false)
    expect(parseMoney('abc').ok).toBe(false)
    expect(parseMoney('1.234').ok).toBe(false) // three decimals is not money
  })
})

describe('formatMoney', () => {
  it('always shows a currency symbol', () => {
    expect(formatMoney(10850)).toBe('$108.50')
    expect(formatMoney(-300)).toBe('-$3.00')
  })
})

describe('allocate — the guarantee', () => {
  it('splits evenly when it divides cleanly', () => {
    expect(allocate(1200, [1, 1, 1, 1])).toEqual([300, 300, 300, 300])
  })

  // The classic rounding trap: $45.67 three ways.
  it('sums to the total exactly on an awkward split', () => {
    const parts = allocate(4567, [1, 1, 1])
    expect(sum(parts)).toBe(4567)
    expect(parts).toEqual([1523, 1522, 1522])
  })

  it('respects weights', () => {
    const parts = allocate(1000, [3, 1])
    expect(parts).toEqual([750, 250])
    expect(sum(parts)).toBe(1000)
  })

  it('handles negative totals (refunds)', () => {
    const parts = allocate(-300, [1, 1, 1])
    expect(sum(parts)).toBe(-300)
  })

  it('falls back to an even split when all weights are zero', () => {
    const parts = allocate(100, [0, 0, 0])
    expect(sum(parts)).toBe(100)
  })

  it('is deterministic — same input, same output (ACC-9)', () => {
    expect(allocate(10007, [5, 3, 2])).toEqual(allocate(10007, [5, 3, 2]))
  })

  // The property that matters more than any single case (ARCHITECTURE §10).
  it('PROPERTY: parts always sum to the total, for any total and weights', () => {
    let rng = 12345
    const next = () => (rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648

    for (let trial = 0; trial < 2000; trial++) {
      const total = Math.floor(next() * 200000) - 50000
      const n = 1 + Math.floor(next() * 9)
      const weights = Array.from({ length: n }, () => Math.floor(next() * 5000))
      const parts = allocate(total, weights)
      expect(parts).toHaveLength(n)
      expect(sum(parts)).toBe(total)
    }
  })
})
