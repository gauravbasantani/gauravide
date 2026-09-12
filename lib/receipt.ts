/**
 * Receipt extraction — the provider ladder (plan.md §6c, A1–A3).
 *
 *   Gemini ──quota/error──▶ OCR.space ──quota/error──▶ manual entry
 *
 * The vision API is the only layer of this stack that can genuinely go down:
 * its free quota is per-project, so one busy day could stop extraction for
 * everyone. Hence a ladder rather than a fallback. A user is never blocked
 * from splitting a bill.
 *
 * Model output is untrusted input (ARCHITECTURE.md P3): it is a network
 * response from a system that can hallucinate, so it is Zod-validated and
 * sanity-checked before it reaches any arithmetic.
 */
import { z } from 'zod'

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash'

/* ─────────────────────────── Schema ─────────────────────────── */

export const ExtractedItem = z.object({
  /**
   * Stable client-side identity. Assignments are keyed by this, never by row
   * position — removing or splitting a row must not move people onto the
   * wrong item (GAP-24).
   */
  id: z.string().max(80).optional(),
  name: z.string().min(1).max(120),
  qty: z.number().finite().min(0).max(999).default(1),
  /** Line total in cents, already multiplied by qty. Negative for discounts. */
  cents: z.number().int().min(-1_000_000).max(10_000_000),
  /** The letter printed beside the line, e.g. Costco's A / E. */
  taxFlag: z.string().max(3).optional(),
  confidence: z.number().min(0).max(1).optional(),
})

export const ExtractedReceipt = z.object({
  merchant: z.string().max(120).nullable(),
  /** ISO date from the receipt itself, never today's date (GAP-11). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  currency: z.string().length(3).default('USD'),
  items: z.array(ExtractedItem).max(200),
  taxLines: z
    .array(z.object({ flag: z.string().max(3), cents: z.number().int() }))
    .max(10)
    .default([]),
  subtotalCents: z.number().int().nullable(),
  taxCents: z.number().int().default(0),
  tipCents: z.number().int().default(0),
  feeCents: z.number().int().default(0),
  totalCents: z.number().int().nullable(),
})

export type ExtractedReceipt = z.infer<typeof ExtractedReceipt>
export type ExtractedItem = z.infer<typeof ExtractedItem>

/**
 * Turn a quantity line into individually assignable units without losing or
 * inventing a cent. This is for cases such as four identical tomato bags
 * bought by different people.
 */
export function splitQuantityIntoItems(item: ExtractedItem): ExtractedItem[] {
  const quantity = unitCount(item)
  if (quantity < 2) return [item]

  const sign = item.cents < 0 ? -1 : 1
  const absolute = Math.abs(item.cents)
  const base = Math.floor(absolute / quantity)
  const remainder = absolute % quantity

  return Array.from({ length: quantity }, (_, index) => ({
    ...item,
    ...(item.id ? { id: item.id + ':' + (index + 1) } : {}),
    name: item.name + ' (' + (index + 1) + ' of ' + quantity + ')',
    qty: 1,
    cents: sign * (base + (index < remainder ? 1 : 0)),
  }))
}

/** The most units one line may become — beyond this it is a weight, not a count. */
export const MAX_UNITS = 50

/**
 * How many separately assignable units a line holds. Weights and volumes
 * (2.5 lb) are not units and return 1 (FR-12d).
 */
export function unitCount(item: Pick<ExtractedItem, 'qty'>): number {
  return Number.isInteger(item.qty) && item.qty >= 2 && item.qty <= MAX_UNITS ? item.qty : 1
}

/** Give every item a stable id, keeping any it already has. */
export function withItemIds(receipt: ExtractedReceipt, makeId: () => string): ExtractedReceipt {
  return { ...receipt, items: receipt.items.map((item) => (item.id ? item : { ...item, id: makeId() })) }
}

/**
 * Register lines carry noise people don't recognise: "512599 **KS TOWEL**",
 * "0000389361 / SNAPS". Drop leading item numbers and decoration; keep the words.
 */
export function cleanItemName(name: string): string {
  const cleaned = name
    .replace(/^\s*\d{4,}\s*/, '')
    .replace(/^[\s/*#-]+/, '')
    .replace(/\*+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return cleaned || name.trim()
}

/** Make extracted lines readable before anyone sees them — these names go to Splitwise. */
export function tidyReceipt(receipt: ExtractedReceipt): ExtractedReceipt {
  return {
    ...receipt,
    items: receipt.items.map((item) => {
      const name = cleanItemName(item.name)
      const discount =
        item.cents < 0 && name !== '' && !/discount|saving|coupon|promo|\boff\b/i.test(name)
      return { ...item, name: (discount ? `Discount · ${name}` : name).slice(0, 120) }
    }),
  }
}

/** The id assignments are keyed by. Falls back to position for legacy rows. */
export const itemKey = (item: Pick<ExtractedItem, 'id'>, index: number): string =>
  item.id ?? String(index)

export type ExtractionSource = 'gemini' | 'ocrspace' | 'manual'

export type ExtractionResult = {
  source: ExtractionSource
  receipt: ExtractedReceipt
  /** Problems the user must look at before the numbers can be trusted. */
  warnings: string[]
  /** Raw OCR text, when we fell back and could only partly parse it. */
  rawText?: string
}

/* ─────────────────────────── Prompt ─────────────────────────── */

const PROMPT = `You are reading a photograph of a shop or restaurant receipt.

Return ONLY a JSON object, no prose, no markdown fence, matching exactly:

{
  "merchant": string|null,
  "date": "YYYY-MM-DD"|null,
  "currency": "USD",
  "items": [{ "name": string, "qty": number, "cents": integer, "taxFlag": string|null, "confidence": number }],
  "taxLines": [{ "flag": string, "cents": integer }],
  "subtotalCents": integer|null,
  "taxCents": integer,
  "tipCents": integer,
  "feeCents": integer,
  "totalCents": integer|null
}

Rules, in order of importance:

1. ALL money is INTEGER CENTS. $20.79 is 2079. Never a decimal.
2. Read the amounts EXACTLY as printed. Never calculate, correct, or balance
   anything. If the items do not sum to the subtotal, report what is printed
   and let a human resolve it.
3. DISCOUNTS AND COUPONS ARE NEGATIVE ITEMS. A line like "3.00-" or
   "INSTANT SAVINGS 3.00" is cents: -300. Never omit them.
4. TAX FLAGS MATTER. Many receipts print a letter beside each line (A, E, F,
   T, X...) marking which tax rate applies. Capture it in taxFlag, verbatim.
   If the receipt breaks tax down by rate (e.g. "A 8.1% TAX 5.57" and
   "E 1.8% TAX 0.60"), put each in taxLines with its flag and cents.
5. The DATE is the one printed on the receipt, not today.
6. DECIMAL SEPARATORS: if the receipt uses "1.234,56", the comma is the
   decimal separator. Read the format the receipt actually uses.
7. Use the RECEIPT's currency. Infer from the symbol or locale; default USD.
8. qty is how many units that LINE covers; cents is the line TOTAL for them.
9. confidence is 0..1 — your own certainty about that line. Be honest: mark
   anything smudged, cut off, or ambiguous below 0.7.
10. Omit tips unless printed. Do not invent a tip line.`

/* ────────────────────────── Providers ───────────────────────── */

class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Retry the primary provider before degrading.
 *
 * Gemini returns 503 "high demand" intermittently — a transient blip, not an
 * outage. Falling straight to OCR.space on one of those would trade a
 * structured extraction for raw text the user has to re-key, which is a much
 * worse outcome than waiting 400ms. Fight for the good rung first.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const retryable = err instanceof ProviderError && err.retryable
      if (!retryable || i === attempts - 1) throw err
      await sleep(400 * 2 ** i) // 400ms, 800ms
    }
  }
  throw lastError
}

async function callGemini(base64: string, mimeType: string): Promise<ExtractedReceipt> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new ProviderError('GEMINI_API_KEY not set', false)

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: base64 } }] },
        ],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    },
  )

  if (!res.ok) {
    // 429 = quota exhausted, 503 = "high demand" (common and transient),
    // other 5xx = their problem. All are worth retrying before degrading.
    const retryable = res.status === 429 || res.status >= 500
    throw new ProviderError(`gemini ${res.status}`, retryable)
  }

  const body: unknown = await res.json()
  const text = extractText(body)
  if (!text) throw new ProviderError('gemini returned no text', true)

  return ExtractedReceipt.parse(JSON.parse(stripFence(text)))
}

function extractText(body: unknown): string | null {
  const b = body as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  return b.candidates?.[0]?.content?.parts?.[0]?.text ?? null
}

function stripFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim()
}

/**
 * OCR.space returns raw text, not structured data. We do a best-effort line
 * parse so the user starts from a draft rather than a blank form — a degraded
 * rung on the ladder, deliberately, not a second full extractor.
 */
async function callOcrSpace(base64: string, mimeType: string): Promise<ExtractionResult> {
  const key = process.env.OCRSPACE_API_KEY
  if (!key) throw new ProviderError('OCRSPACE_API_KEY not set', false)

  const form = new URLSearchParams({
    base64Image: `data:${mimeType};base64,${base64}`,
    language: 'eng',
    isTable: 'true',
    OCREngine: '2',
    scale: 'true',
  })

  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  })
  if (!res.ok) throw new ProviderError(`ocrspace ${res.status}`, res.status >= 500)

  const body = (await res.json()) as {
    IsErroredOnProcessing?: boolean
    ErrorMessage?: string | string[]
    ParsedResults?: { ParsedText?: string }[]
  }
  if (body.IsErroredOnProcessing) {
    throw new ProviderError(String(body.ErrorMessage ?? 'ocrspace failed'), false)
  }

  const rawText = body.ParsedResults?.[0]?.ParsedText ?? ''
  return {
    source: 'ocrspace',
    receipt: parseLines(rawText),
    rawText,
    warnings: ['Scanned with the backup reader — please check every line carefully.'],
  }
}

/**
 * Turn raw OCR text into a draft receipt.
 *
 * This is the second rung of the provider ladder, and it has to actually
 * work — a fallback that returns nothing is decoration. OCR.space emits
 * tab-separated columns:
 *
 *   512599 KS TOWEL\t20.79 A\t
 *   SUBTOTAL\t102.33\t
 *   A 8.1% TAX\t5.57\t
 *
 * so we split on tabs (or runs of spaces), take the last field that looks
 * like money, and treat what precedes it as the label.
 */
const MONEY = /(-?\$?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*(-?)\s*([A-Z])?\s*$/

/** Lines that are payment plumbing, not things anyone ate. */
const NOT_AN_ITEM =
  /\b(CHANGE|CASH|VISA|MASTERCARD|AMEX|DEBIT|CREDIT|CARD|BALANCE|APPROVED|AUTH|CHIP|SEQ|AID|RESP|TEND(ER)?|ACCOUNT|MEMBER|ITEMS SOLD|TOTAL NUMBER)\b/i

export function parseLines(text: string): ExtractedReceipt {
  const items: ExtractedItem[] = []
  const taxLines: { flag: string; cents: number }[] = []
  let totalCents: number | null = null
  let subtotalCents: number | null = null
  let taxCents: number | null = null
  let merchant: string | null = null
  let date: string | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '')
    if (!line.trim()) continue

    // Merchant: the first meaningful line, before any prices appear.
    if (merchant === null && !MONEY.test(line) && /[A-Za-z]{3}/.test(line)) {
      merchant = line.split(/\t|\s{2,}/)[0]?.trim().slice(0, 120) ?? null
    }

    if (date === null) {
      const d = line.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/)
      if (d) date = `${d[3]}-${d[1]}-${d[2]}`
    }

    // Columns, then the last one that looks like money.
    const fields = line.split(/\t|\s{2,}/).map((f) => f.trim()).filter(Boolean)
    if (fields.length === 0) continue

    let amountField: string | null = null
    let amountIndex = -1
    for (let i = fields.length - 1; i >= 0; i--) {
      const field = fields[i]
      if (field && MONEY.test(field)) {
        amountField = field
        amountIndex = i
        break
      }
    }
    if (!amountField) continue

    const m = amountField.match(MONEY)
    if (!m) continue

    const cents = toCents(m[1] ?? '')
    if (cents === null) continue

    // Costco prints negatives as a trailing minus, sometimes before the flag.
    const negative = Boolean(m[2]) || /-\s*[A-Z]?\s*$/.test(amountField)
    const flag = m[3]
    const label = fields.slice(0, amountIndex).join(' ').trim()
    const key = label.toUpperCase()

    // Per-rate tax lines: "A 8.1% TAX  5.57"
    const rateTax = key.match(/^([A-Z])\s+[\d.]+%\s*TAX$/)
    if (rateTax?.[1]) {
      taxLines.push({ flag: rateTax[1], cents })
      continue
    }
    if (/^TOTAL TAX$/.test(key) || (/\bTAX\b/.test(key) && !/^[A-Z]\s/.test(key))) {
      taxCents = cents
      continue
    }
    if (/SUBTOTAL/.test(key)) {
      subtotalCents = cents
      continue
    }
    if (/\bTOTAL\b/.test(key) && !/SUB/.test(key)) {
      totalCents = cents
      continue
    }
    // "INSTANT SAVINGS  $3.00" is a discount already applied to a line above.
    if (/SAVINGS|DISCOUNT|COUPON/.test(key)) continue
    if (!label || NOT_AN_ITEM.test(key)) continue

    items.push({
      name: label.slice(0, 120),
      qty: 1,
      cents: negative ? -Math.abs(cents) : cents,
      ...(flag ? { taxFlag: flag } : {}),
      confidence: 0.55, // OCR text, not a structured read — flag for review
    })
  }

  // Prefer the per-rate breakdown; fall back to the single printed total.
  const summedTaxLines = taxLines.reduce((a, t) => a + t.cents, 0)

  return ExtractedReceipt.parse({
    merchant,
    date,
    currency: 'USD',
    items,
    taxLines,
    subtotalCents,
    taxCents: taxLines.length > 0 ? summedTaxLines : (taxCents ?? 0),
    tipCents: 0,
    feeCents: 0,
    totalCents,
  })
}

function toCents(s: string): number | null {
  const cleaned = s.replace(/[^0-9.,-]/g, '')
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalised = cleaned
  if (lastComma !== -1 && lastDot !== -1) {
    normalised =
      lastComma > lastDot ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '')
  } else if (lastComma !== -1) {
    normalised =
      cleaned.length - lastComma - 1 === 2 ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '')
  }
  const n = Number(normalised)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

/* ─────────────────────── Sanity bounds (ACC-6) ───────────────── */

export function sanityCheck(r: ExtractedReceipt): string[] {
  const warnings: string[] = []
  const itemSum = r.items.reduce((a, i) => a + i.cents, 0)

  if (r.totalCents !== null && r.totalCents <= 0) {
    warnings.push("The total doesn't look right — check it against the receipt.")
  }
  if (r.totalCents !== null && r.taxCents > r.totalCents * 0.25) {
    warnings.push('The tax looks unusually high — check for a misplaced decimal point.')
  }
  for (const item of r.items) {
    if (r.totalCents !== null && item.cents > r.totalCents) {
      warnings.push(`"${item.name}" costs more than the whole receipt — check that price.`)
    }
  }
  if (r.subtotalCents !== null && itemSum !== r.subtotalCents) {
    warnings.push(
      `The items add up to ${fmt(itemSum)} but the subtotal says ${fmt(r.subtotalCents)}.`,
    )
  }
  if (r.totalCents !== null && r.subtotalCents !== null) {
    const expected = r.subtotalCents + r.taxCents + r.tipCents + r.feeCents
    if (expected !== r.totalCents) {
      warnings.push(`The parts add up to ${fmt(expected)} but the total says ${fmt(r.totalCents)}.`)
    }
  }
  if (r.items.length === 0) {
    warnings.push("Couldn't find any items — you can split the total instead.")
  }
  return warnings
}

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`

/* ──────────────────────────── Ladder ─────────────────────────── */

export async function extractReceipt(base64: string, mimeType: string): Promise<ExtractionResult> {
  try {
    const receipt = await withRetry(() => callGemini(base64, mimeType))
    return { source: 'gemini', receipt, warnings: sanityCheck(receipt) }
  } catch (err) {
    // Provider failures must be visible, or a silent degrade to the slower
    // rung looks like the app simply got worse (MET-16). Error TYPE only —
    // never receipt content (SEC-7).
    const first =
      err instanceof ProviderError
        ? err.message
        : err instanceof Error
          ? `gemini:${err.name}`
          : 'gemini:unknown'
    console.warn(`[extract] primary provider failed: ${first}; falling back`)
    try {
      const fallback = await callOcrSpace(base64, mimeType)
      return { ...fallback, warnings: [...fallback.warnings, ...sanityCheck(fallback.receipt)] }
    } catch (fallbackErr) {
      const second =
        fallbackErr instanceof ProviderError ? fallbackErr.message : 'ocrspace:unknown'
      console.warn(`[extract] fallback provider failed: ${second}`)
      // Both rungs gone. The user types it in — never a dead end (FR-8).
      throw new ExtractionUnavailable(`${first} | ${second}`)
    }
  }
}

export class ExtractionUnavailable extends Error {
  constructor(readonly detail: string) {
    super('Scanning is busy right now — you can type the items in, it takes a minute.')
  }
}
