/**
 * Money — integer cents only (ACC-2).
 *
 * This module imports nothing. No React, no Next, no network. It is the one
 * place arithmetic on money happens, so it can be tested exhaustively in
 * milliseconds (ARCHITECTURE.md §3.3).
 *
 * Floats are never used: 0.1 + 0.2 !== 0.3, and a receipt that fails to
 * balance by a cent is refused at submit (ACC-3).
 */

export type Cents = number

/** A parsed money value, or a reason it could not be parsed. */
export type ParseResult = { ok: true; cents: Cents } | { ok: false; reason: string }

/**
 * Parse a money string to integer cents.
 *
 * Handles both conventions, because getting this wrong is a 100x error
 * (GAP-16): "1,234.56" is US, "1.234,56" is European. The separator that
 * appears LAST is the decimal separator.
 */
export function parseMoney(input: string): ParseResult {
  const raw = input.trim()
  if (raw === '') return { ok: false, reason: 'empty' }

  // Costco prints negatives as a trailing minus: "3.00-"
  const negative = /^-/.test(raw) || /-\s*$/.test(raw)
  let s = raw.replace(/[^0-9.,]/g, '')
  if (s === '') return { ok: false, reason: 'no digits' }

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')

  if (lastComma !== -1 && lastDot !== -1) {
    // Both present: the later one is the decimal separator.
    const decimalIsComma = lastComma > lastDot
    s = decimalIsComma ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma !== -1) {
    // Only commas. Two trailing digits means a decimal comma; otherwise grouping.
    const after = s.length - lastComma - 1
    s = after === 2 ? s.replace(',', '.') : s.replace(/,/g, '')
  }

  if (!/^\d*\.?\d*$/.test(s)) return { ok: false, reason: 'malformed' }

  const [whole = '0', frac = ''] = s.split('.')
  if (frac.length > 2) return { ok: false, reason: 'too many decimal places' }

  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  if (!Number.isFinite(cents)) return { ok: false, reason: 'not a number' }

  return { ok: true, cents: negative ? -cents : cents }
}

/**
 * Where each currency is written the way its readers expect.
 *
 * Formatting euros in en-US gives "€12.35"; a Finnish reader writes
 * "12,35 €". The mapping is fixed rather than taken from the browser, so the
 * server and the client always render a price identically — a locale that
 * differs between them tears React's hydration apart.
 */
/**
 * Currencies with no minor unit, which this app cannot represent.
 *
 * Every amount here is an integer of hundredths. In yen there are no
 * hundredths, so 1235 would render as "¥12" — a wrong number shown with
 * total confidence. Better to not offer a currency than to misreport it.
 */
export const UNSUPPORTED_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF'])

const CURRENCY_LOCALE: Record<string, string> = {
  EUR: 'de-DE',
  GBP: 'en-GB',
  CAD: 'en-CA',
  AUD: 'en-AU',
  NZD: 'en-NZ',
  CHF: 'de-CH',
  SEK: 'sv-SE',
  NOK: 'nb-NO',
  DKK: 'da-DK',
  PLN: 'pl-PL',
  CZK: 'cs-CZ',
  INR: 'en-IN',
  MXN: 'es-MX',
  ZAR: 'en-ZA',
  SGD: 'en-SG',
  HKD: 'en-HK',
}

/**
 * Format cents for display. Always shows a currency symbol (UX-21).
 *
 * An unknown or malformed currency code must never throw: Intl rejects
 * anything that is not three letters, and the code can come from a model.
 */
export function formatMoney(cents: Cents, currency = 'USD', locale?: string): string {
  const code = /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : 'USD'
  const where = locale ?? CURRENCY_LOCALE[code] ?? 'en-US'
  try {
    return new Intl.NumberFormat(where, { style: 'currency', currency: code }).format(cents / 100)
  } catch {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
  }
}

export function sum(values: readonly Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0)
}

/**
 * Split `total` across `weights` so the parts sum to `total` EXACTLY.
 *
 * Largest-remainder: give everyone their floor, then hand the leftover cents
 * to whoever was rounded down hardest. Ties break by index, so the same input
 * always produces the same output (ACC-9).
 *
 * Splitwise rejects an expense whose shares do not sum to the cost, so this
 * guarantee is not a nicety — it is the difference between submitting and not.
 */
export function allocate(total: Cents, weights: readonly number[]): Cents[] {
  const n = weights.length
  if (n === 0) return []

  const weightTotal = weights.reduce((a, b) => a + b, 0)

  // No weight to go on (e.g. a $0 subtotal): split as evenly as possible.
  if (weightTotal <= 0) return allocate(total, new Array<number>(n).fill(1))

  const exact = weights.map((w) => (total * w) / weightTotal)
  const floors = exact.map((v) => Math.floor(v))
  let remainder = total - floors.reduce((a, b) => a + b, 0)

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)

  const out = [...floors]
  // `remainder` can be negative when `total` is (a refund); step toward zero.
  const step = remainder >= 0 ? 1 : -1
  for (let k = 0; remainder !== 0; k++) {
    const target = order[k % n]
    if (!target) break
    out[target.i] = (out[target.i] ?? 0) + step
    remainder -= step
  }

  return out
}

/**
 * The currencies offered in the review step.
 *
 * Detection reads what the receipt prints, but a dollar sign is shared by a
 * dozen countries and no reader can be certain. One tap must be enough to
 * correct it, because the choice reaches Splitwise and cannot be fixed from
 * inside this app afterwards.
 */
export const CURRENCIES = [
  'USD',
  'CAD',
  'EUR',
  'GBP',
  'AUD',
  'NZD',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'CZK',
  'INR',
  'SGD',
  'HKD',
  'MXN',
  'ZAR',
] as const

/** "GBP — £ British Pound", for a picker that means something to a human. */
export function currencyLabel(code: string, locale = 'en-US'): string {
  const name = new Intl.DisplayNames([locale], { type: 'currency' }).of(code) ?? code
  const symbol = formatMoney(0, code).replace(/[\d.,\s\u00a0]/g, '')
  return symbol && symbol !== code ? `${code} — ${symbol} ${name}` : `${code} — ${name}`
}
