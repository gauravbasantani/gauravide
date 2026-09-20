/**
 * The real reader, against every format we accept.
 *
 * Opt-in: it spends live vision-API quota, so CI and `npm test` skip it.
 * Run it after touching lib/receipt.ts:
 *
 *   LIVE_EXTRACTION=1 npx vitest run tests/liveExtraction.test.ts
 *
 * It exists because the formats fail differently and silently: a PDF loses
 * pages, a transparent PNG reads as a black rectangle, a HEIC is a format no
 * canvas can decode, and a long receipt runs past the model's output ceiling.
 * Only a real call proves each one reads.
 *
 * The two rungs are judged separately. Gemini is expected to read a receipt
 * properly; OCR.space is a degraded fallback that returns raw text, so it is
 * held to a weaker bound — grading both by the same bar would either excuse
 * the primary rung or condemn the fallback for doing its job.
 */
import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { ExtractionUnavailable, extractReceipt } from '@/lib/receipt'

const LIVE = process.env.LIVE_EXTRACTION === '1'
const FIXTURES = path.resolve(import.meta.dirname, '../e2e/fixtures')

/** The dev keys live in .env.local; vitest does not load it for us. */
beforeAll(() => {
  const file = path.resolve(import.meta.dirname, '../.env.local')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (match?.[1] && match[2]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
})

type Case = {
  file: string
  mime: string
  what: string
  /** Fewest items a correct primary read returns. A lower bound, not an exact
   *  count: a vision model may legitimately merge or split a line. */
  minItems: number
  /** Fewest the raw-text fallback should manage. It reads flat text off a
   *  photo, so it finds less — and finds nothing at all in a format it does
   *  not support, which is a skip, not a failure. */
  minItemsFallback: number
  /** A line that must appear, however the rest is grouped. */
  expect: RegExp
  /** The ISO code this receipt must come back as — it reaches Splitwise. */
  currency?: string
  /** The date it prints, read in its own country's order. */
  date?: string
}

const COSTCO = /towel|bath|snaps/i

const CASES: Case[] = [
  // Complex: a photographed Costco receipt — item numbers, tax flags, discounts.
  { file: 'receipt.jpg', mime: 'image/jpeg', what: 'complex photo', minItems: 6, minItemsFallback: 6, expect: COSTCO },
  { file: 'receipt.png', mime: 'image/png', what: 'complex, lossless', minItems: 6, minItemsFallback: 6, expect: COSTCO },
  { file: 'receipt.webp', mime: 'image/webp', what: 'complex, webp', minItems: 6, minItemsFallback: 6, expect: COSTCO },
  { file: 'receipt.heic', mime: 'image/heic', what: 'complex, iPhone HEIC', minItems: 6, minItemsFallback: 0, expect: COSTCO },
  // Simple: three lines, one page. No tax letters — the case that used to
  // return a correct total beside zero items.
  { file: 'receipt-simple.png', mime: 'image/png', what: 'simple, 3 lines', minItems: 3, minItemsFallback: 3, expect: /latte/i },
  { file: 'receipt-simple.pdf', mime: 'application/pdf', what: 'simple, 1-page PDF', minItems: 3, minItemsFallback: 3, expect: /latte/i },
  // Outside the United States: each must come back in its own currency, with
  // the day read the way that country writes it, and its tax word understood.
  { file: 'receipt-uk.pdf', mime: 'application/pdf', what: 'UK, pounds and VAT', minItems: 3, minItemsFallback: 3, expect: /milk|bread|cheddar/i, currency: 'GBP', date: '2026-09-14' },
  { file: 'receipt-fi.pdf', mime: 'application/pdf', what: 'Finland, euros and ALV', minItems: 3, minItemsFallback: 3, expect: /maito|leip|juusto/i, currency: 'EUR', date: '2026-09-14' },
  { file: 'receipt-ca.pdf', mime: 'application/pdf', what: 'Canada, dollars and GST', minItems: 3, minItemsFallback: 3, expect: /milk|bread|cheese/i, currency: 'CAD', date: '2026-09-14' },
  // Complex PDF: 80 items across two pages. Page 2 is what used to go missing.
  // OCR.space returns both pages but reads little of the second, so its bound
  // is deliberately lower than Gemini's.
  { file: 'receipt-2page.pdf', mime: 'application/pdf', what: 'complex, 2-page PDF, 80 items', minItems: 80, minItemsFallback: 35, expect: /item 0/i },
]

describe.skipIf(!LIVE)('live extraction, every accepted format', () => {
  for (const testCase of CASES) {
    it(
      `reads ${testCase.file} — ${testCase.what}`,
      async (context) => {
        const bytes = fs.readFileSync(path.join(FIXTURES, testCase.file))

        let result
        try {
          result = await extractReceipt(bytes.toString('base64'), testCase.mime)
        } catch (err) {
          // Both rungs gone — a quota day, not a defect in this code. Say which.
          if (err instanceof ExtractionUnavailable) {
            context.skip(`both providers unavailable: ${err.detail}`)
            return
          }
          throw err
        }

        const fallback = result.source === 'ocrspace'
        const floor = fallback ? testCase.minItemsFallback : testCase.minItems
        const names = result.receipt.items.map((item) => item.name).join(' | ')

        console.log(
          `  ${testCase.file.padEnd(20)} ${result.source.padEnd(9)} ` +
            `${String(result.receipt.items.length).padStart(3)} items  ` +
            `${result.receipt.currency}  date ${result.receipt.date}  ` +
            `tax ${result.receipt.taxCents}  total ${result.receipt.totalCents}`,
        )

        // A format the fallback cannot read at all is a gap in that rung, not
        // a broken read. Flagged, not failed — the primary rung handles it.
        if (fallback && floor === 0) {
          console.warn(`  ${testCase.mime} is unsupported by the fallback rung — primary only`)
          return
        }

        expect(result.receipt.items.length).toBeGreaterThanOrEqual(floor)
        expect(names).toMatch(testCase.expect)
        if (testCase.currency) expect(result.receipt.currency).toBe(testCase.currency)
        if (testCase.date) expect(result.receipt.date).toBe(testCase.date)
        // Nothing may be nameless, and no line may be silently empty.
        for (const item of result.receipt.items) expect(item.name.trim()).not.toBe('')
      },
      120_000,
    )
  }
})
