import { describe, expect, it } from 'vitest'
import { netBalances, planSplit, suggestTransfers, type Item } from '@/lib/split'
import { sum } from '@/lib/money'
import { draftFromSplit, type StoredSplit } from '@/lib/history'
import { buildPlan, effectiveAssignments, payersFor } from '@/components/flow/plan'
import {
  cleanItemName,
  discountParents,
  splitQuantityIntoItems,
  tidyReceipt,
  unitCount,
  withItemIds,
} from '@/lib/receipt'

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

describe('splitting one item unevenly (FR-32)', () => {
  it('by shares: 2 : 1 on a taxed line, and its tax follows the same weights', () => {
    const plan = ok(
      planSplit({
        mode: 'items',
        items: [
          {
            id: 'wine',
            name: 'Wine',
            cents: 3000,
            taxFlag: 'A',
            people: [A, B],
            split: { kind: 'shares', values: { a: 2, b: 1 } },
          },
        ],
        people: [A, B],
        taxLines: [{ flag: 'A', cents: 300 }],
        totalCents: 3300,
        payers: [{ personId: A, cents: 3300 }],
      }),
    )
    expect(plan.owed).toEqual({ a: 2200, b: 1100 })
  })

  it('exact amounts must add up to the item price', () => {
    const base = {
      mode: 'items' as const,
      people: [A, B],
      totalCents: 1000,
      payers: [{ personId: A, cents: 1000 }],
    }
    const item = { id: 'cake', name: 'Cake', cents: 1000, people: [A, B] }
    expect(
      planSplit({ ...base, items: [{ ...item, split: { kind: 'exact', values: { a: 700, b: 200 } } }] }),
    ).toMatchObject({ ok: false, problem: 'item_exact_mismatch', gap: 100 })
    const good = ok(
      planSplit({ ...base, items: [{ ...item, split: { kind: 'exact', values: { a: 700, b: 300 } } }] }),
    )
    expect(good.owed).toEqual({ a: 700, b: 300 })
  })
})

describe('readable item names', () => {
  it('strips register numbers and decoration, keeps real names', () => {
    expect(cleanItemName('512599 **KS TOWEL**')).toBe('KS TOWEL')
    expect(cleanItemName('0000389361 / SNAPS')).toBe('SNAPS')
    expect(cleanItemName('Pad Thai')).toBe('Pad Thai')
    expect(cleanItemName('7UP')).toBe('7UP')
  })

  it('labels a bare negative line as a discount', () => {
    const tidy = tidyReceipt({
      merchant: null,
      date: null,
      currency: 'USD',
      items: [
        { name: '0000389361 / SNAPS', qty: 1, cents: -300 },
        { name: 'INSTANT SAVINGS', qty: 1, cents: -100 },
      ],
      taxLines: [],
      subtotalCents: null,
      taxCents: 0,
      tipCents: 0,
      feeCents: 0,
      totalCents: null,
    })
    expect(tidy.items.map((i) => i.name)).toEqual(['Discount · SNAPS', 'INSTANT SAVINGS'])
  })
})

describe('reopening a saved split to edit it (FR-39)', () => {
  const saved = {
    id: '0b7f9a52-3c1d-4e8f-9a6b-2c3d4e5f6a7b',
    owner_id: '101',
    expense_ids: ['555'],
    image_path: null,
    archived_at: null,
    created_at: '2026-09-12T00:00:00Z',
    data: {
      merchant: 'Trader Joe’s',
      date: '2026-09-12',
      currency: 'USD',
      totalCents: 3700,
      taxCents: 0,
      tipCents: 0,
      feeCents: 0,
      items: [
        { name: 'Tomatoes', cents: 1200, people: [101, 202] },
        {
          name: 'Wine',
          cents: 2500,
          people: [101, 202, 303],
          split: { kind: 'shares' as const, values: { '101': 2, '202': 1, '303': 1 } },
        },
      ],
      people: [
        { id: 101, name: 'Gaurav' },
        { id: 202, name: 'Alex' },
        { id: 303, name: 'Maya' },
      ],
      payerId: 101,
      groupId: 9,
      groupName: 'Apartment',
      status: 'in_splitwise' as const,
      mode: 'items' as const,
      owed: { '101': 1850, '202': 1225, '303': 625 },
      paid: { '101': 2000, '303': 1700 },
    },
  } satisfies StoredSplit

  it('rebuilds a draft that recomputes to exactly what was sent', () => {
    let n = 0
    const draft = draftFromSplit(saved, () => 'id' + ++n)
    expect(draft.editing).toEqual({
      splitId: saved.id,
      expenseId: 555,
      merchant: 'Trader Joe’s',
      groupId: 9,
    })
    expect(draft.settings.payers).toEqual([
      { personId: '101', cents: 2000 },
      { personId: '303', cents: 1700 },
    ])
    const plan = ok(
      buildPlan(
        draft.receipt,
        draft.people,
        draft.assignments,
        draft.settings,
        payersFor(draft.settings, draft.payerId, draft.people, 3700),
      ),
    )
    expect(plan.owed).toEqual(saved.data.owed)
    expect(plan.paid).toMatchObject(saved.data.paid)
  })

  it('an older equal split without stored settings reopens as exact amounts', () => {
    const legacy = {
      ...saved,
      data: { ...saved.data, mode: 'equal' as const, owed: { '101': 1234, '202': 1233, '303': 1233 } },
    }
    const draft = draftFromSplit(legacy, () => crypto.randomUUID())
    expect(draft.settings.mode).toBe('exact')
    expect(draft.settings.exact).toEqual(legacy.data.owed)
  })
})

describe('a discount follows the item it discounts (FR-42)', () => {
  const receipt = {
    merchant: 'Costco',
    date: null,
    currency: 'USD',
    items: [
      { id: 'towel', name: 'KS TOWEL', qty: 1, cents: 2079 },
      { id: 'snaps', name: 'HVST SNAPS', qty: 1, cents: 859 },
      { id: 'disc', name: 'Discount · SNAPS', qty: 1, cents: -300 },
    ],
    taxLines: [],
    subtotalCents: null,
    taxCents: 0,
    tipCents: 0,
    feeCents: 0,
    totalCents: 2638,
  }
  const people = [
    { id: 'g', name: 'Gaurav' },
    { id: 'm', name: 'Mayur' },
  ]
  const settings = {
    mode: 'items' as const,
    included: null,
    weights: {},
    exact: {},
    payers: null,
    itemSplits: {},
  }

  it('matches by name, else the line directly above', () => {
    expect(
      discountParents([
        { key: 'a', name: 'HVST SNAPS', cents: 859 },
        { key: 'b', name: 'WATER', cents: 399 },
        { key: 'c', name: 'Discount · SNAPS', cents: -300 },
        // Directly under another discount, with no item to name: not guessed.
        { key: 'd', name: 'INSTANT SAVINGS', cents: -100 },
        { key: 'e', name: 'MILK', cents: 499 },
        // Generic coupon directly under an item: that item.
        { key: 'f', name: 'COUPON', cents: -50 },
      ]),
    ).toEqual({ c: 'a', f: 'e' })
  })

  it('Mayur had the snaps, so Mayur gets the snaps discount', () => {
    const plan = ok(
      buildPlan(receipt, people, { towel: ['g'], snaps: ['m'] }, settings, [
        { personId: 'g', cents: 2638 },
      ]),
    )
    expect(plan.owed).toEqual({ g: 2079, m: 559 })
  })

  it('an explicit assignment on the discount wins', () => {
    const plan = ok(
      buildPlan(receipt, people, { towel: ['g'], snaps: ['m'], disc: ['g'] }, settings, [
        { personId: 'g', cents: 2638 },
      ]),
    )
    expect(plan.owed).toEqual({ g: 1779, m: 859 })
  })

  it('follows an uneven split in the same proportions', () => {
    const effective = effectiveAssignments(receipt, { snaps: ['g', 'm'] }, {
      snaps: { kind: 'exact', values: { g: 659, m: 200 } },
    })
    expect(effective.follows).toEqual({ disc: 'snaps' })
    expect(effective.itemSplits.disc).toEqual({ kind: 'shares', values: { g: 659, m: 200 } })
  })
})

describe('editing keeps a discount following its item (FR-42 + FR-39)', () => {
  it('reopens a saved discount as following, and moving the item moves the discount', () => {
    const saved = {
      id: '0b7f9a52-3c1d-4e8f-9a6b-2c3d4e5f6a7c',
      owner_id: '101',
      expense_ids: ['556'],
      image_path: null,
      archived_at: null,
      created_at: '2026-09-12T00:00:00Z',
      data: {
        merchant: 'Costco',
        date: null,
        currency: 'USD',
        totalCents: 2638,
        taxCents: 0,
        tipCents: 0,
        feeCents: 0,
        items: [
          { name: 'KS TOWEL', cents: 2079, people: [101] },
          { name: 'HVST SNAPS', cents: 859, people: [202] },
          { name: 'Discount · SNAPS', cents: -300, people: [202] },
        ],
        people: [
          { id: 101, name: 'Gaurav' },
          { id: 202, name: 'Mayur' },
        ],
        payerId: 101,
        groupId: 0,
        groupName: 'No group',
        status: 'in_splitwise' as const,
        mode: 'items' as const,
        owed: { '101': 2079, '202': 559 },
        paid: { '101': 2638 },
      },
    } satisfies StoredSplit

    const ids = ['towel', 'snaps', 'disc', 'key']
    const draft = draftFromSplit(saved, () => ids.shift() ?? 'x')
    expect(draft.assignments.disc).toEqual([])
    const payers = payersFor(draft.settings, draft.payerId, draft.people, 2638)
    expect(ok(buildPlan(draft.receipt, draft.people, draft.assignments, draft.settings, payers)).owed).toEqual(
      saved.data.owed,
    )

    // Give the snaps to Gaurav instead: the discount must go with them.
    const moved = { ...draft.assignments, snaps: ['101'] }
    expect(ok(buildPlan(draft.receipt, draft.people, moved, draft.settings, payers)).owed).toEqual({
      '101': 2638,
      '202': 0,
    })
  })
})
