/**
 * Receipts from outside the United States.
 *
 * The backup reader gets flat text with no metadata, so everything — which
 * currency, which day, which line is tax — has to be read off the words the
 * receipt prints. Getting the currency wrong files a £20 expense as $20, and
 * getting the date order wrong produced "2026-14-09", a month of fourteen
 * that still passed validation.
 */
import { describe, expect, it } from 'vitest'
import { parseLines } from '@/lib/receipt'
import { formatMoney } from '@/lib/money'

const receipt = (lines: string[]) => parseLines(lines.join('\n'))

describe('reading a receipt from another country', () => {
  it('reads a British receipt: pounds, day first, VAT', () => {
    const r = receipt(['TESCO EXTRA', '14/09/2026', 'Milk 2 Pint\t£1.35', 'Bread\t£1.10', 'VAT\t£0.41', 'TOTAL\t£2.86'])
    expect(r.currency).toBe('GBP')
    expect(r.date).toBe('2026-09-14')
    expect(r.taxCents).toBe(41)
    expect(r.totalCents).toBe(286)
    expect(r.items.map((i) => i.name)).toEqual(['Milk 2 Pint', 'Bread'])
  })

  it('reads a Finnish receipt: euros after the number, dot dates, ALV', () => {
    const r = receipt(['K-MARKET', '14.09.2026', 'Maito\t1,35 €', 'Leipä\t2,49 €', 'ALV 14%\t0,47 €', 'YHTEENSÄ\t3,84 €'])
    expect(r.currency).toBe('EUR')
    expect(r.date).toBe('2026-09-14')
    expect(r.taxCents).toBe(47)
    expect(r.totalCents).toBe(384)
    // A decimal comma is a decimal, not a thousands separator.
    expect(r.items.map((i) => i.cents)).toEqual([135, 249])
  })

  it('reads a Canadian receipt: dollars, but GST means it is not American', () => {
    const r = receipt(['LOBLAWS', '14/09/2026', 'Milk\t$4.99', 'Bread\t$3.49', 'GST\t$0.42', 'TOTAL\t$8.90'])
    expect(r.currency).toBe('CAD')
    expect(r.date).toBe('2026-09-14')
    expect(r.taxCents).toBe(42)
    expect(r.items).toHaveLength(2) // GST is tax, not something anyone ate
  })

  it('still reads an American receipt as dollars, month first', () => {
    const r = receipt(['COSTCO', '09/14/2026', 'KS TOWEL\t20.79 A', 'SUBTOTAL\t20.79', 'TAX\t1.68', 'TOTAL\t22.47'])
    expect(r.currency).toBe('USD')
    expect(r.date).toBe('2026-09-14')
    expect(r.subtotalCents).toBe(2079)
    expect(r.totalCents).toBe(2247)
  })

  it('reads German, French and Swedish tax words and totals', () => {
    expect(receipt(['REWE', 'Brot\t2,49 €', 'MWST 7%\t0,17 €', 'GESAMT\t2,66 €'])).toMatchObject({
      currency: 'EUR',
      taxCents: 17,
      totalCents: 266,
    })
    expect(receipt(['CARREFOUR', 'Pain\t2,49 €', 'TVA 5,5%\t0,14 €', 'TOTAL\t2,63 €'])).toMatchObject({
      currency: 'EUR',
      totalCents: 263,
    })
    expect(receipt(['ICA', 'Mjölk\t15,90 kr', 'MOMS 12%\t1,70 kr', 'SUMMA\t17,60 kr'])).toMatchObject({
      currency: 'SEK',
      totalCents: 1760,
    })
  })

  it('reads Finnish keywords whether or not OCR kept the umlauts', () => {
    const withAccents = receipt(['K-MARKET', 'Maito\t1,35 €', 'VÄLISUMMA\t1,35 €', 'YHTEENSÄ\t1,35 €'])
    const stripped = receipt(['K-MARKET', 'Maito\t1,35 €', 'VALISUMMA\t1,35 €', 'YHTEENSA\t1,35 €'])
    for (const r of [withAccents, stripped]) {
      expect(r.totalCents).toBe(135)
      expect(r.subtotalCents).toBe(135)
      expect(r.items).toHaveLength(1)
    }
  })

  it('never invents an impossible date', () => {
    // 14 cannot be a month, whichever country printed it.
    expect(receipt(['SHOP', '14/09/2026', 'Thing\t1.00'])?.date).toBe('2026-09-14')
    expect(receipt(['SHOP', '99/99/2026', 'Thing\t1.00'])?.date).toBeNull()
    expect(receipt(['SHOP', '2026-09-14', 'Thing\t1.00'])?.date).toBe('2026-09-14')
  })

  it('prefers an explicit ISO code over any symbol', () => {
    expect(receipt(['DUTY FREE', 'Total in CAD', 'Thing\t$5.00'])?.currency).toBe('CAD')
  })

  it('formats each currency the way its readers write it', () => {
    expect(formatMoney(1235, 'GBP')).toBe('£12.35')
    expect(formatMoney(1235, 'USD')).toBe('$12.35')
    expect(formatMoney(1235, 'EUR')).toMatch(/12,35\s*€/)
    expect(formatMoney(1235, 'CAD')).toBe('$12.35')
    // A malformed code from a model must never throw.
    expect(formatMoney(1235, 'nonsense')).toBe('$12.35')
  })
})
