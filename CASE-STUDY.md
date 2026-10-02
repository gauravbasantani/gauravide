# Case study: nine silent bugs between "it works" and "it works for everyone"

A debugging and internationalisation session on **Gauravide**, a receipt-splitting web app
(Next.js, TypeScript, Vercel, Supabase, Gemini vision + OCR.space fallback, Splitwise API).

**Starting point:** one user report, five words long: *"uploading pdf is not fetching all the items."*

**Ending point:** nine distinct bugs found and fixed, four of which nobody had reported;
an app that reads receipts from any country; 8 commits; 40 files; +2,226 / −100 lines;
a test suite that went from 18/20 to 22/22; all of it deployed and verified in production.

**Duration:** roughly 3.5 hours of continuous work, 2026-09-19 21:26 to 2026-09-20 00:43.

---

## Why this is worth studying

Every single bug in this session was **silent**. Not one threw an error, logged a warning, or
failed a test. The app reported success every time while losing data. A £20 receipt was filed
as $20. A two-page PDF became a one-page PDF. A receipt with 80 items became a receipt with 0
items, shown next to a perfectly correct total.

The common thread: **each bug lived at a boundary where one layer assumed something the next
layer never promised.** A model that returns `null` where the schema said `undefined`. A
serverless runtime that freezes before a background write lands. A browser that can decode a
format the code assumed it couldn't. A currency that is a string everywhere except in the one
table that matters.

---

## The timeline, exactly as it happened

| # | Commit | Time | What it fixed |
|---|---|---|---|
| 1 | `f9ed819` | 21:26 | Multi-page PDFs, output truncation, null tax flags, transparent PNGs |
| 2 | `4f1b8f3` | 21:33 | A test suite that runs against the deployed site |
| 3 | `f6c5030` | 21:47 | Scan analytics never being recorded |
| 4 | `5d28404` | 23:53 | Reading receipts from any country |
| 5 | `bcf8a11` | 00:13 | Currency through the whole flow + admin reach reporting |
| 6 | `e208645` | 00:25 | Content pages + fast failure on an exhausted quota |
| 7 | `5dc4bf7` | 00:30 | Live checks for the currency picker and content |
| 8 | `cc4f801` | 00:43 | Copy cleanup + an admin table that reconciles |

---

## Bug 1 — The model's answer was cut off mid-sentence

**Symptom:** long PDFs returned some items, not all.

**Root cause:** the Gemini request set no `maxOutputTokens`. A long receipt's JSON exceeded the
default ceiling, came back truncated mid-item, failed `JSON.parse`, and the whole extraction
fell through to the backup reader — which was *also* broken (bug 2). The user saw a partial read
and no error.

**Fix:** `maxOutputTokens: 65536`; an explicit check for `finishReason === 'MAX_TOKENS'` so
truncation is *named* rather than mistaken for a parse error; and that condition made retryable.

**Lesson:** an unset limit is still a limit. If a provider has a default you did not choose,
you have not configured it — you have inherited someone else's guess.

---

## Bug 2 — The fallback reader only ever read page one

**Root cause:** one line.

```ts
const rawText = body.ParsedResults?.[0]?.ParsedText ?? ''
```

OCR.space returns **one `ParsedResults` entry per page**. Taking `[0]` discarded every page
after the first. A base64 PDF was also being sniffed as an image because the request never said
`filetype=PDF`.

**Fix:** join every page's text; send `filetype=PDF`.

**Lesson:** `[0]` on an array you did not count is a bug waiting for a second element. The
plural in `ParsedResults` was the whole clue, sitting in the variable name.

---

## Bug 3 — The one the user was actually hitting (and it was in the browser)

This is the most instructive bug in the session, because **no amount of server-side fixing would
have helped**, and it was only found by running a real browser against the deployed site.

The client re-encodes images through a canvas to strip EXIF/GPS before upload. For PDFs, the
code assumed all three decode strategies would fail and the original file would pass through.

**On mobile WebKit that assumption is false.** Safari can decode a PDF via ImageIO. So
`prepareImage` happily rendered the PDF to a canvas and uploaded **page one, as a JPEG**. Pages
2+ never left the phone.

Proven live, before the fix:

```
desktop Chromium → upload type: application/pdf   ✓ (Chromium cannot decode PDFs)
mobile  WebKit   → upload type: image/jpeg        ✗ page 1 only
```

**Fix:** skip canvas preparation entirely for PDFs.

**Lesson:** "this will fail, so the fallback runs" is a prediction, not a guarantee. Test it on
the engine where it might succeed. Cross-browser differences are not only about CSS.

---

## Bug 4 — A receipt with no tax letters lost *every* item

**Symptom, from a live run:** `0 items, total 1630`. A perfectly correct total beside an empty
list.

**Root cause:** the prompt offers the model `"taxFlag": string|null`. The Zod schema said:

```ts
taxFlag: z.string().max(3).optional()   // rejects null
```

`.optional()` accepts `undefined`, not `null`. So on any receipt without tax-rate letters, every
single item failed validation. The existing test fixture was a Costco receipt — which *does*
print `A`/`E` flags — so the bug was invisible to the entire test suite.

**Fix:** a `nullish()` wrapper coercing `null` → absent before validation, applied throughout;
plus a salvage path so one bad line costs one line instead of the whole receipt.

**Lesson:** when you tell a model a field may be `null`, your schema must accept `null`. And a
test fixture that happens to exercise the happy path will hide a bug forever. **The live run
found this; the unit tests could not.**

---

## Bug 5 — Transparent PNGs uploaded as black rectangles

JPEG has no alpha channel. Drawing a transparent PNG to a canvas and encoding as JPEG makes
every transparent pixel **black**. Screenshots of emailed receipts are frequently transparent.

Proven against the real OCR provider — same image, two versions:

```
flattened onto white → "CAFE LUNA / Latte 4.50 / Croissant 3.25 / ..."
with alpha channel   → ""
```

**Fix:** `ctx.fillStyle = '#ffffff'; ctx.fillRect(...)` before `drawImage`.

**Lesson:** the format conversion you do for one reason (stripping GPS) can destroy data for an
unrelated reason. Verify the output, not just that the conversion ran.

---

## Bug 6 — Analytics that recorded sometimes, randomly

**Symptom, reported by the owner:** *"people are scanning, I'm watching, but it is not counting
— only counting splits sent."*

**Root cause:** two routes, one keyword of difference.

```ts
// expense route — always recorded
await insert('events', { name: 'split_submitted', ... })

// extract route — recorded sometimes
insert('events', { name: 'receipt_extracted', ... }).catch(...)
```

A serverless instance is frozen the moment it returns a response. The un-awaited insert was
killed in flight — sometimes after it landed, usually before.

**The evidence that confirmed it** came from the production database, not from reading code:

```
2026-09-19:  8 splits sent (8, 10, 11, 12 items each — obviously scanned receipts)
             0 scans recorded
```

And a controlled test: 3 uploads to production → **2 rows**. After the fix: 5 uploads → **5
rows**; later 6 uploads → **6 rows**.

**Lesson:** fire-and-forget is not a performance optimisation on serverless, it is a coin flip.
Also: *the database is the witness.* Reading the code gave a hypothesis; querying production
proved it.

---

## Bug 7 — The app assumed America, in four separate places

Triggered by the owner's question: *"will this work for Canada, Finland or UK?"*

Rather than guess, I ran receipts from each country through the parser. Results **before** any
fix:

| | UK | Canada | Finland |
|---|---|---|---|
| items | 2 | 3 (GST charged as an item) | **0** |
| date | `2026-14-09` ✗ | `2026-14-09` ✗ | none |
| total | ✓ | ✓ | none |
| currency | **USD** ✗ | **USD** ✗ | **USD** ✗ |

Four distinct faults:

1. **Currency hardcoded to `'USD'`** in the fallback parser. A £20 receipt reached Splitwise as
   $20 — a money error, not a display one.
2. **Dates assumed MM/DD/YYYY.** `14/09/2026` became `2026-14-09` — month fourteen — which
   *still matched the validation regex* `^\d{4}-\d{2}-\d{2}$` and was sent onward.
3. **Finland returned nothing**, because `1,35 €` ends with its currency mark and the amount
   pattern was anchored on digits.
4. **Only the English word "TAX"** was recognised, so GST/VAT/ALV became line items people paid
   for.

### How the fix decides a currency

Evidence, strongest first:

1. A printed **ISO code** (`EUR`, `CAD`, `GBP`) — decisive.
2. A **symbol only one currency uses** — `£` GBP, `€` EUR, `₹` INR.
3. The **tax word, which names the country**. This is the insight that makes it work: every
   country calls its sales tax something different and they barely overlap.
   GST/HST/PST/QST → Canada, ALV → Finland, MOMS → Sweden, MVA → Norway, MWST → Switzerland,
   BTW → Netherlands, TVA → France, IVA → Spain/Italy, VAT → Britain and much of Europe.
4. Otherwise **USD** — because a bare `$` is printed by a dozen countries and a confident wrong
   guess is worse than a safe default. *But* dollars beside GST cannot be American (the US has
   no GST), so the tax word wins there.

### The part most teams would skip

Detection **cannot** separate Canada from Australia or Singapore — all print `$` with GST. So
detection was made *not* the last word: the review step now offers currency as a **control**,
filled in from the receipt and correctable in one tap.

This mattered because **Splitwise cannot change an expense's currency after creation**, and the
app previously had no UI to change it at all.

**Lesson:** when a heuristic has a known blind spot, the answer is a correction affordance, not
a cleverer heuristic. Know the difference between "needs better detection" and "needs a user in
the loop."

---

## Bug 8 — Yen would have displayed as ¥12 for twelve-thirty-five

Found by auditing rather than by failure. The entire app stores money as integer hundredths
(`cents`). Yen has no minor unit:

```
1235 cents as JPY → ¥12      ← wrong by 100×, shown with total confidence
1235 cents as INR → ₹12.35   ← correct
```

**Fix:** zero-decimal currencies (JPY, KRW, VND, CLP, ISK, HUF) are not offered at all and fall
back to USD, which the user can see and correct.

**Lesson:** it is better to refuse a capability than to misreport it. "We don't support yen yet"
is a limitation; "¥12" is a lie.

---

## Bug 9 — A rotting test fixture that looked like a product bug

Two tests had been failing before this session began, asserting an admin KPI showed `1` where it
rendered `0`.

The temptation is to debug the metric. Instead I **stashed all my changes, rebuilt the clean
tree, and re-ran** — the same two failures appeared, confirming they were pre-existing. Then:

```
mock backend clock: Date.parse('2026-09-12T10:00:00Z')   // hardcoded
today:              2026-09-20
age of every test row: 7.9 days
"active this week" window: 7 days
```

The stand-in backend stamped every fabricated row from a **hardcoded date**, which had silently
drifted past the seven-day window. The suite had been passing and began failing *on a date*,
not on a change.

**Fix:** `clock: Date.now() - 3 * 60 * 60 * 1000`.

Result: **18/20 → 22/22**, green for the first time.

**Lesson:** a hardcoded date in a test fixture is a time bomb with a fuse measured in days.
And: before debugging a failure, establish whether your change caused it. Stashing takes two
minutes and prevents hours of chasing someone else's bug.

---

## The operational finding that mattered more than any bug

Mid-session, every scan started falling to the weak backup reader. The reason was not in the
code:

```
LIMIT: generativelanguage.googleapis.com/generate_content_free_tier_requests
quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier
value: 20
```

**20 requests per day for the entire application.** Not per user. With a public launch planned,
visitor 21 onward would get the degraded reader — and I had already proven what that means on a
real photographed receipt (see below).

Worse, the code made it hurt more: a 429 was treated as retryable, so each scan past the cap
spent **three more units** of an allowance already at zero, and the user waited through two
backoffs. Measured: **45 seconds** before reaching the fallback, against a 60-second serverless
timeout.

**Fix:** a 429 is not one thing. Google names the limit in the error body, so a *per-day* 429 is
now non-retryable and opens a short circuit sending the next receipt straight to the fallback.
Ambiguous 429s are still retried, because wrongly disabling the good reader is the worse
mistake. Production response times afterwards: **1.5–7.7 seconds**.

**Lesson:** retry logic must distinguish *"try again in a moment"* from *"not today."* Treating
them alike turns a soft limit into an outage and triples the burn rate.

---

## How the bugs were actually found — the methods that worked

### 1. Real receipts from the public internet, not synthetic ones

I pulled genuine photographed receipts from Wikimedia Commons (CC-licensed) and ran them through
the real extractor:

| receipt | result |
|---|---|
| Swiss restaurant bill | **perfect** — CHF, 4 items, correct total |
| German Kassenbon | 0 items — **correct**, it's a donation slip with no line items |
| Dutch supermarket, photographed at an angle | **scrambled** |

That last one is the honest ceiling of the fallback reader. The OCR returned a skewed image in
*column order*, with labels and prices on separate lines:

```
"5x 0,75  BROOD SIMIT  PINAR POMPOENPITTEN 200G  Omschrijving  Datum: 26/01/2021"
"u wel en tot ziens  0,00  14,21  14,21  3,75  2,49  1,99"
```

No line parser can recover that. It needs the vision model. **This was written into
requirements as a known limitation rather than hidden** — and it's the strongest argument for
why the vision quota matters.

### 2. Testing the deployed site, not just localhost

A dedicated Playwright config pointed at the live URL. This is what caught bug 3 (mobile PDF
flattening) and gave a clean before/after:

```
production before fix: ✘ mobile PDF → image/jpeg     ✘ alpha PNG corner (0,0,0) black
production after fix:  ✓ application/pdf             ✓ corner white
```

### 3. Working around a tool limitation instead of trusting a green test

Playwright **cannot read the file part of an intercepted multipart body** — the bytes never
cross into Node. My first version of the test asserted on an empty buffer and would have passed
for the wrong reason. The fix: a `addInitScript` fetch wrapper that inspects the actual `File`
object *inside the page*, including decoding it to a canvas to sample a pixel.

**Lesson:** when a test asserts something surprising, verify the test before trusting the result.

### 4. Querying the production database as evidence

Counting rows before and after a controlled set of uploads turned "I think this is the bug" into
"this is the bug." Also surfaced a reporting inconsistency: the reach table showed 3 scans beside
a tile reading 67, because scans only began carrying a currency that day. Two numbers disagreeing
on one screen reads as a bug even when both are right — so the missing 64 were grouped under
"Before this was recorded", making the rows sum to the tile.

### 5. Rendering the real admin dashboard locally

The owner reported the admin counters were broken. I couldn't log into his admin, so I started a
local server against the **real** database with a temporary generated password hash and read the
rendered tiles:

```
scanned: 67    sent: 15    money: $1,337.26
```

The counters were working — he had been looking at data from before the bug-6 fix deployed.
**Reproducing the exact view beats arguing about it.**

---

## Final verification

| suite | before | after |
|---|---|---|
| unit | 112 | **129** |
| browser (Chromium + WebKit) | 56 | **69** |
| full-stack (real routes, stand-in backend) | **18/20** | **22/22** |
| live reader (7 formats, 4 countries) | — | all correct |
| production (deployed site) | — | **16/16** |

Live reader output, final state:

```
receipt-uk.pdf   GBP  2026-09-14   3 items  tax 119   total 714
receipt-fi.pdf   EUR  2026-09-14   3 items  tax 107   total 981
receipt-ca.pdf   CAD  2026-09-14   3 items  tax 214   total 1861
receipt-2page.pdf USD 2026-09-04  80 items            (was losing pages 2+)
```

End-to-end proof that currency survives the whole journey — asserted against what the Splitwise
API itself received, not what the app believed:

```
currency_code: GBP    cost: 11.30    shares sum back to 1130
```

---

## Transferable lessons

1. **Silent failures are the expensive ones.** Nine bugs, zero error messages. Build the
   assertion that would have caught it, not just the fix.
2. **A fixture that exercises the happy path hides bugs forever.** The Costco receipt had tax
   letters, so a bug affecting every receipt *without* them was invisible to 112 passing tests.
3. **Test on the engine where your assumption might be false.** "The decode will fail" was true
   in Chromium and false in WebKit, and the difference silently discarded user data.
4. **`[0]` on an uncounted array is a latent bug.** The plural in `ParsedResults` was the clue.
5. **Schemas must accept what you told the model it could send.** `null` is not `undefined`.
6. **Fire-and-forget on serverless is a coin flip.** The runtime freezes at response time.
7. **Distinguish "retry soon" from "not today."** Uniform retry logic turns a soft quota into an
   outage.
8. **Refuse rather than misreport.** "Yen not supported" beats "¥12".
9. **When a heuristic has a known blind spot, add a correction affordance.** Not a cleverer
   heuristic.
10. **Before debugging a failure, prove whose it is.** Stash, rebuild, re-run.
11. **Hardcoded dates in fixtures rot.** They pass until they don't, on a date.
12. **Production data is evidence; code reading is hypothesis.** Use both, in that order of
    authority.
13. **Write the limitations down.** "The fallback can't read angled photos" and "AU/NZ/SG read as
    Canada" are in `requirements.md`, not in someone's head.
14. **The biggest risk may not be a bug at all.** Nine code fixes mattered less to launch day
    than one billing setting.

---

## Stack and artefacts

**Stack:** Next.js 15 (App Router, server components), TypeScript strict, Zod, CSS modules,
Supabase (PostgREST), Vercel, Google Gemini vision, OCR.space fallback, Splitwise API,
Vitest, Playwright (Chromium + WebKit).

**Code:** 8 commits, 40 files, +2,226 / −100. Core logic: `lib/receipt.ts` (+435),
`lib/money.ts` (+88), `lib/image.ts`, `lib/metrics.ts`, `app/api/receipt/extract/route.ts`.

**New tests:** `tests/receiptJson.test.ts`, `tests/international.test.ts`,
`tests/quotaFallback.test.ts`, `tests/liveExtraction.test.ts` (opt-in, spends real quota),
`e2e/upload.spec.ts`, `e2e/deployed/deployed.spec.ts`, plus a full-stack currency journey.

**New fixtures:** a hand-built two-page 80-item PDF, a transparent PNG, UK/Finnish/Canadian
receipts, and the same receipt in JPG/PNG/WEBP/HEIC.

**Docs:** `requirements.md` §5m (FR-60…FR-66, MET-20, OPS-3, OPS-4, plus an explicit "what this
does not solve"), `userflow.md` (currency on the review screen, admin reach table).
