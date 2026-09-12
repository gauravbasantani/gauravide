import { describe, expect, it } from 'vitest'
import { splitQuantityIntoItems } from '@/lib/receipt'

describe('splitQuantityIntoItems', () => {
  it('creates individually assignable units and preserves every cent', () => {
    const units = splitQuantityIntoItems({
      name: 'Tomato bag',
      qty: 4,
      cents: 1001,
      confidence: 1,
    })

    expect(units).toEqual([
      expect.objectContaining({ name: 'Tomato bag (1 of 4)', qty: 1, cents: 251 }),
      expect.objectContaining({ name: 'Tomato bag (2 of 4)', qty: 1, cents: 250 }),
      expect.objectContaining({ name: 'Tomato bag (3 of 4)', qty: 1, cents: 250 }),
      expect.objectContaining({ name: 'Tomato bag (4 of 4)', qty: 1, cents: 250 }),
    ])
    expect(units.reduce((total, unit) => total + unit.cents, 0)).toBe(1001)
  })
})
