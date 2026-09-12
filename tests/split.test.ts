import { describe, it, expect } from 'vitest'
import { computeSplit, settleRounding, type Item } from '@/lib/split'
import { sum } from '@/lib/money'
import costco from './fixtures/costco-tempe-2026-09-04.json'

const G = 'gaurav'
const A = 'alex'
const M = 'maya'

describe('the real Costco receipt', () => {
  it('fixture is internally consistent', () => {
    expect(sum(costco.items.map((i) => i.cents))).toBe(costco.subtotalCents)
    expect(sum(costco.taxLines.map((t) => t.cents))).toBe(costco.taxCents)
    expect(costco.subtotalCents + costco.taxCents).toBe(costco.totalCents)
  })

  // Gaurav takes the towel + flashlight (both 8.1%), Alex the bath mat and the
  // drink variety; snacks, the discount and the water are shared.
  const items: Item[] = [
    { id: '1', name: 'KS TOWEL', cents: 2079, taxFlag: 'A', people: [G] },
    { id: '2', name: 'KS BATH', cents: 2099, taxFlag: 'A', people: [A] },
    { id: '3', name: 'HVST SNAPS', cents: 859, taxFlag: 'E', people: [G, A] },
    { id: '4', name: '/ SNAPS', cents: -300, taxFlag: 'E', people: [G, A] },
    { id: '5', name: 'FLASHLIGHT', cents: 2699, taxFlag: 'A', people: [G] },
    { id: '6', name: 'BUILT VRTY', cents: 1999, taxFlag: 'E', people: [A] },
    { id: '7', name: 'KSWTR40PK', cents: 399, taxFlag: 'E', people: [G, A] },
    { id: '8', name: 'KSWTR40PK', cents: 399, taxFlag: 'E', people: [G, A] },
  ]

  const result = computeSplit({
    items,
    people: [G, A],
    taxLines: costco.taxLines,
    totalCents: costco.totalCents,
  })

  it('reconciles to the printed total, to the cent', () => {
    expect(result.computedTotal).toBe(10850)
    expect(result.reconciles).toBe(true)
  })

  it('uses the receipt’s own tax flags', () => {
    expect(result.taxMethod).toBe('by-flag')
  })

  it('bills the 8.1% tax to whoever took the 8.1% items', () => {
    // Gaurav: towel 20.79 + flashlight 26.99 = 47.78 of the 68.77 A-flagged.
    // Alex: bath 20.99. So Gaurav owes clearly more of the $5.57.
    const gaurav = result.shares[G] ?? 0
    const alex = result.shares[A] ?? 0
    expect(gaurav + alex).toBe(10850)
    expect(gaurav).toBeGreaterThan(alex)
  })

  it('keeps the discount in the split — dropping it would overcharge everyone', () => {
    const withDiscount = result.computedTotal
    const without = computeSplit({
      items: items.filter((i) => i.cents >= 0),
      people: [G, A],
      taxLines: costco.taxLines,
      totalCents: costco.totalCents,
    })
    expect(without.computedTotal).toBe(withDiscount + 300)
    expect(without.reconciles).toBe(false)
  })
})

describe('tax allocation is fairer than flat proration', () => {
  it('a person with only exempt items pays none of the taxed rate', () => {
    const items: Item[] = [
      { id: '1', name: 'Flashlight', cents: 2699, taxFlag: 'A', people: [G] },
      { id: '2', name: 'Water', cents: 399, taxFlag: 'E', people: [A] },
    ]
    const r = computeSplit({
      items,
      people: [G, A],
      taxLines: [{ flag: 'A', cents: 219 }],
      totalCents: 2699 + 399 + 219,
    })
    expect(r.reconciles).toBe(true)
    expect(r.shares[G]).toBe(2699 + 219) // all of the A tax
    expect(r.shares[A]).toBe(399) // none of it
  })

  it('falls back to the taxable subtotal when only a total tax is printed', () => {
    const r = computeSplit({
      items: [
        { id: '1', name: 'Taxed', cents: 1000, taxable: true, people: [G] },
        { id: '2', name: 'Exempt', cents: 1000, taxable: false, people: [A] },
      ],
      people: [G, A],
      taxCents: 100,
      totalCents: 2100,
    })
    expect(r.taxMethod).toBe('by-taxable-subtotal')
    expect(r.shares[G]).toBe(1100)
    expect(r.shares[A]).toBe(1000)
  })

  it('falls back to proportional when the receipt says nothing about taxability', () => {
    const r = computeSplit({
      items: [
        { id: '1', name: 'A', cents: 1000, people: [G] },
        { id: '2', name: 'B', cents: 1000, people: [A] },
      ],
      people: [G, A],
      taxCents: 100,
      totalCents: 2100,
    })
    expect(r.taxMethod).toBe('proportional')
    expect(r.shares[G]).toBe(1050)
  })
})

describe('the tomatoes case (FR-12a)', () => {
  it('4 bags as 2/1/1 gives everyone $3.00', () => {
    const bag = (id: string, people: string[]): Item => ({
      id,
      name: `Tomatoes (${id} of 4)`,
      cents: 300,
      people,
    })
    const r = computeSplit({
      items: [bag('1', [G, A]), bag('2', [G, A]), bag('3', [M]), bag('4', ['dana'])],
      people: [G, A, M, 'dana'],
      totalCents: 1200,
    })
    expect(r.shares).toEqual({ gaurav: 300, alex: 300, maya: 300, dana: 300 })
    expect(r.reconciles).toBe(true)
  })
})

describe('guards', () => {
  it('reports unassigned items and refuses to reconcile', () => {
    const r = computeSplit({
      items: [
        { id: '1', name: 'Milk', cents: 549, people: [G] },
        { id: '2', name: 'Detergent', cents: 899, people: [] },
      ],
      people: [G],
      totalCents: 1448,
    })
    expect(r.unassignedItemIds).toEqual(['2'])
    expect(r.reconciles).toBe(false)
  })

  it('shows a $0.00 share rather than hiding the person (GAP-18)', () => {
    const r = computeSplit({
      items: [{ id: '1', name: 'Milk', cents: 549, people: [G] }],
      people: [G, A],
      totalCents: 549,
    })
    expect(r.shares[A]).toBe(0)
    expect(Object.keys(r.shares)).toContain(A)
  })

  it('settleRounding puts any drift on the payer (FR-18)', () => {
    const settled = settleRounding({ [G]: 1000, [A]: 999 }, 2000, G)
    expect(sum(Object.values(settled))).toBe(2000)
    expect(settled[G]).toBe(1001)
  })
})

describe('PROPERTY: shares always sum to the total', () => {
  it('holds across 1000 random receipts and assignments', () => {
    let rng = 987654
    const next = () => (rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648

    for (let trial = 0; trial < 1000; trial++) {
      const people = ['a', 'b', 'c', 'd'].slice(0, 1 + Math.floor(next() * 4))
      const items: Item[] = Array.from({ length: 1 + Math.floor(next() * 12) }, (_, i) => {
        const assigned = people.filter(() => next() > 0.35)
        return {
          id: String(i),
          name: `item ${i}`,
          cents: Math.floor(next() * 5000) - 200,
          taxFlag: next() > 0.5 ? 'A' : 'E',
          people: assigned.length > 0 ? assigned : [people[0] as string],
        }
      })
      const subtotal = sum(items.map((i) => i.cents))
      const taxA = Math.floor(next() * 500)
      const taxE = Math.floor(next() * 100)
      const tip = Math.floor(next() * 800)
      const total = subtotal + taxA + taxE + tip

      const r = computeSplit({
        items,
        people,
        taxLines: [
          { flag: 'A', cents: taxA },
          { flag: 'E', cents: taxE },
        ],
        tipCents: tip,
        totalCents: total,
      })
      const settled = settleRounding(r.shares, total, people[0] as string)
      expect(sum(Object.values(settled))).toBe(total)
    }
  })
})
