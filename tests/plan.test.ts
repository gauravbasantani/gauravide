import { describe, expect, it } from 'vitest'
import { netBalances, planSplit, suggestTransfers, type Item } from '@/lib/split'
import { sum } from '@/lib/money'
import { splitQuantityIntoItems, unitCount, withItemIds } from '@/lib/receipt'

const A = 'a'
const B = 'b'
const C = 'c'
const D = 'd'
const E = 'e'

const ok = (plan: ReturnType<typeof planSplit>) => {
  if (!plan.ok) throw new Error('expected a valid plan, got ' + plan.problem)
  return plan
}

describe('by item', () => {
  it('a payer who took nothing is still on the expense (review finding 2)', () => {
    const plan = ok(
      planSplit({
        mode: 'items',
        items: [
          { id: 'x', name: 'Pasta', cents: 2000, people: [B] },
          { id: 'y', name: 'Salad', cents: 1000, people: [C] },
        ],
        people: [A, B, C],
        totalCents: 3000,
        payers: [{ personId: A, cents: 3000 }],
      }),
    )
    expect(plan.participants).toEqual([A, B, C])
    expect(plan.paid).toMatchObject({ a: 3000, b: 0, c: 0 })
    expect(plan.owed).toMatchObject({ a: 0, b: 2000, c: 1000 })
  })

  it('refuses a payer who is not in the split', () => {
    const plan = planSplit({
      mode: 'items',
      items: [{ id: 'x', name: 'Pasta', cents: 2000, people: [B] }],
      people: [B],
      totalCents: 2000,
      payers: [{ personId: 'stranger', cents: 2000 }],
    })
    expect(plan).toMatchObject({ ok: false, problem: 'payer_not_in_split' })
  })

  it('still blocks a receipt whose items do not match the total', () => {
    const plan = planSplit({
      mode: 'items',
      items: [{ id: 'x', name: 'Milk', cents: 1000, people: [A] }],
      people: [A, B],
      totalCents: 10000,
      payers: [{ personId: A, cents: 10000 }],
    })
    expect(plan).toMatchObject({ ok: false, problem: 'items_mismatch', gap: 9000 })
  })

  it('five people, tomatoes split into units, two paid (the full scenario)', () => {
    const [bag1, bag2, bag3, bag4] = splitQuantityIntoItems({
      id: 'tom',
      name: 'Tomatoes',
      qty: 4,
      cents: 1200,
    })
    const items: Item[] = [
      { id: bag1!.id!, name: bag1!.name, cents: bag1!.cents, people: [A, B] },
      { id: bag2!.id!, name: bag2!.name, cents: bag2!.cents, people: [A, B] },
      { id: bag3!.id!, name: bag3!.name, cents: bag3!.cents, people: [C] },
      { id: bag4!.id!, name: bag4!.name, cents: bag4!.cents, people: [D] },
      { id: 'wine', name: 'Wine', cents: 2500, people: [A, B, C, D, E] },
    ]
    const plan = ok(
      planSplit({
        mode: 'items',
        items,
        people: [A, B, C, D, E],
        totalCents: 3700,
        payers: [
          { personId: A, cents: 2000 },
          { personId: E, cents: 1700 },
        ],
      }),
    )
    expect(plan.owed).toEqual({ a: 800, b: 800, c: 800, d: 800, e: 500 })
    expect(sum(Object.values(plan.owed))).toBe(3700)
    const net = netBalances(plan.owed, plan.paid)
    expect(net).toEqual({ a: 1200, b: -800, c: -800, d: -800, e: 1200 })
    expect(sum(Object.values(net))).toBe(0)
    expect(suggestTransfers(net)).toEqual([
      { from: B, to: A, cents: 800 },
      { from: C, to: A, cents: 400 },
      { from: C, to: E, cents: 400 },
      { from: D, to: E, cents: 800 },
    ])
  })
})

describe('equally', () => {
  it('splits the total across the people who are in, to the cent', () => {
    const plan = ok(
      planSplit({
        mode: 'equal',
        items: [],
        people: [A, B, C],
        totalCents: 1000,
        payers: [{ personId: A, cents: 1000 }],
      }),
    )
    expect(plan.owed).toEqual({ a: 334, b: 333, c: 333 })
  })

  it('leaves out anyone unticked, and a friend’s receipt can exclude you', () => {
    const plan = ok(
      planSplit({
        mode: 'equal',
        items: [],
        people: [A, B, C],
        included: [B, C],
        totalCents: 5000,
        payers: [{ personId: B, cents: 5000 }],
      }),
    )
    expect(plan.owed).toEqual({ a: 0, b: 2500, c: 2500 })
    expect(plan.participants).toEqual([B, C])
  })

  it('needs at least one person in', () => {
    expect(
      planSplit({
        mode: 'equal',
        items: [],
        people: [A],
        included: [],
        totalCents: 100,
        payers: [{ personId: A, cents: 100 }],
      }),
    ).toMatchObject({ ok: false, problem: 'nobody_included' })
  })
})

describe('by shares', () => {
  it('2 shares pays twice 1 share', () => {
    const plan = ok(
      planSplit({
        mode: 'shares',
        items: [],
        people: [A, B],
        weights: { a: 2, b: 1 },
        totalCents: 9000,
        payers: [{ personId: B, cents: 9000 }],
      }),
    )
    expect(plan.owed).toEqual({ a: 6000, b: 3000 })
  })

  it('refuses all-zero shares', () => {
    expect(
      planSplit({
        mode: 'shares',
        items: [],
        people: [A, B],
        weights: {},
        totalCents: 100,
        payers: [{ personId: A, cents: 100 }],
      }),
    ).toMatchObject({ ok: false, problem: 'no_shares' })
  })
})

describe('exact amounts', () => {
  it('must add up to the total exactly, and reports the gap', () => {
    expect(
      planSplit({
        mode: 'exact',
        items: [],
        people: [A, B],
        exact: { a: 1000, b: 500 },
        totalCents: 2000,
        payers: [{ personId: A, cents: 2000 }],
      }),
    ).toMatchObject({ ok: false, problem: 'exact_mismatch', gap: 500 })
  })
})

describe('several payers', () => {
  it('payments must cover the whole bill', () => {
    expect(
      planSplit({
        mode: 'equal',
        items: [],
        people: [A, B],
        totalCents: 2000,
        payers: [
          { personId: A, cents: 1000 },
          { personId: B, cents: 500 },
        ],
      }),
    ).toMatchObject({ ok: false, problem: 'payers_mismatch', gap: 500 })
  })

  it('nobody paid is a problem, not a silent zero', () => {
    expect(
      planSplit({ mode: 'equal', items: [], people: [A], totalCents: 100, payers: [] }),
    ).toMatchObject({ ok: false, problem: 'no_payer' })
  })
})

describe('item identity (review finding 1)', () => {
  it('ids survive removing a row, so assignments stay on the right item', () => {
    let n = 0
    const receipt = withItemIds(
      {
        merchant: null,
        date: null,
        currency: 'USD',
        items: [
          { name: 'Steak', qty: 1, cents: 3000 },
          { name: 'Salad', qty: 1, cents: 1000 },
        ],
        taxLines: [],
        subtotalCents: null,
        taxCents: 0,
        tipCents: 0,
        feeCents: 0,
        totalCents: null,
      },
      () => 'id' + ++n,
    )
    const assignments = { id1: [A], id2: [B] }
    const afterRemoving = receipt.items.filter((item) => item.name !== 'Steak')
    expect(afterRemoving[0]?.id).toBe('id2')
    expect(assignments[afterRemoving[0]!.id as 'id2']).toEqual([B])
  })

  it('weights are not units', () => {
    expect(unitCount({ qty: 2.5 })).toBe(1)
    expect(unitCount({ qty: 1 })).toBe(1)
    expect(unitCount({ qty: 4 })).toBe(4)
    expect(unitCount({ qty: 500 })).toBe(1)
  })
})
