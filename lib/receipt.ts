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

/**
 * The most lines one receipt may carry. A single Costco run prints ~60; a
 * multi-page PDF statement can print several hundred. The old cap of 200 was
 * not a safety bound, it was a silent truncation: Zod rejected the whole
 * extraction and the user saw a half-read receipt (see parseReceiptJson).
 */
export const MAX_ITEMS = 500

/**
 * "No value" arrives as null at least as often as by omitting the key — the
 * prompt itself offers `"taxFlag": string|null`. Zod's .optional() rejects
 * null, so a receipt with no tax letters failed validation on EVERY line and
 * the user got an empty review screen beside a perfectly-read total. Coerce
 * null to absent before validating.
 */
const nullish = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === null ? undefined : value), schema)

/** Cents must be whole, but a model will hand back 450.0 — or 450.00001. */
const centsField = (min: number, max: number) =>
  z.number().finite().min(min).max(max).transform(Math.round)

export const ExtractedItem = z.object({
  /**
   * Stable client-side identity. Assignments are keyed by this, never by row
   * position — removing or splitting a row must not move people onto the
   * wrong item (GAP-24).
   */
  id: z.string().max(80).optional(),
  name: z.string().min(1).max(120),
  qty: nullish(z.number().finite().min(0).max(999).default(1)),
  /** Line total in cents, already multiplied by qty. Negative for discounts. */
  cents: centsField(-1_000_000, 10_000_000),
  /** The letter printed beside the line, e.g. Costco's A / E. */
  taxFlag: nullish(z.string().max(3).optional()),
  confidence: nullish(z.number().min(0).max(1).optional()),
})

export const ExtractedReceipt = z.object({
  merchant: z.string().max(120).nullable(),
  /** ISO date from the receipt itself, never today's date (GAP-11). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  currency: nullish(z.string().length(3).default('USD')),
  items: z.array(ExtractedItem).max(MAX_ITEMS),
  taxLines: nullish(
    z
      .array(z.object({ flag: z.string().max(3), cents: centsField(-1_000_000, 10_000_000) }))
      .max(10)
      .default([]),
  ),
  subtotalCents: centsField(-1_000_000, 100_000_000).nullable(),
  taxCents: nullish(centsField(-1_000_000, 10_000_000).default(0)),
  tipCents: nullish(centsField(-1_000_000, 10_000_000).default(0)),
  feeCents: nullish(centsField(-1_000_000, 10_000_000).default(0)),
  totalCents: centsField(-1_000_000, 100_000_000).nullable(),
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

/**
 * Which item each discount line discounts (FR-42).
 *
 * Costco prints "0000389361 / SNAPS  3.00-" right under "HVST SNAPS": the
 * discount belongs to whoever had the snaps. Match by a shared word first
 * (nearest earlier line), else the line directly above. Receipt-wide coupons
 * with no match and no item above are left for the user to assign.
 */
export function discountParents(
  lines: { key: string; name: string; cents: number }[],
): Record<string, string> {
  const GENERIC = /^(DISCOUNT|SAVINGS|SAVING|INSTANT|COUPON|OFF|PROMO|MEMBER|TPD)$/
  const parents: Record<string, string> = {}
  lines.forEach((line, i) => {
    if (line.cents >= 0) return
    const words = line.name
      .replace(/^discount\s*·\s*/i, '')
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((word) => word.length >= 3 && !GENERIC.test(word))
    let parent: string | undefined
    for (let j = i - 1; j >= 0 && words.length > 0; j--) {
      const candidate = lines[j]
      if (candidate && candidate.cents > 0 && words.some((w) => candidate.name.toUpperCase().includes(w))) {
        parent = candidate.key
        break
      }
    }
    const above = lines[i - 1]
    if (!parent && above && above.cents > 0) parent = above.key
    if (parent) parents[line.key] = parent
  })
  return parents
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

const PROMPT = `You are reading a shop or restaurant receipt. It may be a
photograph, a scan, or a PDF of several pages.

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
5. The DATE is the one printed on the receipt, not today. Return ISO
   YYYY-MM-DD. Read the receipt's own order before converting: 14/09/2026 is
   14 September, and outside the United States the day is written first.
   Never return an impossible date — if the order is genuinely unclear, use
   the country implied by the currency and tax word.
6. DECIMAL SEPARATORS: if the receipt uses "1.234,56", the comma is the
   decimal separator. Read the format the receipt actually uses.
7. CURRENCY: return the ISO code of the money actually printed, because it
   becomes the currency of a real expense. Read the evidence in this order:
   a printed code (EUR, CAD, GBP) is decisive; then a symbol only one
   currency uses — £ GBP, € EUR, ₹ INR, ¥ JPY; then the tax word, which
   names the country — GST/HST/PST/QST Canada, ALV Finland, MOMS Sweden,
   MVA Norway, MWST Switzerland, BTW Netherlands, TVA France, IVA Spain or
   Italy, VAT Britain and much of Europe; then the language of the items.
   A bare "$" is shared by the US, Canada, Australia, NZ and Singapore — use
   the tax word and language to choose between them, and only default to USD
   when nothing else on the receipt disagrees.
8. qty is how many units that LINE covers; cents is the line TOTAL for them.
9. confidence is 0..1 — your own certainty about that line. Be honest: mark
   anything smudged, cut off, or ambiguous below 0.7.
10. Omit tips unless printed. Do not invent a tip line.
11. COMPLETENESS IS THE WHOLE JOB. Transcribe EVERY line item, in order, from
    the FIRST page to the LAST. A multi-page receipt continues on the next
    page: keep going until you reach the printed total. Never summarise,
    never collapse repeated lines into one, never stop early, never write
    "..." or "and N more". A receipt with 180 lines returns 180 items.`

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

/**
 * Room for a long receipt to finish its sentence.
 *
 * The default output ceiling is a few thousand tokens. One page of items fits;
 * a multi-page PDF does not, so the JSON came back cut off mid-item, failed to
 * parse, and the whole extraction fell to the backup reader — which looked to
 * the user like "it only found some of my items". ~180 items is ~24k tokens.
 */
const MAX_OUTPUT_TOKENS = 65_536

type GeminiCandidate = {
  content?: { parts?: { text?: string; thought?: boolean }[] }
  finishReason?: string
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
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
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
  const candidate = (body as { candidates?: GeminiCandidate[] }).candidates?.[0]

  // Truncated output is half a receipt dressed as a parse error. Say so.
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new ProviderError('gemini truncated output', true)
  }

  const text = extractText(candidate)
  if (!text) throw new ProviderError('gemini returned no text', true)

  return parseReceiptJson(text)
}

/**
 * Every answer part, joined. A reasoning model splits its reply across parts
 * and prefixes them with its thinking — taking parts[0] alone got either half
 * the JSON or none of it.
 */
function extractText(candidate: GeminiCandidate | undefined): string | null {
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => part.thought !== true && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim()
  return text || null
}

/**
 * Validate the model's JSON without letting one bad line cost the user the
 * other ninety-nine.
 *
 * Strict parse first, because that is the contract. When it fails — a stray
 * null name, a qty of 1e9, one item too many — fall back to a per-item parse
 * that keeps everything that validates. A receipt missing one line that
 * sanityCheck then flags is worth far more than an empty review screen.
 */
export function parseReceiptJson(text: string): ExtractedReceipt {
  let raw: unknown
  try {
    raw = JSON.parse(stripFence(text))
  } catch {
    throw new ProviderError('gemini returned unparsable JSON', true)
  }

  const strict = ExtractedReceipt.safeParse(raw)
  if (strict.success) return strict.data

  const salvaged = SalvagedReceipt.safeParse(raw)
  if (!salvaged.success) throw new ProviderError('gemini returned an unusable shape', true)
  return salvaged.data
}

/** Same shape, but every field forgives itself and bad items are dropped. */
const SalvagedReceipt = z.object({
  merchant: z.string().max(120).nullable().catch(null),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .catch(null),
  currency: nullish(z.string().length(3)).catch('USD'),
  items: z
    .array(z.unknown())
    .catch([])
    .transform((rows) =>
      rows
        .map((row) => ExtractedItem.safeParse(row))
        .flatMap((parsed) => (parsed.success ? [parsed.data] : []))
        .slice(0, MAX_ITEMS),
    ),
  taxLines: z
    .array(z.object({ flag: z.string().max(3), cents: centsField(-1_000_000, 10_000_000) }))
    .max(10)
    .catch([]),
  subtotalCents: centsField(-1_000_000, 100_000_000).nullable().catch(null),
  taxCents: centsField(-1_000_000, 10_000_000).catch(0),
  tipCents: centsField(-1_000_000, 10_000_000).catch(0),
  feeCents: centsField(-1_000_000, 10_000_000).catch(0),
  totalCents: centsField(-1_000_000, 100_000_000).nullable().catch(null),
})

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

  const isPdf = mimeType === 'application/pdf'
  const form = new URLSearchParams({
    base64Image: `data:${mimeType};base64,${base64}`,
    language: 'eng',
    isTable: 'true',
    // Engine 2 reads photos better but refuses multi-page PDFs; engine 1 is
    // the only one that returns every page, which matters more here.
    OCREngine: isPdf ? '1' : '2',
    scale: 'true',
    // Without an explicit filetype a base64 PDF is sniffed as an image and
    // only the first page comes back.
    ...(isPdf ? { filetype: 'PDF' } : {}),
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

  // One ParsedResults entry PER PAGE. Reading only [0] threw away every page
  // after the first, so a two-page PDF came back half-read.
  const rawText = (body.ParsedResults ?? [])
    .map((page) => page.ParsedText ?? '')
    .filter((page) => page.trim() !== '')
    .join('\n')
  return {
    source: 'ocrspace',
    receipt: parseLines(rawText),
    rawText,
    warnings: ['Scanned with the backup reader — please check every line carefully.'],
  }
}

/* ──────────────────── Reading a receipt from anywhere ──────────────────── */

/**
 * Which currency is this?
 *
 * The backup reader gets flat text with no metadata, so the receipt has to
 * say. Evidence is ranked: a printed ISO code is certain, a £ or € is nearly
 * certain, and a tax word is a strong hint — GST beside dollars is Canada,
 * ALV is Finland. The dollar sign alone stays USD, because it is shared by a
 * dozen countries and a wrong guess puts the wrong currency on someone's
 * Splitwise expense.
 */
const ISO_CODES =
  /\b(USD|CAD|GBP|EUR|AUD|NZD|CHF|SEK|NOK|DKK|INR|JPY|MXN|SGD|HKD|ZAR|PLN|CZK)\b/

/** A symbol only one currency uses. The dollar sign is deliberately absent. */
const SYMBOLS: [RegExp, string][] = [
  [/£/, 'GBP'],
  [/€/, 'EUR'],
  [/₹/, 'INR'],
  [/[¥￥]/, 'JPY'],
  [/₩/, 'KRW'],
  [/\bCHF\b/i, 'CHF'],
  [/\bzł\b/i, 'PLN'],
]

/**
 * What each country calls its sales tax, and what that implies.
 *
 * A tax word is the single most reliable clue on a receipt that prints no
 * symbol at all — every country prints its own, and they barely overlap.
 * VAT is the exception: Britain, Ireland and a dozen others use it, so it
 * names no currency on its own.
 */
const TAX_SYSTEMS: { word: RegExp; currency?: string }[] = [
  { word: /\b(HST|QST|TPS|TVQ)\b/, currency: 'CAD' }, // Canada only
  { word: /\bALV\b/, currency: 'EUR' }, // Finland
  { word: /\bMVA\b/, currency: 'NOK' }, // Norway
  { word: /\bMWST\b/, currency: 'CHF' }, // Switzerland
  { word: /\bBTW\b/, currency: 'EUR' }, // Netherlands
  { word: /\b(MOMS)\b/, currency: 'SEK' }, // Sweden and Denmark share the word
  { word: /\b(IVA|TVA)\b/, currency: 'EUR' }, // Spain, Italy, France
  { word: /\bPST\b/, currency: 'CAD' }, // provincial: Canada only
  { word: /\bGST\b/, currency: 'CAD' }, // shared with AU, NZ, SG — see below
  { word: /\bVAT\b/ }, // Britain and much of Europe
]

/** Every tax word, for telling a tax line apart from something someone ate. */
export const TAX_WORD =
  /(?:^|[^\p{L}\d])(TAX|VAT|GST|HST|PST|QST|TPS|TVQ|ALV|MOMS|MVA|MWST|BTW|TVA|IVA)(?![\p{L}\d])/u

/**
 * Strip accents before matching a keyword.
 *
 * OCR drops diacritics constantly: a Finnish receipt's YHTEENSÄ comes back
 * as YHTEENSA, and the total was then read as an item. Comparing without
 * accents matches both, so the word lists below stay plain ASCII.
 */
const deaccent = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * "Total" in the languages this reader is likely to meet.
 *
 * The boundaries are spelled out rather than using \b, which is ASCII-only:
 * YHTEENSÄ ends in a letter JavaScript does not consider a word character,
 * so \b never matched it and Finland's total was read as an item.
 */
const TOTAL_WORD =
  /(?:^|[^\p{L}\d])(TOTAL|TOTALT|TOTALE|SUMMA|SUMME|GESAMT|GESAMTBETRAG|YHTEENSA|MAKSETTAVA|SOMME|MONTANT|IMPORTE|BEDRAG|I ALT)(?![\p{L}\d])/u

/** "Subtotal", likewise. Checked before total, since it often contains it. */
const SUBTOTAL_WORD =
  /(?:^|[^\p{L}\d])(SUBTOTAL|SUB-TOTAL|SUB TOTAL|VALISUMMA|ZWISCHENSUMME|SOUS-TOTAL|SOTTOTOTALE|DELSUMMA|NETTO)(?![\p{L}\d])/u

/**
 * Decide the currency from the whole receipt at once, before any line is
 * read. Returns the ISO code and whether dates on this receipt are likely to
 * be day-first — everywhere except the United States, essentially.
 */
export function detectCurrency(text: string): { currency: string; dayFirst: boolean } {
  const upper = deaccent(text.toUpperCase())

  const iso = upper.match(ISO_CODES)?.[1]
  const symbol = SYMBOLS.find(([re]) => re.test(text))?.[1]
  const taxHint = TAX_SYSTEMS.find((t) => t.word.test(upper))?.currency

  // A dollar sign alone is USD: a dozen countries print it, and guessing
  // wrong puts the wrong currency on someone's expense. But dollars beside
  // GST cannot be American — the United States has no GST — so the tax word
  // wins. It may still be Australia or Singapore rather than Canada, which
  // is why the review step lets anyone correct it in one tap.
  const currency = iso ?? symbol ?? taxHint ?? 'USD'

  return { currency, dayFirst: currency !== 'USD' }
}

/**
 * The date the receipt prints, as ISO.
 *
 * 14/09/2026 used to become "2026-14-09" — a month of fourteen, which then
 * sailed through validation because it still looked like a date. Order is
 * resolved by evidence first (a number above twelve can only be a day) and
 * by the receipt's own currency second. Dots, slashes and dashes all count,
 * because Finland writes 14.09.2026 and nobody else does.
 */
export function parseReceiptDate(text: string, dayFirst: boolean): string | null {
  // ISO first: unambiguous, and worth preferring wherever it appears.
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const match = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/)
  if (!match) return null

  const a = Number(match[1])
  const b = Number(match[2])
  const year = fullYear(Number(match[3]))

  // A number above twelve can only be a day; otherwise trust the locale.
  const dayIsFirst = a > 12 ? true : b > 12 ? false : dayFirst
  return validDate(year, dayIsFirst ? b : a, dayIsFirst ? a : b)
}

const fullYear = (year: number) => (year < 100 ? 2000 + year : year)

/** An impossible date is worse than no date: it reaches Splitwise either way. */
function validDate(year: number, month: number, day: number): string | null {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

export { TOTAL_WORD, SUBTOTAL_WORD }

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
const MONEY = /(-?\d{1,3}(?:[.,\s]\d{3})*[.,]\d{2})\s*(-?)\s*([A-Z])?\s*$/

/**
 * Currency marks, stripped before an amount is read.
 *
 * "1,35 €" ends with a symbol, so an expression anchored on digits never
 * matched it and every Finnish line was skipped. Removing the mark first
 * means one expression works for $1.35, £1.35 and 1,35 € alike.
 */
const CURRENCY_MARK = /[$£€¥￥₹₩]|\b(?:CHF|EUR|USD|CAD|GBP|SEK|NOK|DKK|PLN|kr|zł)\b/gi

const withoutCurrency = (field: string) => field.replace(CURRENCY_MARK, '').trim()

/** Lines that are payment plumbing, not things anyone ate. */
const NOT_AN_ITEM =
  /\b(CHANGE|CASH|VISA|MASTERCARD|AMEX|DEBIT|CREDIT|CARD|BALANCE|APPROVED|AUTH|CHIP|SEQ|AID|RESP|TEND(ER)?|ACCOUNT|MEMBER|ITEMS SOLD|TOTAL NUMBER|KORTTI|PANKKIKORTTI|KATEINEN|MAKSUKORTTI|KIITOS|ESPECES|CARTE|MONNAIE|MERCI|KREDITKARTE|BARGELD|WECHSELGELD|KONTANT|VAXEL|BETALT)\b/i

export function parseLines(text: string): ExtractedReceipt {
  // Currency first: it decides how dates are read, and it must reach
  // Splitwise correctly — a £20 receipt filed as $20 is a money error.
  const { currency, dayFirst } = detectCurrency(text)

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
    if (merchant === null && !MONEY.test(withoutCurrency(line)) && /[A-Za-z]{3}/.test(line)) {
      merchant = line.split(/\t|\s{2,}/)[0]?.trim().slice(0, 120) ?? null
    }

    if (date === null) date = parseReceiptDate(line, dayFirst)

    // Columns, then the last one that looks like money.
    const fields = line.split(/\t|\s{2,}/).map((f) => f.trim()).filter(Boolean)
    if (fields.length === 0) continue

    let amountField: string | null = null
    let amountIndex = -1
    for (let i = fields.length - 1; i >= 0; i--) {
      const field = fields[i]
      const bare = field ? withoutCurrency(field) : ''
      if (bare && MONEY.test(bare)) {
        amountField = bare
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
    // Accents removed: OCR loses them, and every keyword list is ASCII.
    const key = deaccent(label.toUpperCase())

    // Per-rate tax lines: "A 8.1% TAX  5.57", "ALV 24% 1,53"
    const rateTax = key.match(/^([A-Z])\s+[\d.,]+%\s*(?:TAX|VAT|ALV|MOMS|MWST|TVA|IVA|BTW)$/)
    if (rateTax?.[1]) {
      taxLines.push({ flag: rateTax[1], cents })
      continue
    }
    // GST, HST, VAT, ALV, MOMS — every country names its own tax, and none of
    // them are things anyone ate.
    if (TAX_WORD.test(key) && !/^[A-Z]\s/.test(key)) {
      taxCents = (taxCents ?? 0) + cents
      continue
    }
    if (SUBTOTAL_WORD.test(key)) {
      subtotalCents = cents
      continue
    }
    if (TOTAL_WORD.test(key) && !/SUB/.test(key)) {
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
    currency,
    items: items.slice(0, MAX_ITEMS),
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
