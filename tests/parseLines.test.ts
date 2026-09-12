import { describe, it, expect } from 'vitest'
import { parseLines } from '@/lib/receipt'

/** Verbatim OCR.space output for the Costco fixture — tabs and all. */
const OCR_TEXT = [
  'COSTCO WHOLESALE\t',
  'Tempe #436\t',
  '1445 W Elliot, Tempe AZ\t',
  '512599 KS TOWEL\t20.79 A\t',
  '6262016 KS BATH\t20.99 A\t',
  '1644153 HVST SNAPS\t8.59 E\t',
  '389361\t/ SNAPS\t3.00-E\t',
  '1938066 FLASHLIGHT\t26.99 A\t',
  '1943119 BUILT VRTY\t19.99 E\t',
  '782796 KSWTR40PK\t3.99 E\t',
  '782796\tKSWTR40PK\t3.99 E\t',
  'SUBTOTAL\t102.33\t',
  'TAX\t6.17\t',
  'TOTAL\t108.50\t',
  'A 8.1% TAX\t5.57\t',
  'E 1.8% TAX\t0.60\t',
  'TOTAL TAX\t6.17\t',
  'ITEMS SOLD = 7\t',
  'INSTANT SAVINGS\t$3.00\t',
  '09/04/2026 17:55',
].join('\n')

describe('parseLines — the fallback rung must actually work', () => {
  const r = parseLines(OCR_TEXT)

  it('finds all eight item lines', () => {
    expect(r.items).toHaveLength(8)
  })

  it('reads prices correctly', () => {
    expect(r.items.map((i) => i.cents)).toEqual([2079, 2099, 859, -300, 2699, 1999, 399, 399])
  })

  it('captures the tax flag printed beside each line', () => {
    expect(r.items.map((i) => i.taxFlag)).toEqual(['A', 'A', 'E', 'E', 'A', 'E', 'E', 'E'])
  })

  it('reads the negative discount line as negative', () => {
    const discount = r.items.find((i) => i.cents < 0)
    expect(discount?.cents).toBe(-300)
  })

  it('separates the two tax rates', () => {
    expect(r.taxLines).toEqual([
      { flag: 'A', cents: 557 },
      { flag: 'E', cents: 60 },
    ])
  })

  it('reads the totals', () => {
    expect(r.subtotalCents).toBe(10233)
    expect(r.totalCents).toBe(10850)
    expect(r.taxCents).toBe(617)
  })

  it('reads merchant and date', () => {
    expect(r.merchant).toMatch(/COSTCO/i)
    expect(r.date).toBe('2026-09-04')
  })

  it('items sum to the printed subtotal', () => {
    expect(r.items.reduce((a, i) => a + i.cents, 0)).toBe(r.subtotalCents)
  })

  it('skips payment plumbing rather than treating it as an item', () => {
    const noise = parseLines(
      ['Coffee\t4.50\t', 'VISA\t108.50\t', 'CHANGE\t0.00\t', 'CHIP Read\t'].join('\n'),
    )
    expect(noise.items.map((i) => i.name)).toEqual(['Coffee'])
  })

  it('handles space-separated receipts too', () => {
    const spaced = parseLines(['Milk        5.49', 'TOTAL       5.49'].join('\n'))
    expect(spaced.items).toHaveLength(1)
    expect(spaced.items[0]?.cents).toBe(549)
    expect(spaced.totalCents).toBe(549)
  })

  it('never throws on junk', () => {
    for (const junk of ['', '\n\n\n', '!!!', 'aaa\tbbb\tccc']) {
      expect(() => parseLines(junk)).not.toThrow()
    }
  })
})
