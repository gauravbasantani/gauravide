import { describe, expect, it } from 'vitest'
import { MAX_ITEMS, parseReceiptJson } from '@/lib/receipt'

const receipt = (items: unknown[]) => ({
  merchant: 'Costco',
  date: '2026-01-04',
  currency: 'USD',
  items,
  taxLines: [],
  subtotalCents: 1000,
  taxCents: 0,
  tipCents: 0,
  feeCents: 0,
  totalCents: 1000,
})

const item = (n: number) => ({ name: `Item ${n}`, qty: 1, cents: 100 })

describe('parseReceiptJson', () => {
  it('keeps every line of a long multi-page receipt', () => {
    const many = Array.from({ length: 320 }, (_, i) => item(i))
    expect(parseReceiptJson(JSON.stringify(receipt(many))).items).toHaveLength(320)
  })

  it('reads JSON wrapped in a markdown fence', () => {
    const text = '```json\n' + JSON.stringify(receipt([item(1)])) + '\n```'
    expect(parseReceiptJson(text).items).toHaveLength(1)
  })

  it('keeps the good lines when one item is malformed', () => {
    const parsed = parseReceiptJson(
      JSON.stringify(receipt([item(1), { name: 'Broken', qty: 1, cents: 'lots' }, item(3)])),
    )
    expect(parsed.items.map((i) => i.name)).toEqual(['Item 1', 'Item 3'])
    expect(parsed.merchant).toBe('Costco')
  })

  it('clamps an absurd item count rather than losing the receipt', () => {
    const many = Array.from({ length: MAX_ITEMS + 40 }, (_, i) => item(i))
    expect(parseReceiptJson(JSON.stringify(receipt(many))).items).toHaveLength(MAX_ITEMS)
  })

  it('keeps items on a receipt that prints no tax letters', () => {
    // The prompt offers "taxFlag": string|null, and .optional() rejects null —
    // so a simple cafe receipt used to lose every line while reading its
    // total perfectly. Caught by a live run against the real reader.
    const parsed = parseReceiptJson(
      JSON.stringify(
        receipt([
          { name: 'Latte', qty: 1, cents: 450, taxFlag: null, confidence: 0.99 },
          { name: 'Croissant', qty: null, cents: 325, taxFlag: null, confidence: null },
        ]),
      ),
    )
    expect(parsed.items).toHaveLength(2)
    expect(parsed.items[0]?.taxFlag).toBeUndefined()
    expect(parsed.items[1]?.qty).toBe(1)
  })

  it('accepts nulls and whole-number floats in the totals', () => {
    const parsed = parseReceiptJson(
      JSON.stringify({
        ...receipt([item(1)]),
        currency: null,
        taxLines: null,
        tipCents: null,
        feeCents: null,
        taxCents: 105.0,
        totalCents: 1630.0,
      }),
    )
    expect(parsed).toMatchObject({ currency: 'USD', taxLines: [], tipCents: 0, feeCents: 0 })
    expect(parsed.taxCents).toBe(105)
    expect(parsed.totalCents).toBe(1630)
  })

  it('rejects output that was cut off mid-item', () => {
    const truncated = JSON.stringify(receipt([item(1), item(2)])).slice(0, -30)
    expect(() => parseReceiptJson(truncated)).toThrow()
  })
})
