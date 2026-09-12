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

/** Pull "NAME .... 12.34" pairs out of OCR text. Deliberately conservative. */
export function parseLines(text: string): ExtractedReceipt {
  const items: ExtractedItem[] = []
  let totalCents: number | null = null
  let subtotalCents: number | null = null
  let taxCents = 0

  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(.*?)[\s.]{2,}?(-?\$?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})-?\s*([A-Z])?\s*$/)
    if (!m) continue
    const label = (m[1] ?? '').trim()
    const amount = toCents(m[2] ?? '')
    if (amount === null || label === '') continue

    const key = label.toUpperCase()
    if (/\bTOTAL\b/.test(key) && !/SUB/.test(key)) totalCents = amount
    else if (/SUBTOTAL/.test(key)) subtotalCents = amount
    else if (/\bTAX\b/.test(key)) taxCents += amount
    else if (!/CHANGE|CASH|VISA|CARD|BALANCE|APPROVED|AMOUNT/.test(key)) {
      const negative = /-\s*$/.test(line)
      items.push({
        name: label.slice(0, 120),
        qty: 1,
        cents: negative ? -Math.abs(amount) : amount,
        ...(m[3] ? { taxFlag: m[3] } : {}),
        confidence: 0.5,
      })
    }
  }

  return ExtractedReceipt.parse({
    merchant: null,
    date: null,
    currency: 'USD',
    items,
    taxLines: [],
    subtotalCents,
    taxCents,
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
