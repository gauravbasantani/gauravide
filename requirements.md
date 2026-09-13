# Gauravide — Requirements

*Gaurav + divide — every bill, divided fairly.*

**Status:** Planning (not built)
**Build budget:** 3 hours
**Cost budget:** $0 for everything except Splitwise API access, which now requires
Splitwise Pro (~$40–60/yr). See §4.

---

## 1. What it is

Upload a receipt → the app reads the line items → you tap who shares each item →
it does the math (tax, tip, fees) → it creates the expense in Splitwise.

Replaces the manual "type 14 items into Splitwise and argue about tax" ritual.

---

## 2. Goals / Non-goals

**Goals**
- Turn a photo or PDF receipt into an accurate, itemized Splitwise expense in under 60 seconds.
- Never make the user do arithmetic.
- Handle financial data without ever becoming a place worth hacking.

**Non-goals (v1)**
- No Walmart account connection. *There is no public API for a consumer's own Walmart
  order history — the Walmart.io APIs are for marketplace sellers and affiliates. Scraping
  the account would violate their ToS. Walmart receipts are supported the same as any
  other: upload the image or PDF.*
- No storing receipts, purchase history, or analytics.
- No payments, no bank connections, no card data. The app never touches a card number.
- No multi-currency conversion (use the receipt's currency as-is).

---

## 3. Scope for the 3-hour build

3 hours is enough for one clean vertical slice, not the whole idea. Cut line is explicit.

### MUST — ~10h35m ⚠ this is now a two-session build, see note
| # | Item | Est |
|---|---|-----|
| M1 | Splitwise OAuth2 login + fetch groups/friends | 35m |
| M2 | Upload image/PDF, send to vision model, get item JSON | 35m |
| M3 | Review & edit extracted items (fix OCR mistakes) | 25m |
| M3b | GAP fixes: total-only mode, EXIF strip/rotate, currency, duplicate warn | 35m |
| M4 | Assign people per item (tap-to-toggle avatars) | 30m |
| M4b | "+ Add person" — invite by name + email | 15m |
| M4c | "Split into N" for multi-quantity lines | 15m |
| M5b | Tax-flag extraction + reconciliation checks | 20m |
| M5 | Split math: proration + penny-exact rounding | 25m |
| M5c | Group picker, create group, membership-gap resolution | 20m |
| M5d | Split submission (group + non-group) & partial-failure handling | 20m |
| M6 | Create expense in Splitwise, show confirmation | 20m |
| M7 | History list + edit + `update_expense` | 40m |
| M8 | Option B: Supabase schema, RLS, private image bucket, server routes | 1h30m |
| M9 | Dashboard home + delete/undo/archive/restore lifecycle | 30m |
| M10 | Event tracking + admin metrics view | 45m |
| M11 | About + FAQ + feedback form & admin inbox | 30m |
| M12 | Local drafts (UX-17) + accessibility pass (UX-23…28) | 30m |
| M13 | Responsive layouts + non-breaking stress pass (UX-29…44) | 40m |
| M14 | Design system: tokens, type scale, dark mode, motion (VIS-1…15) | 45m |
| — | Deploy + security headers + smoke test | 20m |

> ⚠ **This is now ~10h35m — over triple the 3-hour budget.** It is no longer a single
> sitting. Strong suggestion: ship Session 1 (M1–M6, the split-and-push core) as a working
> app, then add the dashboard, history and lifecycle (M7–M9) in Session 2. Each half is independently useful; the cut table below
> applies to Session 1.
> The scope has grown past the budget; something has to give. Recommended cut to reach ~2h55m:
> | Cut | Saves | What you lose |
> |---|---|---|
> | M4c multi-quantity splitting | 15m | 4 bags of tomatoes split evenly, not 2/1/1 |
> | M3 inline editing | 25m | Can't fix one OCR price without retyping; escape hatch remains |
> | M5c → existing groups + No group only, no *create* group | 10m | Make the group in Splitwise first |
> | M4b invite-by-email | 15m | Everyone must already be a Splitwise friend |
> | M5d split submission (keep options 1 & 2) | 20m | Guest must be added to a group; no two-expense route |
>
> **Keep M5b (reconciliation).** Accuracy is the stated priority and those checks are what make
> the numbers trustworthy. Realistically: a 4–5 hour budget fits the full v1 without rushing
> the parts that handle money.

### WON'T (v1 — park these)
- Gmail e-receipt import (worth doing in v2; adds ~2h for OAuth scopes + HTML parsers)
- Saved history / past splits
- Editing an expense after it's created
- Multi-receipt batching
- Native mobile app

---

## 4. Stack (all free tier)

| Layer | Choice | Free limit | Why |
|---|---|---|---|
| App | Next.js (App Router) | — | One codebase, API routes keep secrets server-side |
| Host | Vercel Hobby | 100GB bandwidth/mo | HTTPS + HSTS by default, zero config |
| OCR | Gemini via AI Studio | generous daily free tier | Returns structured JSON directly — no parser to write |
| OCR fallback | Azure Doc Intelligence `prebuilt-receipt` (F0) | 500 pages/mo | Purpose-built for receipts if Gemini is flaky |
| Splitwise | REST API v3.0 + OAuth2 | **requires Splitwise Pro (~$40–60/yr)** | Official, but no longer free — see §4 |
| Storage | **None** | — | Receipt lives in RAM for one request, then is gone |
| Session | Signed, encrypted HTTP-only cookie | — | No DB = no breach surface |

### ⚠️ Does Splitwise cost anything? — YES (corrected 2026-09-11)

**Splitwise now requires an active Splitwise Pro subscription to register a third-party API
application.** Confirmed on `secure.splitwise.com/apps`, which shows:

> *"Third-party access to the Splitwise API requires an active Splitwise Pro subscription. If
> your Pro subscription lapses, your apps and their users will lose third-party API access
> until you resubscribe."*

This invalidates the earlier assumption that the integration was free. It is the single
biggest constraint on the project.

**What it means:**
- **You (the developer) need Splitwise Pro** — roughly $40–60/year; check their current pricing.
- **Your users most likely do not** — but this is unconfirmed and it decides whether the app can
  ever be shared. The wording *"if your Pro subscription lapses, your apps and their users will
  lose third-party API access"* only makes sense if user access flows from **your** subscription;
  a user's own Pro wouldn't be affected by yours lapsing.
  **Verify two ways (plan.md V0):** email Splitwise support, and test with a free second account
  once the app exists. Don't plan distribution before one of those answers arrives.
- If your subscription lapses, the app stops working for everyone.

### What the official API docs actually say (scraped 2026-09-11, dev.splitwise.com)

**Cost of the API itself: $0.** There is no per-call fee, no paid API tier. Rate limits are
*"fairly lenient, and almost no hobby integration has ever exceeded them."* The cost is entirely
the Pro subscription their registration page now requires.

**Three clauses that constrain this project:**

1. 💰 **Pro is a stated condition, not a hidden one.**
   > *"Splitwise may impose conditions on the use of the Self-Serve API, including, for example,
   > maintaining an active Splitwise Pro subscription."*
   The docs describe it as a *possible* condition; the live registration page **already imposes
   it**. Treat it as required.

2. 🚫 **Never monetisable.**
   > *"The API is not intended for commercial use… the API may not be used in connection with
   > any fee-based service."*
   Gauravide can never charge — not a subscription, not ads, not a paid tier. Commercial use
   requires a negotiated licence via `developers@splitwise.com`.

3. ⚠️ **The competing-functionality clause — the real risk.**
   > *"You may not use Splitwise Materials to create an application that replicates existing
   > Splitwise functionality or competes with Splitwise and our Services."*

   **Splitwise Pro already includes receipt scanning.** Gauravide is a free receipt scanner that
   writes into Splitwise. Two readings:
   - **Complementary** (our view): it *feeds* Splitwise, doesn't replace it. Users still need a
     Splitwise account, and every expense lands in their product.
   - **Competing** (their possible view): it reproduces a paid feature and gives it away.

   For **personal use with friends, the practical risk is ~zero.** For **public distribution it
   is real** — and the remedy is free: email `developers@splitwise.com`, describe the use case,
   and get an answer in writing before sharing the link.

**Also binding:**
- **A lawful privacy policy is mandatory**, GDPR/CCPA-compliant, and must not conflict with
  Splitwise's own. The About page (PAGE-2) must be a real policy, not a friendly paragraph.
- **They can cap users at will:** *"Splitwise may limit… the maximum number of Splitwise users
  that may connect your Application… at Splitwise's sole discretion."*
- **Branding:** you may say the app works with Splitwise, but may not *"use Splitwise's name to
  endorse or promote"*. Our disclaimer (PAGE-3) is the correct approach.
- **The docs do not say whether end users need their own Pro.** V0 stays open — ask support.

**The options:**

| # | Option | Cost | What you get |
|---|---|---|---|
| **A** | **Buy Splitwise Pro** | ~$40–60/yr | Everything in these docs, exactly as designed |
| **B** | **Build everything except the push** | Free | Scan, split, compute shares. User enters the total in Splitwise themselves |
| **C** | **Standalone ledger** — Gauravide tracks balances itself | Free | No Splitwise dependency at all; becomes an alternative, not an add-on |
| **D** | Ask Splitwise for non-commercial API access | Free if granted | Worth an email; no guarantee |

**Recommendation: build Option B first, then decide.**
Phases P1–P5 — sign-in aside — have **no Splitwise dependency**: photo → items → assignment →
per-person shares. That's ~80% of the app and the entire hard part. Only **P6 (push)** needs
Pro. Build to the end of P5 for free, see it working on your own receipts, and *then* decide
whether $50/year is worth automating the last step. Don't pay for an API before the app that
uses it exists.

Note also: Splitwise Pro includes its own receipt-scanning feature. Paying for Pro to build a
free receipt scanner is worth thinking about honestly — though Gauravide's per-item assignment
and group logic go well beyond what Pro's scanner does.

### Input sources

| Source | Status | Cost |
|---|---|---|
| Photo (JPG/PNG/HEIC/WEBP) | **v1** | Free |
| PDF receipt | **v1** | Free |
| Email import (Gmail read-only) | v2 | Free (Gmail API) |
| Walmart account connection | Not possible — no consumer purchase-history API | — |

---

> **⚠ This section is superseded in part by §9 (History & editing).** Storing split history and
> receipt images means the app *does* hold financial data. §9 sets out what that costs and the
> two ways to do it.

**Original choice — no database.** The receipt is processed in
memory and discarded. The Splitwise token lives encrypted in the user's own cookie. There
is no server-side store of anyone's financial data to leak. This is both the fastest thing
to build and the most secure thing to operate.

---

## 5. Functional requirements

### Auth
- **FR-1** User signs in with Splitwise OAuth2 (Authorization Code flow). No app-specific password.
- **FR-2** The app requests only the scopes it needs to read the user's groups/friends and create expenses.
- **FR-3** Logout clears the session cookie immediately.

### Receipt intake
- **FR-4** Accept JPG, PNG, HEIC, WEBP, PDF. Max 10 MB.
- **FR-5** Reject anything else by actual content sniffing, not by file extension.
- **FR-6** PDFs: render the first page to an image, then treat it as an image.
- **FR-7** Show a progress state while extracting; extraction should finish in under ~10s.
- **FR-8** If extraction fails or returns nothing, offer "enter items manually" — never a dead end.

### Extraction output (the contract)
```json
{
  "merchant": "Walmart Supercenter",
  "date": "2026-09-11",
  "currency": "USD",
  "items":    [{ "name": "Organic Milk", "qty": 1, "price": 5.49,
                 "taxable": true, "tax_code": "T", "confidence": 0.96 }],
  "subtotal": 42.10,
  "tax":      3.47,
  "tip":      0.00,
  "fees":     [{ "label": "Bag fee", "amount": 0.10 }],
  "total":    45.67
}
```
- **FR-9** If `subtotal + tax + tip + fees != total`, flag it visibly and let the user correct it before continuing.

### Review & assign
- **FR-10** Every extracted item is editable: name, qty, price. Items can be added or deleted.
- **FR-11** People come from Splitwise, loaded at sign-in (Screen 0) so Screen 3 never waits on a network call:
  - **FR-11a** `GET /get_groups` and `GET /get_friends` are fetched once, right after OAuth, and held in the session.
  - **FR-11b** The user picks a group (e.g. "Roommates") to prefill the people row, or builds an ad-hoc set from friends.
  - **FR-11c** Default selection: the most recently active group. Most people split with the same crew repeatedly.
- **FR-11d** **Add someone who isn't in your Splitwise yet**, without leaving the flow:
  - Inline "+ Add person" in the people row opens a sheet asking for **name + email** only.
  - If a group is selected → `POST /add_user_to_group` (accepts `email` + `first_name` for a
    not-yet-registered person). If ad-hoc → `POST /create_friend`.
  - Splitwise sends the invitation email and creates the user record. The new avatar appears
    immediately and is tappable, whether or not they have accepted yet.
  - Balances accrue against the invited record; when they accept, the history is already there.
  - *Verify at build time: whether `create_expense` also accepts `users__N__email` +
    `first_name` for unregistered people. If it does, that is a simpler fallback path than
    pre-creating the friend.*

- **FR-11e** **Email is the only identifier. There is no username lookup.**
  Splitwise exposes no public usernames and no user-search endpoint — `get_friends` returns
  only people already connected to you. Do not build, imply, or promise a "find by Splitwise
  username" feature; it cannot work. The UI asks for an email, the way Splitwise itself does.

- **FR-11f** **One field covers both cases — don't ask the user which.** When an email is
  submitted, Splitwise resolves it internally:
  | Their situation | What Splitwise does | What the user sees |
  |---|---|---|
  | Already has an account | Links the real account, notifies them | Their real name/photo appears |
  | No account yet | Creates an invited placeholder, emails an invite | Name appears with an "invited" dot |
  Same API call, same field. The app must never make the user declare which case applies —
  it doesn't know, and it doesn't need to.

- **FR-11g** **If the user doesn't know their email:** surface the Splitwise group's own
  `invite_link` (returned on the group object) as "Copy invite link" — they send it over
  WhatsApp/iMessage themselves. Zero build cost, no database, no pending-invite state of
  our own. *Verify the field name on the group object at build time.*
- **FR-12** Assign per item by toggling avatars. An item with N people assigned splits N ways evenly.
- **FR-12a** **Multi-quantity lines must be splittable into units.** A line of `qty > 1`
  (e.g. `Tomatoes 4 × $3.00 = $12.00`) shows a "Split into 4" action. Tapping it replaces the
  line with 4 independent rows of qty 1 at $3.00, each assigned normally.

  Worked example — 4 bags of tomatoes, people A B C D, 2 bags shared by A+B, 1 for C, 1 for D:
  | Row | Assigned | Cost | Result |
  |---|---|---|---|
  | Tomatoes 1 | A, B | $3.00 | A $1.50, B $1.50 |
  | Tomatoes 2 | A, B | $3.00 | A $1.50, B $1.50 |
  | Tomatoes 3 | C | $3.00 | C $3.00 |
  | Tomatoes 4 | D | $3.00 | D $3.00 |
  | | | **$12.00** | A $3.00 · B $3.00 · C $3.00 · D $3.00 ✓ |

  This deliberately adds **no new math and no new data model** — it reuses per-line even
  splitting exactly as it already works. That is why it fits the 3-hour build.
- **FR-12b** Rows created by splitting can be merged back ("undo split") and are labelled so
  the user can tell them apart (`Tomatoes (1 of 4)`).
- **FR-12c** Per-line rounding uses the same largest-remainder rule as the whole expense, so
  each split row sums exactly to its own cost and the rows sum exactly to the line total.
- **FR-12d** Weight/volume lines (`2.4 lb Bananas`) cannot be split into units. They fall back
  to even split among the assigned people. *v2: percentage shares for these.*
- **FR-13** "Assign everyone to everything" one-tap shortcut, for the common even-split case.
- **FR-14** Items with nobody assigned block submission, and are called out clearly.
- **FR-15** Live running total per person, always visible. No "calculate" button.

### Split math
- **FR-16** **Tax is allocated using the receipt's own per-line tax flags, when present.**
  Most US grocery receipts print a code beside each line (`T`, `F`, `A`, `B`, `X`…) marking
  which items were taxed. Extraction captures these, and tax is then charged only to the
  people who took *taxable* items — which is materially more accurate than spreading it
  across everyone.

  Example: A's items are all tax-exempt groceries, B bought a taxed household item.
  Flag-based allocation charges the tax to B alone. Flat proration would wrongly bill A.

- **FR-16a** **Fallback:** if the receipt prints no per-line flags, or they can't be read with
  confidence, prorate tax by each person's share of the **taxable subtotal** (or the plain
  subtotal if taxability is unknown). Tell the user which method was used, in one line.
- **FR-16b** Tip and fees always prorate by share of subtotal — they have no taxability concept.
- **FR-16c** Receipts with multiple tax lines (`Tax 1`, `Tax 2`) are summed and allocated together
  in v1. *v2: per-rate allocation.*
- **FR-16d** **No location-based tax lookup — ever.** The printed tax on the receipt is ground
  truth and is always used as the total to allocate. Deriving a rate from ZIP or geolocation
  would be an estimate competing with a known-correct number, and US rates vary by
  state/county/city/district with item-level exemptions. Location is not used, and no
  geolocation permission is requested.
- **FR-17** All money is handled in integer cents. No floats anywhere in the math.
- **FR-18** Rounding: distribute by largest-remainder so that the shares sum to the total **exactly**.
  Any leftover cents go to the payer. Splitwise rejects expenses whose shares don't sum to the cost.
- **FR-19** The payer defaults to the logged-in user and is changeable.

### Destination group
- **FR-19a** Before submitting, the user chooses **where** the expense lands. Three options,
  all supported by the API at no cost:
  | Option | API |
  |---|---|
  | An existing Splitwise group | `create_expense` with that `group_id` |
  | No group (personal / friend-to-friend) | `create_expense` with `group_id: 0` |
  | A brand-new group | `create_group` first, then `create_expense` with the new id |
- **FR-19b** **Smart default — this must not become an extra step.** The destination is
  pre-selected and shown as a single line on the confirmation screen, not as a new screen:
  - If the user picked a group on Screen 3, that group is the default.
  - If they built an ad-hoc set, rank groups by how well their members match the selected
    people. An exact member match is pre-selected automatically.
  - No confident match → default to **No group**.
  For the common case this costs **zero extra taps**; changing it costs one.
- **FR-19c** **List every candidate group, each annotated with its membership gap.** Don't show
  only one suggestion. Show all groups containing the split's people, and under each, state
  plainly who is missing from it. The user picks with full information.

### Worked scenarios

**Scenario 1 — everyone is already in Splitwise.**
A, B, C, D are existing friends. Receipt uploaded, items divided among the four.
At the confirm step the app finds the group(s) containing all four and pre-selects the best
match (`✓ all 4 members`). One tap to submit. Done — a single expense in that group.
- If several groups contain all four, list them all, pre-select the most recently active.
- If no group contains all four, default to **No group**, with create-new one tap away.

**Scenario 2 — a new person (E) is added on the spot.**
A, B, C, D are existing; E is invited by email during Screen 3 (FR-11d). Items are split
among all five. Now no existing group contains E. The app lists the groups and labels the
gap under each:

```
 ● Roommates          4 of 5 · E not in this group
 ○ Apartment 4B       4 of 5 · E not in this group
 ○ No group
 ＋ Create new group
```

- **FR-19f** For a group with a membership gap, offer **three** resolutions, all explicit:
  | # | Choice | Result |
  |---|---|---|
  | 1 | **Add E to this group** (`add_user_to_group`) | One expense, all 5, in that group |
  | 2 | **Create a new group** with all 5 | One expense, all 5, in the new group |
  | 3 | **Split the submission**: group expense for A–D, **non-group** expense for E | Two expenses |

- **FR-19g** **Option 3 exists for a real reason** — a one-off guest the user doesn't want
  permanently added to "Roommates". It creates two Splitwise records:
  - a group expense covering A–D's shares, and
  - a non-group (`group_id: 0`) expense between the payer and E, for E's share only.
  - The payer appears in both. `group expense + non-group expense == receipt total`, exactly.
  - Both descriptions are tagged so they're recognisable as one receipt, e.g.
    `Walmart Supercenter (1 of 2)` / `(2 of 2)`.

- **FR-19h** **Partial-submit safety (option 3 only).** Two API calls are not atomic. If the
  first succeeds and the second fails, the user must be told precisely what exists and what
  doesn't — *"The group expense was created. E's expense failed."* — with a retry for only the
  missing half. Never retry the whole thing blindly; that double-charges the group.
  Reconciliation check 3 (ACC-3) runs across **both** records combined.

- **FR-19i** Whichever route is chosen, the sum of everything created equals the receipt total
  to the cent. This is enforced, not assumed.
- **FR-19d** **Creating a group is a persistent, outward-facing action** — it appears in every
  member's Splitwise and may notify them. Require a name and an explicit confirm. Pre-fill the
  name from the merchant or the members' first names as a suggestion, never silently.
- **FR-19e** Groups created here include exactly the people in the current split.

### Submit
- **FR-20** Create one Splitwise expense with the receipt's merchant + date as description.
- **FR-21** Show the per-person breakdown on a confirmation screen with a deep link to Splitwise.
- **FR-22** Idempotency: a submit token prevents a double-tap creating two expenses.
- **FR-23** On API failure, keep all the user's work on screen and offer retry. Never lose their assignments.

### Split modes, payers, and real-life cases (added 2026-09-12)

*Raised by Gaurav after reviewing commit 7133e02: "all edge cases to split A, B, C, D, E — that
tomato one — and sometimes two people paid the receipt, or someone is splitting a friend's
receipt; same structure as Splitwise: paid by who, divide equally, etc."*

- **FR-24** **Four split modes, same as Splitwise**, chosen on the split screen and switchable
  without losing anything:
  | Mode | What the user does | Math |
  |---|---|---|
  | By item (default) | Taps who had each line | Per-line even split + tax by flag (FR-16) |
  | Equally | Ticks who is in | `allocate(total, 1 each)` over the ticked people |
  | By shares | − / + shares per person (a couple = 2) | `allocate(total, shares)` |
  | Exact amounts | Types what each owes | Must sum to the total exactly; remaining shown live |
- **FR-25** **Several payers.** "Who paid?" offers *One person* (default: you) or *Several
  people* with an amount each. Payments must sum to the total to the cent; the remaining amount
  is shown live. Each payer's `paid_share` goes to Splitwise as-is.
- **FR-26** **A payer who had nothing is still on the expense** with owed 0 (e.g. "I paid, I
  didn't eat"). Anyone with paid = 0 and owed = 0 is left off.
- **FR-27** **A friend's receipt.** You can log a bill someone else paid, including one you
  weren't part of. If it is a non-group expense without you, warn that Splitwise may require a
  group, and show Splitwise's own refusal text if it does.
- **FR-28** **Settle-up preview.** The confirm screen, the saved split, and the success screen
  show each person's share, what they paid, their net ("gets back" green / "owes" orange,
  Splitwise's colours), and the simplest transfers ("Maya pays Gaurav $30.00").
- **FR-29** **One calculation everywhere.** `planSplit()` in `lib/split.ts` is used by the
  split screen, the confirm screen, and the submit route, so the preview can never differ from
  what reaches Splitwise.
- **FR-30** **Worked example (tested in `tests/plan.test.ts`).** People A–E. Tomatoes ×4 at
  $12.00 split into units: 2 bags A+B, 1 bag C, 1 bag D; wine $25.00 shared by all five. A paid
  $20.00, E paid $17.00. Shares: A $8, B $8, C $8, D $8, E $5. Net: A +$12, E +$12, B/C/D −$8.
  Transfers: B→A $8, C→A $4, C→E $4, D→E $8.
- **FR-31** **The "who's splitting" step explains itself.** Step 3 opens with *Add everyone on
  this bill* and a one-line why (only added people can be given items or marked as payer). When
  signed in, you are added automatically and pre-selected as payer. Removing a person removes
  them from items, shares, exact amounts and payers.

### Per-item splits, outside payers, groups (added 2026-09-12, second pass)

*Raised by Gaurav from live screenshots: "what about the individual item split? paid by who — me
or someone else from Splitwise? if I want to create a new group — make good decisions, cool UI,
add copy where needed, easy to use and understandable."*

- **FR-32** **Split one item unevenly.** Every line on the split screen has "Split unevenly",
  opening a sheet: *Equally* (tick who had it), *By shares* (2 : 1), or *Exact* (amounts that
  must add to the line price, remaining shown live). The line shows a chip such as
  "Gaurav ×2 · Alex ×1". Tapping faces on that line afterwards returns it to an even split. The
  line's tax follows the same weights (`itemParts()` in `lib/split.ts`).
- **FR-32a** Quantity lines can also be split into units from that sheet ("Split into 4 lines");
  each new unit starts with whoever had the whole line.
- **FR-33** **Someone else paid.** "Who paid?" lists people in the split plus "Someone else
  paid", a search over Splitwise friends. The chosen friend is added to the expense as payer and
  owes nothing unless given items (they are excluded from Equally and get 0 shares).
- **FR-34** **Groups picker.** A compact radio list: best matches first with member count and
  who is missing, a "Best match" badge, top 3 then "Show N more", then *No group*, then
  *Create a new group* (always available, not only when someone is missing) with a pre-filled
  name and "With Gaurav, Maya" copy.
- **FR-35** **Readable item names.** Register numbers and decoration are stripped on arrival
  ("512599 \*\*KS TOWEL\*\*" → "KS TOWEL"); a bare negative line becomes "Discount · SNAPS".
- **FR-36** **Review screen** is three numbered sections (Where and when · Items · Tax, tip and
  fees), each with one line of why; item rows are name + chips | price | remove; the totals
  panel states whether it adds up to the receipt.
- **FR-37** **Running totals while incomplete** show item amounts only, labelled "So far". Tax is
  not spread across people who have no items yet (the screenshot showed $3.09 before any tap).

### Saved split page, photo, editing, sign-in (added 2026-09-12, third pass)

*Raised by Gaurav: "after review, when adding people, a button to sign in to Splitwise to add
people — easier. After sending, the receipt is on the dashboard; opening the split shows the
receipt photo, who paid whom, the items below with who split them, and I can edit that
transaction."*

- **FR-38** **Receipt photo kept with the saved split.** The prepared (EXIF-stripped) photo is
  held in IndexedDB during the flow — it survives a refresh and the sign-in round trip — and
  uploaded after Splitwise accepts the expense to a **private** Supabase Storage bucket
  (`receipts`, created on first use) at `<owner>/<splitId>.<ext>`. It is served only through
  `GET /api/splits/[id]/image` after an ownership check; JPEG metadata is stripped again
  server-side; PDFs are not kept. Removing the dashboard copy removes the photo.
- **FR-39** **Edit a saved split.** "Edit split" on the split page rebuilds the draft
  (`draftFromSplit`) and reopens the flow at *Check the items* with an "Editing …" banner.
  Everything is editable — items, people, per-item splits, who paid, group. Saving calls
  Splitwise `update_expense/{id}` (which replaces all shares) and updates the same row, so
  nothing is duplicated. The group it lives in stays selected. Split settings (tax lines,
  included, shares, exact amounts) are stored from now on so an edit reopens exactly; older
  equal/shares rows reopen as exact amounts, which reproduces what was sent to the cent.
- **FR-40** **Sign in from the people step.** Signed out, step 3 leads with "Sign in with
  Splitwise to add friends" (returns to `/new`, draft restored). Names typed before signing in
  show a **Link** button to pick the matching Splitwise friend; every item, share, exact amount
  and payment moves to the friend.
- **FR-41** **Split page layout.** Summary (merchant, date, group, mode, paid by, you lent /
  borrowed) · receipt photo beside *Who paid* and *Who owes what* with settle-up transfers on
  desktop, stacked on phones · every item with avatars and how it was shared ("You · Alex ·
  $6.00 each", "You ×2 · Alex ×1") · Edit split / Open in Splitwise at the top · archive and
  delete below. Rows with a photo show 📷 on the dashboard.

### Discounts follow their item; server/client crash (added 2026-09-12, fourth pass)

*Raised by Gaurav from a live test: "snaps are assigned to Mayur and the discount is on snaps —
will that person automatically get the discount? And after clicking Done, why this error?"*

- **FR-42** **A discount follows the item it discounts.** A negative line nobody has assigned
  takes the people (and any uneven split, as proportions) of its item: matched by a shared word
  ("Discount · SNAPS" → "HVST SNAPS"), else the line directly above. The row shows
  "↳ Follows HVST SNAPS". Tapping a face on the discount gives it its own assignment. The same
  rule drives the preview, the submit payload and the saved split (`effectiveAssignments()`).
- **GAP-28** **"Something went wrong" after Done.** The dashboard and split page (server
  components) called `colourOf`/`initialsOf` exported from `AvatarToggle.tsx`, a `'use client'`
  module; on the server those exports are client references and calling them throws. They now
  live in `lib/avatar.ts`, and `tests/boundaries.test.ts` fails the build if any server file
  calls a function exported from a `'use client'` module again.

### Gaps closed by the 2026-09-12 review

- **GAP-24** Assignments were keyed by row position; removing or splitting a row after
  assigning silently moved people onto the wrong items. Items now carry a stable `id`;
  assignments are keyed by it; drafts moved to `v2`.
- **GAP-25** Duplicate expense after success + refresh. The draft now stores `submitKey` and
  `submittedExpenseId`; a restored draft shows the success screen. The server also checks
  `data->>idempotencyKey` in `splits` so a retry on another serverless instance returns the
  original expense.
- **GAP-26** Weight lines (2.5 lb) offered "Split into 2". Only whole quantities 2–50 can be
  split into units.
- **GAP-27** Splitwise answers many failures with 200 + `errors`. These are now shown to the
  user ("Splitwise didn't accept it: …") instead of "Couldn't reach Splitwise".

### Visual direction (added 2026-09-12)

*Gaurav pointed to https://finta.ai and https://www.finta.io as the look to aim for, and to
Splitwise's own group/friend screens for list structure.*
- Calm, spacious, centred hero; small pill badge; bold short headline; one dark primary CTA
  plus an outlined secondary; soft sun-ray gradient; a real product mockup instead of
  illustration; quiet bordered cards with icon + title + one line.
- Lists follow Splitwise: month headings, a date column, an icon tile, a "You paid $X" subline,
  and a right-hand "you lent / you borrowed" amount in green / orange.
- Steps never render as four cramped columns: 1 column on phones, 2×2 on tablets, 4 across on
  desktop. Progress labels wrap rather than truncate.

---

## 5b. Accuracy requirements

This app divides real money. A wrong number is a worse failure than a crash — a crash is
visible, a wrong split is silently trusted and paid.

- **ACC-1 The receipt is the only source of truth.** Every figure used in the math comes from
  the printed receipt. Nothing is estimated, inferred from location, looked up from an
  external rate table, or "helpfully" recalculated.
- **ACC-2 Integer cents everywhere.** No floating-point money at any point — not in
  extraction parsing, not in proration, not in display formatting. Parse to cents on the way
  in, format to currency only at render time.
- **ACC-3 Three reconciliation checks, all enforced before submit:**
  | # | Check | On failure |
  |---|---|---|
  | 1 | `sum(line items) == subtotal` | Flag the gap, highlight low-confidence lines, require the user to fix |
  | 2 | `subtotal + tax + tip + fees == total` | Same — show which component is off |
  | 3 | `sum(per-person shares) == total` | Hard block. Never submit; this is a code bug, not user error |
- **ACC-4 Never silently auto-correct.** If extraction is internally inconsistent, surface it
  and let the user decide. Quietly adjusting a price to force a total to balance is the single
  worst thing this app could do.
- **ACC-5 Per-field confidence.** The vision model returns a confidence per field; anything
  below threshold is visually highlighted on the review screen so the user's attention lands
  on the likely error instead of all 14 lines equally.
- **ACC-6 Sanity bounds, no external data needed.** Reject/flag physically implausible
  extractions: negative prices, tax > 25% of subtotal, any item > total, total ≤ 0. These
  catch decimal-point OCR errors (`$5.49` read as `$549`) at zero cost and with no
  location service.
- **ACC-7 Show the user the check passed.** The confirmation screen displays
  `✓ matches receipt` only when checks 1–3 all pass. Earned trust, not decorative.
- **ACC-8 Discounts, coupons and negative lines** are extracted as negative items and included
  in the math; they must not be dropped. A dropped coupon silently overcharges everyone.
- **ACC-9 Rounding is deterministic.** Largest-remainder, with leftover cents to the payer.
  The same receipt and assignment always produce the same split.

---

## 5c. History, editing, and re-pushing to Splitwise

Requested: keep every split we make, along with the receipt image and item detail, so a
transaction can be reopened, edited, and pushed to Splitwise again as an update.

**This is feasible, and Splitwise supports it** — `POST /update_expense/{id}` edits an existing
expense, and `delete_expense` removes one. Storing the returned `expense_id` at submit time is
what makes a later update possible.

**But it reverses the app's core security decision.** Until now nothing was stored, so there
was nothing to breach. With history, the app holds receipt images and itemised spending —
genuinely sensitive financial records — and becomes a target worth attacking. That's not a
reason to refuse it; it's a reason to choose the storage model deliberately.

### Two ways to do it

| | **Option A — On-device history** | **Option B — Server-side history** |
|---|---|---|
| Where | IndexedDB in the user's own browser | Postgres + object storage (Supabase free tier) |
| Receipt images | Stored locally as blobs | Uploaded to a bucket |
| Server holds financial data | **No** | **Yes** |
| Works across devices | No — one browser only | Yes |
| Survives clearing site data | No | Yes |
| Breach surface | Effectively none | Real; needs a proper security review |
| Build cost | **~40m** | **~2–3h on top of everything else** |

**Originally recommended Option A for v1**, but cross-device history has since been requested
(see below), which requires Option B. Option A remains the fallback if the budget won't stretch.

**Why Option A was recommended:** It delivers the whole user-visible feature — see past
splits, reopen one, edit it, push the update to Splitwise — while keeping the property that
there is no server-side store of anyone's receipts. Option B is the right v2 once
cross-device history is actually wanted, and it deserves its own security pass.

### Choosing the database (Option B)

You want to see every bill you've split, from any device. That means Option B — a real
server-side store. Free options that are genuinely secure:

| Service | Free tier | Files/images | Per-user isolation | Catch |
|---|---|---|---|---|
| **Supabase** (Postgres) | 500 MB DB, 1 GB storage | ✅ built-in | ✅ **Row Level Security** | **Pauses after ~7 days idle** |
| **Cloudflare D1 + R2** (SQLite) | 5 GB DB, 10 GB storage | ✅ R2 | ⚠️ app-enforced | Never pauses. Most wiring |
| **Firebase** (Firestore + Storage) | 1 GB, 50k reads/20k writes per day, 5 GB files | ✅ built-in | ✅ Security Rules | NoSQL; metric aggregation is awkward and read-costly |
| **Neon** (Postgres) | ~0.5 GB | ❌ | ✅ RLS | Auto-suspends but **auto-resumes** — no manual unpause |
| **Turso** (SQLite) | 5 GB, 500 DBs | ❌ | ⚠️ app-enforced | Need separate image storage |
| **MongoDB Atlas M0** | 512 MB | ❌ | ⚠️ app-enforced | No pause; document model |
| ~~PlanetScale~~ | — | — | — | **Free tier discontinued** |
| ~~Render Postgres~~ | — | — | — | **Free databases expire** |

**Why Supabase leads:** It's the only one giving Postgres + private file storage +
**Row Level Security** in a single free tier. RLS matters more than anything else here: user
isolation is enforced *by the database*, so a bug in application code can't leak one person's
receipts to another. On a financial app that's the difference between a mistake and a breach.

**The pause, and why it isn't a reason to switch.** A free project pauses after ~7 days with
zero requests — data intact, one click in the dashboard to restore. **Solved by pinging it once
a day**: a `/api/health` route plus a daily Vercel cron (Hobby allows one, which is exactly
enough). Any request resets the idle timer, so it never pauses. Ten minutes of work in P7.

- **DB-8** `/api/health` runs the cheapest possible query and is hit daily by cron (GAP-14).
- **DB-9** If the database is unreachable regardless, show *"Waking up — try again in a
  moment"*, never a raw error, and preserve the in-progress split (UX-17).

**Firebase** is a legitimate third choice if you already know it — Security Rules give real
per-user isolation and storage is built in. The reason it isn't the recommendation: money math
wants SQL, and the admin metrics (§5d) are aggregate counts, which Firestore charges per
document read to compute. In Postgres that's one cheap query.

### Where to host the app itself (also free)

| Host | Free tier | Notes |
|---|---|---|
| **Vercel Hobby** | 100 GB bandwidth/mo | Best Next.js fit; HTTPS + HSTS default. **Non-commercial use only** — needs Pro if you ever monetise |
| **Cloudflare Pages / Workers** | Very generous, no cold starts | Excellent, especially paired with D1 + R2 |
| **Netlify** | 100 GB/mo | Fine; slightly more friction for Next.js server routes |
| **Render** | Free web service | **Spins down when idle** — slow first request |

**DECIDED: Vercel + Supabase**, with the daily keep-alive cron above. The alternatives were all
trade-downs once the pause is a ten-minute fix rather than a permanent constraint.



**Is a free tier actually secure?** Yes — encryption at rest, TLS in transit, and RLS are all
on the free tier, not paywalled. Security here depends on how it's configured, not what it
costs.

### Option B implementation spec

- **DB-1** Tables: `splits` (receipt metadata, totals, payer, group, splitwise expense ids),
  `split_items` (name, qty, price in cents, taxable), `split_shares` (person, item, cents).
  All money in integer cents (ACC-2).
- **DB-2** Every table carries an `owner_id` = the Splitwise user id of the uploader.
- **DB-3** **RLS enabled on every table, default deny.** No table is ever left open.
- **DB-4** Identity bridge: auth is Splitwise OAuth, not Supabase Auth. For v1, all DB access
  goes through server-side API routes that check ownership against the session cookie; the
  service key never reaches the browser. RLS stays on as a deny-all backstop.
  *v2: mint a scoped JWT so RLS enforces ownership directly.*
- **DB-5** Receipt images go in a **private** bucket. Access only via short-lived signed URLs
  (≤ 60s). Never public, never a guessable path.
- **DB-6** Compress images client-side before upload (target ≤ 300 KB). At that size the 1 GB
  free tier holds roughly 3,000 receipts.
- **DB-7** No secrets in the browser: only the anon key may ever be exposed, and only if RLS
  is proven correct. Prefer server routes and expose nothing.

### Dashboard and lifecycle requirements

- **DASH-1** **The dashboard is the home screen** after sign-in — a list of every transaction
  split in the app, most recent first: merchant, date, total, people, destination group.
- **DASH-2** A single prominent **"New receipt"** action offering three inputs: take a photo,
  upload an image, upload a PDF. This is the entry to the existing flow (Screens 1→5).
- **DASH-3** On successful push, the new transaction appears at the top of the dashboard
  immediately — no refresh, no separate confirmation to dismiss first.
- **DASH-4** Each row shows its Splitwise link status: *in Splitwise* / *removed from
  Splitwise, kept here* / *archived*.
- **DASH-5** Tapping a row opens it for viewing or editing (HIST-3, HIST-4).

### Delete, undo, and archive

Deleting touches two independent systems, and the app must never conflate them.

- **DEL-1** Deleting offers two explicit choices, never a single ambiguous "Delete":
  | Choice | Effect in web app | Effect in Splitwise |
  |---|---|---|
  | **Remove from here** | Moved to Archive | **Untouched** — expense stays |
  | **Delete everywhere** | Moved to Archive | `delete_expense` called |
- **DEL-2** **Nothing is ever hard-deleted on the first action.** Both choices soft-delete to
  an Archive (`archived_at` timestamp). Permanent deletion is a separate, explicit action from
  inside the Archive.
- **DEL-3** **Undo window: 30 seconds.** A toast — *"Deleted. Undo"* — with a visible countdown.
- **DEL-4** **The Splitwise deletion is deferred for the undo window, not undone afterwards.**
  For 30 seconds no API call is made; if the user taps Undo, nothing ever happened in
  Splitwise. This is deliberately better than deleting immediately and trying to restore.
- **DEL-5** If the tab is closed during the undo window, attempt to flush the pending
  deletion on `visibilitychange`/`beforeunload`. **If the flush fails, the expense simply
  stays in Splitwise** — the failure direction must always be "nothing was destroyed".
  The dashboard then shows the row as *archived, still in Splitwise* so the state is never a
  lie. *Verify at build time whether `undelete_expense` exists as a belt-and-braces restore.*
- **DEL-6** **Archive is permanent until the user says otherwise** — restorable at any time,
  with no automatic purge. "Restore anytime" means anytime.
- **DEL-7** Restoring from Archive returns the transaction to the dashboard. If it had been
  deleted from Splitwise, restoring offers to **re-create** it there (a new `expense_id` is
  stored) — and says plainly that it will be a new expense, not the original.
- **DEL-8** Two-expense submissions (FR-19g) delete, undo, and restore as **one unit**. Never
  leave half a receipt in Splitwise.
- **DEL-9** Deleting is never silent: every outcome reports what happened in both systems.

### Requirements (either option)

- **HIST-1** On successful submit, persist: receipt image, extracted items, per-person
  assignments, computed shares, payer, destination group, timestamp, and the Splitwise
  `expense_id`(s) returned.
- **HIST-2** A history list shows past splits, most recent first: merchant, date, total, people.
- **HIST-3** Opening one restores the full editable state — items, assignments, the original
  receipt image for reference.
- **HIST-4** Editing and re-submitting calls `update_expense` on the stored `expense_id`,
  rather than creating a duplicate.
- **HIST-5** `update_expense` **replaces** the expense's shares wholesale. Always send the
  complete recomputed share set, never a partial patch.
- **HIST-6** All ACC-3 reconciliation checks re-run on an edit. An edited split must still sum
  to the receipt total exactly.
- **HIST-7** Two-expense submissions (FR-19g) store both ids and update both together, with the
  same partial-failure reporting as FR-19h.
- **HIST-8** If the expense was deleted or altered inside Splitwise since we wrote it, detect
  the failure and offer to re-create rather than silently failing or duplicating.
- **HIST-9** Deletion, undo, and archive behaviour is specified in DEL-1…DEL-9 above.
- **HIST-10** The landing-page privacy line must change to match reality. If history is on,
  *"nothing is stored"* becomes false — say instead what is stored and where
  (e.g. *"Your splits are saved on this device only"*). Honest copy is a requirement, not polish.

### Additional security requirements if Option B is chosen

- **SEC-21** Receipt images are private by default; access scoped per-user at the storage layer
  (row-level security), never a public or guessable URL.
- **SEC-22** Encryption at rest for both the database and the image bucket.
- **SEC-23** A stated retention policy and a working "delete everything" action. Holding
  receipts indefinitely with no delete path is not acceptable for financial documents.
- **SEC-24** The Splitwise token still never goes in the database — cookie only.
- **SEC-25** Server-side authorization on every history read/write. A user must not be able to
  fetch another user's split by guessing an id.

---

## 5d. Admin metrics (superuser view)

A separate, access-controlled view showing **how the app is being used — never what anyone
bought.**

### The privacy boundary (non-negotiable)

| Admin **can** see | Admin **cannot** see, ever |
|---|---|
| Number of users, active users, retention | Any receipt image |
| Transactions per user (a **count**) | Merchant names, item names |
| Timing, success/failure rates | Amounts, totals, who owes whom |
| Feature usage rates | Participant names or emails |
| Error counts by type | Any group names |

- **MET-1** Metrics are computed from a dedicated `events` table that **never contains
  financial content**. Events carry: event name, opaque user id, timestamp, and small
  non-identifying properties (e.g. `item_count: 14`, `edited: true`). No merchant, no prices,
  no names.
- **MET-2** Users are identified by an **opaque internal id**, not email. Email appears nowhere
  in the admin view. *(Recommended default; if you ever need it for support, make it a separate
  explicitly-audited lookup.)*
- **MET-3** **No per-user monetary figures.** Aggregate money stats across all users (e.g.
  median receipt total) are optional and your call — but "user 7f3a has split $4,200" is
  surveillance of one person's finances, and the boundary above says no. Recommendation:
  leave money out entirely.
- **MET-4** The admin view is aggregate-first. Per-user rows show counts and dates only.
- **MET-4a** *(2026-09-12)* Per-user labels are a keyed HMAC of the Splitwise id (derived from
  `SESSION_SECRET`), not a plain hash — numeric ids are trivially brute-forced. Admin queries
  select narrow columns only and read up to 10,000 rows, flagging when that cap is hit. The
  feedback inbox (messages people chose to send, with an optional reply address) is shown
  deliberately and labelled as such.

### Admin dashboard (added 2026-09-12)

*Gauravide's goal from Gauravide's developer: "how many people used it, how many receipts,
how much amount … how good metrics data I can get, and I will feel good that I saved their
time with this application."*

- **MET-19** Every sent split records non-identifying counts: `itemCount`, `peopleCount`,
  `payerCount` and the Splitwise ids of participants (in the split row), and `items`/`people`
  counts in the `split_submitted` event. Failed reads record a `receipt_failed` event (reason
  type only).
- **MET-20** The dashboard (range: 7 days · 30 days · all time) shows:
  | Section | Numbers |
  |---|---|
  | Impact | Time saved (estimate, formula shown), splits sent, people involved, minutes per receipt |
  | Headline | People who used it (signed-in + signed-out browsers), receipts scanned + % that reached Splitwise, splits sent + edits, money split per currency (+ average receipt) |
  | More | New accounts, active in 7 days, came back (2+ splits), people in their splits, items split |
  | Activity | Daily receipts scanned vs sent, last 7/30 days, hover values, table view |
  | Habits | Split mode mix; % several payers, in a group, uneven item splits, photo kept |
  | Reader | Read automatically / backup reader / couldn't read |
  | How often | Active this week / month, come back each week (weekly ÷ monthly active), splits per person, typical gap between one person's splits (median), time saved per person, accounts by 1 / 2–3 / 4–9 / 10+ splits |
  | Time saved each week | Minutes saved per week for the last 8 weeks, hover values, table view |
  | Accounts | Keyed pseudonym, first/last seen, receipts, splits — counts and dates only |
- **MET-21** **Time saved model** (conservative, shown on the page): by hand ≈ 2 min + 15 s per
  item + 45 s per person; in Gauravide ≈ 1 min; minimum 30 s per receipt. Splits sent before
  counts were recorded assume 6 items and 2 people, and the page says how many did.
- **MET-22** All numbers come from `computeMetrics()` in `lib/metrics.ts`, a pure function with
  unit tests; money is never summed across currencies.

### Metrics worth having

**Adoption**
- **MET-5** Total users; new users per day/week.
- **MET-6** Active users (7-day, 30-day).
- **MET-7** Retention: % who split more than once — the honest measure of whether it's useful.
- **MET-8** Per-user table: opaque id, signup date, last active, **total transactions**.

**Usability — does it actually feel simple?**
This is the set that answers your real question. Counting users tells you nothing about ease.
- **MET-9** **Median time from upload to submit.** The single best proxy for "convenient".
  Target under 60 seconds.
- **MET-10** **Drop-off by screen.** Where people abandon is where the design is failing.
- **MET-11** **% of receipts needing manual item edits** — a direct measure of OCR quality.
- **MET-12** **% using "everyone shares everything"** — tells you whether the fast path fits
  the common case.
- **MET-13** Feature usage rates: split-into-N, invite-a-person, create-group, non-group
  expense, the two-expense guest route.
- **MET-14** **Undo rate on delete.** A high rate means the delete dialog is confusing people,
  not that they're clumsy.
- **MET-15** Edit rate on past transactions — how often the first split was wrong.

**Reliability**
- **MET-16** Extraction failure rate; Splitwise API error rate by type.
- **MET-17** **Reconciliation failure rate** (ACC-3 check 3). This should be *zero*. Any
  non-zero value is a money bug and should be alerted on, not merely charted.
- **MET-18** Partial-submit failures (FR-19h) and undo-flush failures (DEL-5).

### Access control

- **SEC-26** Admin access is an explicit allowlist of Splitwise user ids in a server-side env
  var. Not a role column a bug could flip, not a query param.
- **SEC-26a** *(2026-09-12, requested by Gaurav: "admin should have a login with my username and
  password")* A second way in: `/admin/login` with a username and password belonging to the
  developer only. The password is never stored — `ADMIN_PASSWORD_HASH` is a salted scrypt hash
  (`npm run admin:password` makes it; `ADMIN_USERNAME` holds the username). Success sets an
  encrypted, HttpOnly, SameSite=Strict cookie that expires after 8 hours, keyed separately from
  the user session. Refused attempts get one generic message after a short delay; 5 attempts
  per network per 15 minutes, 30 per hour overall. `/admin` redirects to the sign-in page when
  not authorised; both pages are `noindex`. The Splitwise allowlist still works.
- **SEC-27** Admin routes are a separate namespace with their own authorization check on every
  request, and they query **only** the events table — they have no code path to receipts,
  items, or shares.
- **SEC-28** Admin views are read-only. No admin action can modify or delete user data.
- **SEC-29** Admin access is logged.
- **SEC-30** Disclose analytics in the privacy copy: anonymous usage statistics are collected,
  receipt contents never are.

---

## 5e. About, FAQ, and Contact

Three static-ish pages reachable from the dashboard footer. Small, but they carry real weight:
this app asks people to upload financial documents, so "who made this and what happens to my
data" needs an answer that isn't a shrug.

### About

- **PAGE-1** Plain explanation: what **Gauravide** does, the four-step flow, that it's free.
  The name is *Gaurav + divide* — worth a single light line on the About page; people enjoy
  knowing where a name came from, and it makes the product feel made by a person.
- **PAGE-2** **Data handling stated plainly** — what's stored, where, who can see it, that
  receipt contents are never in analytics, and how to delete everything. Repeat it here in full
  rather than linking away; this is the page people check before trusting the upload button.
- **PAGE-3** **Affiliation disclaimer, required:** *"Not affiliated with, endorsed by, or
  sponsored by Splitwise. Splitwise is a trademark of its owner."* The app uses their name,
  their API, and their brand colour space — the disclaimer is not optional.
- **PAGE-4** Name the third party that processes receipt images (the vision provider), since
  that's the one place receipt content leaves the app.

### FAQ

- **PAGE-5** Seed content, answering what people will actually ask:
  | Question |
  |---|
  | Do I need Splitwise Pro? — **You don't. The developer does** (API access requires it) |
  | Is my receipt stored? Where? Who can see it? |
  | Can I split with someone who isn't on Splitwise yet? |
  | How is tax split? Why didn't everyone pay the same tax? |
  | Can I connect my Walmart/Amazon account? — No, and why not |
  | What if the scan reads a price wrong? |
  | If I delete here, does it delete in Splitwise? |
  | Can I get something back after deleting it? |
  | Why did one receipt create two Splitwise expenses? |
  | Is this free? Will it stay free? |
- **PAGE-6** Plain answers, no marketing voice. Several of these exist because the honest
  answer is "no" — say so directly rather than burying it.

### Branding

- **PAGE-7** Product name: **Gauravide**. Tagline: *every bill, divided fairly.*
- **PAGE-8** Pronounced *gau-ra-vide*. Use it as one word, never hyphenated or camel-cased.
- **PAGE-9** The name must not visually or verbally echo Splitwise (see PAGE-3). "Gauravide"
  is clean of that, and nothing in the UI should reintroduce the resemblance — no "-wise"
  wordmark, no imitation of their logo or colour palette.
- **PAGE-10** Check the domain and run a trademark search before any public launch.

### Contact / feedback

- **FB-1** One form, four categories: **Bug · Suggestion · Question · Other**.
- **FB-2** Fields: category, message, and an optional "how to reach you". Nothing else —
  the user is already signed in, so identity is known.
- **FB-3** **Sign-in required.** This removes the spam problem without CAPTCHAs, and means
  a report can be tied to an account when debugging.
- **FB-4** Feedback is stored in its own `feedback` table — **separate from both `events`
  and any user financial data.** It appears in the admin view as its own inbox.
- **FB-5** A "include diagnostic info" checkbox, **off by default**, attaching only
  non-financial context (browser, app version, last error code, the screen they were on).
  Never the receipt, never item data. Say exactly what it attaches, next to the checkbox.
- **FB-6** Warn inline: *"Please don't paste receipt contents or personal financial details."*
- **FB-7** Confirm on submit, with a reference id. If a reply address was given, say whether
  to expect a reply.
- **FB-8** A simple status on the admin side — new / read / actioned. No threading in v1.
- **FB-9** Rate-limit submissions per account (e.g. 5/hour).
- **FB-10** **Feedback text is untrusted user input.** Escape on render in the admin view;
  never `dangerouslySetInnerHTML`. A stored-XSS hole in an admin panel is the worst place
  to have one.
- **FB-11** No email service needed in v1 — feedback lands in the database and is read in the
  admin view. *(A free tier like Resend can send notification emails later if volume justifies
  it.)*

---

## 5f. Usability requirements

> 🎨 **Implementation contract — tokens, components, every state, copy, error pages and the
> full edge-case sweep: [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).** This section states the rules;
> that document states the values.

These are **binding constraints on the build**, not aspirations. The app's whole reason to
exist is that doing this by hand is annoying — so if using it feels like work, it has failed
even when every number is right.

Design for the real moment of use: **standing at a table or in a checkout line, one hand, bad
light, worse wifi, mildly impatient friends waiting.** Not a desk.

### The tap budget

- **UX-1** **The common case must be four taps**, measured end to end:
  `⊕ New receipt → photo → "Looks right" → "Add to Splitwise"`.
  Everyone-on-everything and the right group are already selected by default.
- **UX-2** No feature may add a step to that path. Anything new is **opt-in, behind one tap**,
  and invisible until needed — split-into-N, invite a person, the two-expense guest route,
  changing the payer. Progressive disclosure is a rule here, not a preference.
- **UX-3** **One primary action per screen.** One filled button. Everything else is secondary
  or text. If a screen has two things of equal weight, the screen is wrong.
- **UX-4** No onboarding carousel, no tour, no tooltips-on-first-run. The empty dashboard
  teaches with a single button: *"Split your first receipt."*
- **UX-5** No settings screen in v1. Every choice has a good default and lives in context.

### Defaults that remove decisions

- **UX-6** Everyone assigned to everything, on open. Removing people from a few items is
  faster than assigning fourteen.
- **UX-7** Payer defaults to the signed-in user.
- **UX-8** Destination group is pre-selected by member match (FR-19b).
- **UX-9** Date and merchant come from the receipt — never ask the user to type what the
  photo already says.
- **UX-10** Every default is visible and changeable in one tap. Never a hidden assumption.

### Feedback and speed

- **UX-11** **Live math.** Per-person totals update on every tap. There is no "Calculate"
  button anywhere in the app.
- **UX-12** Any action over 400 ms shows progress **in context** — the receipt thumbnail with
  a scanning shimmer, not a full-screen spinner. Say what's happening: *"Reading your
  receipt…"*.
- **UX-13** Optimistic UI on submit: the row appears on the dashboard immediately, and
  reconciles or rolls back visibly if the API call fails.
- **UX-14** Median upload→submit under **60 seconds** (MET-9). Treated as a bug when exceeded,
  not a nice-to-have.

### Forgiveness

- **UX-15** **Never a dead end.** Every failure state offers a way forward — failed extraction
  offers manual entry, an API error keeps the work on screen and offers retry.
- **UX-16** **Nothing destructive without undo.** Delete has a 30s undo (DEL-3); removing a
  person, un-splitting a line, and clearing an assignment are all reversible.
- **UX-17** **Work is never lost.** The in-progress split is saved as a local draft, so a
  dropped connection, a phone call, or a backgrounded tab doesn't cost the user their
  fourteen assignments. Restaurants have bad wifi; assume it.
- **UX-18** Back always returns with state intact. No confirmation dialogs guarding navigation.

### Language

- **UX-19** **No jargon in the UI, ever.** Banned: *prorate, reconcile, OCR, parse, extract,
  group_id, payload, sync, API*. Say *"Tax split by who bought what"*, not *"tax prorated by
  taxable subtotal"*.
- **UX-20** **Errors say what to do next**, not what broke. Not *"Extraction failed"* but
  *"Couldn't read that one — try again with more light, or type it in."*
- **UX-21** Numbers are legible as money: tabular figures, currency symbol always shown,
  per-person totals in a larger weight than item prices.
- **UX-22** Never show an internal id, error code, or raw API message to a user. Those go to
  the feedback form's diagnostic attachment (FB-5).

### Accessibility

> ♿ **Full specification — WCAG 2.2 AA + ADA, ARIA per component, VoiceOver walkthroughs,
> contrast tables, keyboard map, announcement policy, test plan:
> [ACCESSIBILITY.md](ACCESSIBILITY.md).**

- **UX-22a** Target is **WCAG 2.2 Level AA** and ADA conformance — not "reasonable effort".
- **UX-22b** Semantic HTML first; ARIA only where HTML can't express the semantics.
- **UX-22c** Zero `axe-core` violations is a **build gate**, not a review comment.
- **UX-22d** Every screen is verified with a real screen reader (VoiceOver/NVDA) before shipping,
  because automated tools catch roughly a third of real barriers.

### Physical accessibility

- **UX-23** Touch targets ≥ 44×44 pt — including avatar toggles, which are tapped most.
- **UX-24** **Primary actions in the bottom third of the screen**, reachable one-handed with a
  thumb. The user is holding a receipt in the other hand.
- **UX-25** WCAG AA contrast, and never colour alone to convey meaning — assigned/unassigned
  avatars differ by fill *and* ring *and* a ✓ badge, not just hue. **Non-text contrast ≥ 3:1**
  for borders, focus rings and icon buttons.
- **UX-25a** **Focus is never obscured** by the sticky mobile CTA (WCAG 2.2 §2.4.11).
- **UX-25b** **Every drag has a click alternative** (WCAG 2.2 §2.5.7).
- **UX-25c** Visible labels on all inputs; helper text via `aria-describedby`; errors via
  `role="alert"` in `--danger-text`.
- **UX-26** Respect OS text sizing; the layout must survive 200% text without clipping.
- **UX-27** Labelled controls for screen readers; the running total is an announced live region.
- **UX-28** Works in dim light (restaurants) — no low-contrast greys carrying meaning.

### Responsive — one app, every screen

Mobile is the **primary** context (standing at a table). Desktop and tablet must be first-class,
not a stretched phone layout.

- **UX-29** **Mobile-first, fluid, no fixed widths.** Breakpoints: phone `< 640px`,
  tablet `640–1024px`, desktop `> 1024px`. Layout adapts at every size in between, not just
  at the three named points.
- **UX-30** **Minimum supported width 320px.** The app must be complete and usable there —
  nothing cut off, nothing unreachable.
- **UX-31** **The page never scrolls horizontally.** Any genuinely wide content (a long item
  table) lives in its own `overflow-x` container, never the body.
- **UX-32** Layout per breakpoint:
  | Screen | Phone | Tablet | Desktop |
  |---|---|---|---|
  | Dashboard | Single column list | Two-column grid | Two-column grid, wider gutters |
  | Check items | Full-width list | List + receipt thumbnail | **Receipt image left, items right** — compare side by side |
  | Who shares what | Stacked, avatars wrap | Same, wider rows | Receipt left, assignment right |
  | Confirm | Full-width sheet | Centred card | Centred card |
- **UX-33** **Dialogs adapt:** bottom sheets on phone (thumb-reachable), centred modals on
  desktop. Same component, different presentation.
- **UX-34** **Input adapts:** camera-first on mobile; drag-and-drop plus file picker on
  desktop. Both always available where the device supports them.
- **UX-35** **Full keyboard support on desktop** — tab order, Enter to confirm, Escape to
  close, visible focus rings. Desktop users should not have to reach for the mouse.
- **UX-36** Hover states on pointer devices only (`@media (hover: hover)`), so nothing sticks
  on touch.
- **UX-37** Landscape and split-screen must work, including on phones.

### Non-breakable — the stress cases

The layout must hold under real data, not just the demo receipt.

- **UX-38** **Long strings never break the layout.** A 60-character merchant or item name
  truncates with an ellipsis and stays readable; no overflow, no pushed-out prices.
  Prices and totals are **never** truncated.
- **UX-39** **Many items:** 50+ line items stay smooth (virtualise or paginate if needed).
- **UX-40** **Many people:** 10+ participants — avatars wrap to multiple rows or scroll
  horizontally *within their row*, never widening the page.
- **UX-41** **Large numbers:** a $9,999.99 total and per-person shares must fit without
  reflowing or clipping.
- **UX-42** **Tall portrait receipt images** are constrained by height, never allowed to push
  the primary action off-screen.
- **UX-43** No fixed pixel heights on anything containing text. Everything grows with content
  and with OS text size (UX-26).
- **UX-44** Zero-states and single-item states look deliberate, not broken: one item, one
  person, an empty archive, a dashboard with one row.

### Visual design — minimal, but rich

Minimalism here means **removing decoration, not removing quality.** The richness comes from
typography, spacing, and motion done properly — not from more elements on screen.

- **VIS-1** **One accent colour**, and it earns its place: it marks the primary action and
  *assigned* state. Everything else is a near-monochrome scale. A second accent only for
  destructive actions.
- **VIS-2** **Each person gets a consistent colour** across the whole app — avatar, running
  total, their share on the confirm screen. This is where the UI becomes visually rich *and*
  easier to scan.
  **But colour never identifies anyone.** Simulation showed that a palette both AA-compliant
  and separable under protanopia, deuteranopia, tritanopia *and* greyscale is mathematically
  unachievable past ~3 colours — greyscale needs lightness spread, AA-with-white-initials
  forbids it. So **initials are always visible**, the full name is always in the accessible
  name, and **assigned/unassigned uses fill + ring + ✓ badge, never hue**. A user who sees no
  colour completes a split correctly. Evidence: [ACCESSIBILITY.md](ACCESSIBILITY.md) §3.2.
- **VIS-3** **Typography does the heavy lifting.** One typeface, a tight scale (4–5 sizes),
  weight rather than colour for hierarchy.
- **VIS-4** **Tabular (monospaced) numerals for all money.** Prices align in a column and don't
  jitter as totals update. This one detail makes a money app feel built rather than assembled.
- **VIS-5** **Space over lines.** Group with whitespace; use hairline dividers sparingly and
  no boxes-inside-boxes. Generous padding — content-first, chrome-last.
- **VIS-6** **Elevation only where it means something** — a raised surface signals interactive
  or floating (bottom sheets, the undo toast). No decorative shadows, no glassmorphism, no
  gradient fills as ornament.
- **VIS-7** **Motion is explanation, not decoration.** 150–200 ms, ease-out. Only where it
  clarifies a change: a total ticking up, a row entering the dashboard, the undo countdown,
  an avatar filling on tap. Nothing loops, nothing bounces for fun.
- **VIS-8** **Honour `prefers-reduced-motion`** — replace movement with instant state change.
- **VIS-9** **Light and dark mode, both designed**, not one auto-inverted. The app is used in
  dim restaurants; dark mode is a real use case, not a preference.
- **VIS-10** **One restrained receipt motif, used once.** e.g. the receipt card carries a
  mono item-row treatment and a torn-paper edge. A nod, not a theme — skeuomorphism applied
  broadly reads cheap.
- **VIS-11** One consistent icon set, outline style, used sparingly. Never an icon where a
  word is clearer.
- **VIS-12** **Empty states have a voice.** *"No splits yet."* with one button — brief and
  warm. The name is a joke; the product needn't be humourless.
- **VIS-13** **Skeletons, not spinners**, for content that's loading into a known shape.
- **VIS-14** **The receipt image is treated as an object worth looking at** — proper aspect
  ratio, tap to zoom, never a squashed thumbnail. It's the proof behind the numbers.
- **VIS-15** Design tokens (colour, spacing, type, radius) defined once and used everywhere.
  Consistency is what separates "minimal" from "unfinished".

### Typography hierarchy

Since VIS-3 makes type carry the hierarchy, the scale is specified rather than left to taste.

- **TYPE-1** **One family.** A system stack (`-apple-system, Segoe UI, Roboto, …`) — zero
  webfont load, instantly native on every platform, and free. *If a brand face is wanted later,
  one weight-variable font, never two families.*
- **TYPE-2** **Three weights only:** 400 regular, 600 semibold, and 500 for small labels.
  More weights read as indecision.
- **TYPE-3** **The scale** (phone values; ×1.125 at ≥1024px):

  | Role | Size | Weight | Where |
  |---|---|---|---|
  | Display | 32 / 2rem | 600 | The receipt total on Confirm; the big money |
  | Title | 24 | 600 | Screen titles — *Your splits*, *Check the items* |
  | Section | 18 | 600 | *Split with*, *Add to*, group headers |
  | Body | 16 | 400 | Item names, all prose |
  | Body-strong | 16 | 600 | Per-person totals, merchant name on a row |
  | Meta | 14 | 400 | Dates, participant lists, *4 of 5 · E not in this group* |
  | Caption | 13 | 400 | Helper text, the privacy line, undo countdown |
  | Label | 12 | 500 | Status chips (`in Splitwise`, `invited`). Used sparingly |

- **TYPE-4** **Money hierarchy is its own ladder**, and it must read in this order at a glance:
  `receipt total (Display) > per-person share (Body-strong) > item price (Body)`.
  A user should be able to find what *they* owe without reading a single word.
- **TYPE-5** **`font-variant-numeric: tabular-nums` on every number.** Columns align, totals
  don't jitter as they update (VIS-4).
- **TYPE-6** **Line height:** 1.5 for body, 1.25 for Title/Display. Measure capped at ~70
  characters for prose (About, FAQ) — full width for lists.
- **TYPE-7** **Hierarchy comes from size and weight, never colour alone.** Muted colour may
  reinforce Meta/Caption, but removing all colour must leave the hierarchy intact (UX-25).
- **TYPE-8** **At most three type sizes visible in any one component.** A list row is
  Body-strong + Body + Meta, and that's the ceiling.
- **TYPE-9** **One Title per screen.** If a screen seems to need two, it's two screens.
- **TYPE-10** **Inputs are never below 16px** — smaller text triggers zoom-on-focus in iOS
  Safari and throws the layout, which is exactly the "breakable" failure UX-30 forbids.
- **TYPE-11** **All sizes in `rem`**, so OS text-size settings scale the whole app (UX-26).
  No `px` font sizes anywhere.
- **TYPE-12** Uppercase only for 12px Labels, with `letter-spacing: 0.04em`. Never uppercase a
  merchant or item name — receipts already shout in caps, and the app shouldn't.

**The test for every visual decision:** does it help someone split a bill faster or trust the
number more? If not, it's decoration — remove it.

### Usability acceptance criteria

- [ ] A person who has never seen the app completes their first split **without being told
      how**, in under 90 seconds.
- [ ] The common path is four taps. Counted, not estimated.
- [ ] Every screen's primary action is reachable with one thumb on a 6" phone.
- [ ] Killing the network mid-split loses nothing.
- [ ] No screen shows a word from the UX-19 banned list.
- [ ] Every error message names the next action.
- [ ] The app is usable at 200% text size and passes AA contrast.
- [ ] Every screen works at 320px, 768px, 1440px — and while dragging the window between them.
- [ ] No screen scrolls horizontally at any width.
- [ ] A receipt with a 60-character item name, 50 items, 10 people, and a $9,999.99 total
      renders correctly on a phone.
- [ ] Desktop: the entire flow is completable with the keyboard alone.
- [ ] Phone landscape and tablet split-screen are both usable.
- [ ] Money never jitters or shifts as totals update (tabular numerals).
- [ ] Dark mode is designed, not inverted, and readable in a dim room.
- [ ] With `prefers-reduced-motion` on, nothing animates and nothing breaks.
- [ ] Removing every colour from the UI leaves it fully usable.
- [ ] On Confirm, a user finds their own share without reading any words.
- [ ] No font size is set in px; the whole app scales with OS text settings.
- [ ] Tapping any input on iOS Safari does not zoom the page.
- [ ] No component shows more than three type sizes.

*Cost note: most of this is discipline rather than build time. The two that do cost time are
local drafts (UX-17, ~15m) and a proper accessibility pass (~15m). Both are in the M-estimates.*

---

## 5g. Gaps found in review — cases that would break the app

Found by walking real-world use rather than the happy path. Ranked by how badly each hurts.

### Critical — v1 must handle these

- **GAP-1 · Receipts with no itemisation.** A bar tab, a handwritten bill, a card slip, a
  faded thermal receipt — a large share of real receipts are **just a total**. The entire flow
  assumes line items, so today these are a dead end.
  → **"Split the total" mode:** if extraction finds no items (or the user taps *"Just split the
  total"*), skip straight from the total to assignment, split evenly or by custom shares.
  This is also the *fastest* path in the app and should be offered, not hidden.

- **GAP-2 · Currency.** A receipt in ₹ pushed into a $ group silently creates a wrong expense.
  → Always send `currency_code` from the receipt (FR-8 contract already carries it). If it
  differs from the group's default currency, **say so before submitting**. Never convert —
  Splitwise handles multi-currency; guessing a rate would violate ACC-1.

- **GAP-3 · Duplicate expenses.** The same receipt uploaded twice, or a housemate already added
  it in Splitwise. Result: everyone charged twice.
  → Warn on a near-match (same merchant + date + total) against the user's own history, and on
  submit check the destination group for an existing expense with the same date and amount.
  A warning, never a block — genuine repeat purchases happen.

- **GAP-4 · Photo EXIF — two separate problems.**
  - **Orientation:** iPhone photos carry a rotation flag. Ignore it and the model reads a
    sideways receipt and fails. Normalise orientation before extraction.
  - **GPS:** photos embed location. Sending them to the vision provider leaks where the user
    shops. **Strip all EXIF before upload and before storage.** This is a privacy requirement,
    not an optimisation.

- **GAP-5 · Token revoked or expired.** A user can revoke access in Splitwise at any time.
  Every API call must handle 401 by clearing the session and prompting a clean re-auth —
  **without losing the in-progress split** (UX-17).

- **GAP-6 · Stale cached groups and friends.** Groups/friends are cached at sign-in (FR-11a).
  A group deleted, a member removed, or a friend added on another device makes the cache lie.
  → Refresh on entering the flow; handle "group no longer exists" at submit gracefully.

### Important — v2, but decide now

- **GAP-7 · Multiple payers.** Two cards at a restaurant. Splitwise supports multiple payers;
  the app currently assumes one. v2, but the data model should not preclude it.
- **GAP-8 · Multi-page / multi-photo receipts.** Long receipts get folded or photographed in
  two shots. Today only page 1 / one image is read. v2: accept several images as one receipt.
- **GAP-9 · Refunds and returns.** An item returned next week. v2: a negative adjustment
  linked to the original split, rather than editing history.
- **GAP-10 · Someone pays cash at the table.** Already noted as v2 "cash guests" — restated
  here because it is the single most common real-world settlement.
- **GAP-11 · Receipt date vs today.** Use the *receipt's* date for the expense, not the upload
  date, and beware timezone off-by-one. A receipt photographed at 1am is still yesterday's.

### Operational — what fails at scale

- **GAP-12 · Free-tier ceilings.** Gemini's free quota is per-project, not per-user. Twenty
  active users could exhaust the daily limit and the app stops working **for everyone**. This
  is the only layer of the stack that can genuinely go down.
  → **Resolved by a fallback ladder:** `Gemini → Azure F0 → manual entry`. The extract route
  switches providers on quota or error, and manual entry always works (FR-8), so a user is
  never blocked from splitting a bill. Plus per-user rate limits (SEC-12) so one person can't
  burn the shared quota, and provider failures tracked as a metric (MET-16) so it's visible
  before it bites. Full design: [plan.md](plan.md) §6c.
- **GAP-13 · Splitwise free-account expense caps** (V6) would fail at submit, the worst moment.
  Surface Splitwise's own message and keep the user's work.
- **GAP-14 · Supabase free-tier pause** after ~7 days idle. **Resolved** by a daily keep-alive
  cron (DB-8) plus a friendly cold-start state (DB-9).
- **GAP-15 · Abuse.** Someone uploads a non-receipt image, which is then sent to a third-party
  provider. Rate limits plus a plain ToS line covers this at this scale.

### Additional gaps found in the UI review

- **GAP-16 · Decimal separator.** A European receipt reads `1.234,56`. Parsed with US rules that
  becomes `1.23` — a **100× money error**, and the worst possible failure. Detect the format
  from the receipt itself; never assume a locale.
- **GAP-17 · Same-name participants.** Two people called Alex. Show a disambiguator (last
  initial, or email domain) everywhere a name appears.
- **GAP-18 · A share that rounds to $0.00.** Display it, never hide it — the person still took
  something, and a hidden row looks like a bug.
- **GAP-19 · Browser back after submitting.** Must not resubmit. Idempotency (FR-22) plus
  landing on the dashboard rather than the confirm screen.
- **GAP-20 · Two tabs, one split.** Last write wins; the stale tab is told and offered a reload.
- **GAP-21 · Storage unavailable** (private browsing, quota full). Drafts degrade silently;
  every storage access is wrapped in `try/catch`; the flow never blocks.
- **GAP-22 · Cookies blocked.** The app can't keep anyone signed in — say so plainly rather
  than failing in a loop.
- **GAP-23 · Sign-in redirect target.** A user who lands on `/new` unauthenticated returns to
  `/new` after signing in, not to the dashboard.
- **GAP-24 · Mobile keyboard covering the field.** Inputs scroll into view above the keyboard.
- **GAP-25 · Pasted images.** Cmd+V of a screenshot is a real input — accept it.

Full UI-level handling for all of these: [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) §14.

### Acceptance additions

- [ ] A receipt with no readable line items can still be split, by total.
- [ ] A ₹ receipt into a $ group warns before submitting.
- [ ] Uploading the same receipt twice warns about a possible duplicate.
- [ ] A sideways iPhone photo extracts correctly.
- [ ] An uploaded photo's GPS data never reaches the vision provider or storage.
- [ ] Revoking access mid-split prompts re-auth without losing the split.
- [ ] A receipt formatted `1.234,56` parses as 1234.56, not 1.23.
- [ ] Browser back after submitting does not create a second expense.
- [ ] The whole flow works in private browsing, with drafts simply unavailable.

---

## 6. Security requirements

This handles receipts and a live financial-account token. Treat it accordingly.

### Secrets & tokens
- **SEC-1** Splitwise client secret and the vision API key live **only** in server-side env vars.
  Never in `NEXT_PUBLIC_*`, never in the bundle. All third-party calls go through API routes.
- **SEC-2** The Splitwise access token is stored in an encrypted, signed, `HttpOnly`, `Secure`,
  `SameSite=Lax` cookie. It is never readable by JavaScript and never sent to the browser in a body.
- **SEC-3** Session cookie expires in 24h and on logout.

### OAuth
- **SEC-4** Use a random `state` parameter, stored in a short-lived cookie and verified on
  callback — this is the CSRF defense for the login flow.
- **SEC-5** Redirect URI is exact-matched and registered. No open redirects: never redirect to a
  user-supplied URL.

### Data handling
- **SEC-6** Receipt bytes are held in memory for the duration of one request and discarded.
  Nothing is written to disk, to a bucket, or to a database.
- **SEC-7** Never log receipt contents, item data, tokens, or the user's email. Log request
  IDs and error types only.
- **SEC-8** The vision provider is the one external party that sees the receipt image.
  State this plainly in the UI before the first upload. Use the API (not consumer) endpoint,
  which is not trained on by default — verify this on the provider's current terms at build time.

### Input handling
- **SEC-9** Validate file type by magic bytes, enforce the 10 MB cap before reading the body,
  and cap page count for PDFs at 1.
- **SEC-10** Validate the model's JSON against a strict schema (Zod) before it touches any math.
  Treat model output as untrusted input — it is.
- **SEC-11** Escape all rendered strings (merchant names, item names). React does this by
  default; do not introduce `dangerouslySetInnerHTML` anywhere.
- **SEC-12** Rate-limit the extract endpoint per session (e.g. 10/hour). Protects both the
  free tier and the wallet.

### Transport & headers
- **SEC-13** HTTPS only, HSTS on (Vercel default).
- **SEC-14** Content-Security-Policy with no `unsafe-inline` scripts; `frame-ancestors 'none'`.
- **SEC-15** `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- **SEC-16** All state-changing routes are POST and require the session cookie + `SameSite` protection.

### Dependencies
- **SEC-18** **Inviting a person is an outward-facing action** — it sends an email from the
  user's Splitwise account to a third party, and it cannot be un-sent. Require an explicit
  confirm ("Invite Maya at maya@example.com?") before calling the API. Never auto-invite
  from a typed-ahead or half-finished field.
- **SEC-19** Validate the email format server-side, normalize case, and check it against the
  existing friends list first — silently re-inviting an existing friend is a bad experience
  and a small spam vector.
- **SEC-20** Rate-limit invites hard (e.g. 5/hour/session). An unbounded invite endpoint
  attached to someone's real Splitwise account is a spam relay.
- **SEC-17** Keep the dependency list short. Every package is a supply-chain risk on a
  financial app. No package added without a reason.

---

## 7. Acceptance criteria

The build is done when all of these are true:

- [ ] A photo of a real grocery receipt produces items with ≥90% of names and prices correct.
- [ ] Per-person shares sum to the receipt total **to the cent**, verified on a receipt with an
      odd total and 3 people (the classic rounding trap).
- [ ] The expense appears correctly in the real Splitwise app.
- [ ] `view-source` and the JS bundle contain no API keys.
- [ ] `document.cookie` in the console shows no session token.
- [ ] A 20 MB file and a `.exe` renamed to `.jpg` are both rejected cleanly.
- [ ] Double-tapping Submit creates exactly one expense.
- [ ] A brand-new person can be invited by email mid-flow, appears as an avatar immediately,
      and is included correctly in the created expense.
- [ ] Inviting requires an explicit confirm, and re-inviting an existing friend is prevented.
- [ ] A 4-qty line split as 2/1/1 across four people produces $3.00 each and sums to $12.00.
- [ ] On a receipt with mixed taxable/exempt items, tax lands only on the people who took
      taxable items, and the tax allocated equals the tax printed on the receipt exactly.
- [ ] A receipt with a coupon/negative line splits correctly.
- [ ] An expense lands in the chosen group, and a non-group expense works (`group_id: 0`).
- [ ] Signed out / second account cannot read the first account's splits or receipt images.
- [ ] "Remove from here" leaves the Splitwise expense fully intact.
- [ ] "Delete everywhere" then Undo within 30s leaves the Splitwise expense intact — verified
      by checking that no delete call was ever made.
- [ ] Closing the tab mid-undo never destroys a Splitwise expense silently; the row's status
      reflects what actually happened.
- [ ] A transaction restored from Archive after a Splitwise delete is re-created, and the app
      says it is a new expense.
- [ ] A receipt image URL leaks nothing when pasted into a logged-out browser.
- [ ] The admin view contains no merchant, item, amount, participant name, or email anywhere.
- [ ] A non-allowlisted account gets 403 on every admin route.
- [ ] The events table, dumped raw, reveals nothing about what anyone bought.
- [ ] The About page states the Splitwise affiliation disclaimer and names the vision provider.
- [ ] Feedback submitted with HTML/script in it renders harmlessly in the admin inbox.
- [ ] The diagnostic-info checkbox attaches no receipt or item data when ticked.
- [ ] Submitting to a group missing one participant is blocked with a one-tap fix.
- [ ] Scenario 1: 4 existing friends → correct group pre-selected → one expense, one tap.
- [ ] Scenario 2 option 1: E added to the group → single expense with all 5, sums to total.
- [ ] Scenario 2 option 3: two expenses created; their totals sum to the receipt total exactly.
- [ ] Scenario 2 option 3 with the second call forced to fail → user is told exactly which
      record exists, and retry creates only the missing one.
- [ ] An item misread as $549 instead of $5.49 is caught by the sanity bounds.
- [ ] Server logs contain no receipt content.

---

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| OCR misreads prices | Wrong money split | Mandatory review step (FR-10) + subtotal check (FR-9) |
| Vision free tier exhausted | Blocked for **all** users | Automatic fallback ladder: Gemini → Azure F0 → manual entry (GAP-12) |
| Invite API shape differs from docs | Add-person breaks | Verify `add_user_to_group` / `create_friend` in the first 20 min; fall back to "add them in Splitwise, then refresh" |
| Splitwise rejects share sums | Submit fails | Integer cents + largest-remainder (FR-18); test explicitly |
| 3 hours runs out | Half an app | Build in M1→M6 order; each step leaves a working app |
| HEIC decoding (iPhone photos) | Common format fails | Verify the vision provider accepts HEIC; else convert or restrict and say so in the picker |

### Admin account, reset by email, and split guards (added 2026-09-12, fifth pass)

*Gaurav: "why sign in with Splitwise — can anyone log in? If I forget the password, how do I
change it? … while splitting, what edge cases fail or falsify? … on desktop 'Take a photo' opens
an upload — what should it be? … on mobile, tapping Next doesn't go back to the top."*

- **SEC-26b** **The password lives where the app can change it.** `ADMIN_PASSWORD_HASH` is the
  starting value only — the app cannot rewrite its own environment. Current credentials are a
  small private JSON object in Supabase Storage (`app-config/admin/credentials.json`), written
  by the server only, holding a scrypt hash and never a password.
- **SEC-26c** **Forgot password.** `/admin/forgot` emails a one-time link (30 minutes, single
  use, stored only as a SHA-256 hash) to `ADMIN_EMAIL`, via Resend (`RESEND_API_KEY`). The
  address is masked in the UI. Without an email key the page gives the offline route instead
  (`npm run admin:password` → update the Vercel variable), never a dead end. 3 requests per
  network per hour.
- **SEC-26d** **Change password** at `/admin/password` needs the current password even when
  already signed in, so a borrowed laptop cannot take the account over.
- **SEC-26e** The Splitwise sign-in link was removed from the admin page: `ADMIN_USER_IDS` is
  empty on the deployed site, so it could only confuse. The allowlist still works if ever set.
- **FR-43** **Splits that would be wrong are refused, not sent.** `planSplit()` blocks a share
  below zero (naming the person — it happens when a discount is given to someone who didn't
  have the item it discounts) and a total of zero or less. Both were previously only caught by
  Splitwise, after the user had finished.
- **FR-44** **The camera button appears only where a camera exists** (coarse pointer + media
  devices). On a laptop "Take a photo" opened a file picker, which told the user something
  untrue; there the primary action is "Choose a receipt file", with a line about photographing
  it on a phone.
- **FR-45** **Every step starts at its own top.** With the sticky CTA on a phone, moving on left
  people mid-screen.
- **FR-46** **Signed out, the people step leads with Splitwise sign-in.** *(Superseded by FR-52
  on 2026-09-13: the "Split without signing in" second choice was removed, because it produced a
  split that could never be sent.)* Signed in, the add-person sheet keeps friends first and adds
  "Not in your friends list yet?" above the email invite.
- **VIS-9** Depth and motion: drifting gradient blobs (`.aurora`), a wave divider into the
  first band, rise-in entrances and hover lift — hand-written CSS and inline SVG only (no
  animation library, no external image service), and all of it still under the app's
  reduced-motion rule.

### Camera, docs and policy (added 2026-09-12, sixth pass)

*Gaurav: "as we are not giving take-photo, is our claim untrue? We should give an option to add a
photo from the camera on a laptop, desktop or iPad … and wherever policies of data, add whatever
we updated — requirements, userflow, and the web app wherever needed."*

- **FR-44a** **The camera works on every device that has one.** Phones keep the native camera
  (`<input capture>`) for full resolution. Laptops, desktops and tablets get an in-app
  viewfinder (`getUserMedia`, back camera preferred, never mirrored so the text reads correctly)
  with a shutter that hands a JPEG straight to the same pipeline. The stream stops on close, on
  unmount and after the shot. Permission refused or no camera says so plainly and points at
  "Choose a file". This keeps the product's promise ("snap a photo") true everywhere, which
  hiding the button did not.
- **VIS-10** The three upload actions are one column of equal width — mixed widths read as a
  mistake and make the eye re-measure each one.
- **DOC-1** Anything that changes what happens to people's data is written in three places at
  once: `requirements.md` (the rule), `userflow.md` (the flow), and the app's own **About** and
  **FAQ** pages (what the user is told). Currently covered there: receipt photos kept privately
  per account and deleted with the split, Gemini as the only place contents leave the app,
  aggregate-only admin metrics under a keyed pseudonym, editing and deleting splits, and the
  camera.

### Limits, syncing, security page, footer (added 2026-09-12, seventh pass)

*Gaurav: "how many transactions can I add — Splitwise has a limit? … in Splitwise I may update the
transaction; here also a button in the dashboard receipt to fetch or push … check secured or not,
mention it on the website, and put my contact in the footer."*

- **FR-47** **Show the real limit, not a guess.** Splitwise documents no numbers ("rate limits
  vary by endpoint … subject to change", HTTP 429, "fairly lenient"), so the app states its own:
  30 sends per hour per account, with "N of 30 sent this hour · M in the last 24 hours" on the
  send screen (`GET /api/quota`, counted from our own events). At the cap, sending is disabled
  with the reason and the time it frees up. A 429 from Splitwise says plainly that Splitwise is
  throttling, that nothing was created, and that the split is safe.
- **FR-48** **Two copies, one button.** A saved split and its Splitwise expense can each change.
  "Check Splitwise" compares them and shows a field-by-field table (total, name, date, group,
  who paid, who owes). Then the user chooses: **pull** (take Splitwise's amounts — items stay
  ours and are flagged `itemsStale` if they no longer add up) or **push** (send ours over theirs,
  which changes it for everyone). Deleted there is detected and flagged, never silently ignored.
  Nothing syncs automatically. Comparison logic is pure and unit-tested (`lib/sync.ts`).
- **SEC-31** **/security** states plainly what is stored, who can see it, and how it is protected,
  and **/.well-known/security.txt** (RFC 9116) gives a private reporting address.
- **VIS-11** The footer carries the brand, what the app is, four columns (the app · trust ·
  contact), a real email address, and the "not affiliated with Splitwise" line.
- **COPY-3** The home page leads with the actual job: no spreadsheet, add a photo or PDF from
  Walmart, Safeway or anywhere, or type it in, connect Splitwise, done — and says "free, no
  Splitwise Pro needed" where people look for the catch.

### Removal keeps the count, not the receipt (added 2026-09-12, eighth pass)

*Gaurav: "if some user deletes a receipt from the dashboard or from Splitwise, don't delete it from
our admin — that should count, that is the real data. You can remove it from his dashboard but not
the actual count." And: "on the home page there are many hyphens, remove them, make it simple to
understand what the app is about."*

- **DB-12** **Removal redacts; it never erases the record of use.** "Remove dashboard copy" (and
  "Delete from Splitwise too") no longer deletes the row. The row is rewritten in place to an
  aggregate-only summary — amount, currency, mode, group flag, item count, people count, payer
  count, the Splitwise participant ids, `removedAt`, and `hadPhoto` — and everything that
  describes the receipt is dropped: merchant, date, line items, people's names, per-person
  amounts, the idempotency key. The photo object is deleted from storage and `image_path` is
  cleared. There is no hard delete left in `lib/db.ts`.
- **DB-13** **A removed row is invisible to its owner.** Every owner-scoped read carries the
  `NOT_REMOVED` filter (`data->>removedAt=is.null`): the dashboard list, the split page, the
  image route, the sync route and the edit path. A removed split 404s like any split that never
  existed; it can never be re-opened, re-edited, re-synced, or its photo fetched.
- **MET-9** **Admin totals survive a user's delete.** Money split, people in splits, photo share
  and every event-derived count stay exactly as they were, because deletion no longer removes the
  evidence. Receipts deleted inside Splitwise itself were already safe — sync flags the split,
  it never removes it. The admin page names the effect rather than hiding it: "Includes N
  receipts whose owners later removed them from their own dashboard … the usage still happened,
  so it is still counted here."
- **SEC-32** **The user is told exactly this before it happens.** The confirmation and the help
  text under it say the items, photo and names are deleted for good and that an anonymous line
  (amount, how many items and people) stays in usage totals. The FAQ and /security say the same.
- **COPY-4** **Plain home page.** The home page copy uses whole sentences instead of dashes:
  "No spreadsheet. No calculator. Add a photo or PDF of any receipt from Walmart, Safeway, a
  restaurant, anywhere, or type it in yourself. Tap who had what." Steps, cases and trust lines
  were rewritten the same way, and the dashboard empty state with them.

### Archive means archive (added 2026-09-12, eighth pass)

*Gaurav: "if user removes receipts/splits from Your splits dashboard, no archive; if he removes
from Splitwise, then also archive here."*

- **FR-49** **Deleted in Splitwise is archived here, automatically.** When "Check Splitwise" finds
  the expense gone (deleted response or 404), the saved split is archived in the same write that
  sets `deletedInSplitwise`. It leaves the active list and the balance totals, keeps its readable
  copy, and shows "deleted in Splitwise" instead of "archived" in the archive list. Restoring puts
  it back. An already-archived split keeps its original archive date.
- **FR-50** **Removed is removed, never archived.** "Remove for good" clears `archived_at` as it
  redacts (DB-12), so a removed split cannot surface in the archive disclosure. The two actions are
  now named for what they do: *Archive receipt* keeps it, *Remove for good* destroys it, *Delete
  from Splitwise too* also removes the shared expense.
- **FR-51** **Thirty seconds to change your mind.** Neither removal happens on the click. Pressing
  *Remove for good* or *Delete from Splitwise too* puts the split into a pending panel that says
  what is about to happen and that **nothing has happened yet**, with **Undo (30s)** and *Do it
  now*. Undo cancels it outright — no request was ever sent, so there is nothing to reverse, which
  is why the wait comes before the deletion rather than after it (userflow.md, "30s Undo toast").
  Leaving the page or closing the tab flushes the removal with a `keepalive` request; if that
  fails, nothing is destroyed and the split simply stays. Deleting from Splitwise is still
  confirmed first, because it changes a shared expense for everyone.

### Sign-in is the only way past the people step, and a split can be shared as a link (added 2026-09-13, ninth pass)

*Gaurav: "at split step it should only have one option sign in with splitwise, there should not be
an option split without sign in, it's of no use at the end … at the individual split, from the
dashboard you go to a split and see all the details — you should also be able to share that split
via a link that shows the receipt, items, who divided it and who paid, a good viewable option as a
link to anyone that does not require sign in … and the 'notify me if anyone filled the contact
form' — I tried it and I didn't get a notification."*

- **FR-52** **The people step has one way forward: sign in with Splitwise.** The "Split without
  signing in" disclosure is gone. Typing names while signed out built a whole split — people,
  items, payers — that could not be sent anywhere, and the user only found that out on the last
  screen, after all the work. Signed out, the empty people panel now shows the Splitwise sign-in
  card and one line saying why it is needed, and the step's own CTA is disabled with the reason
  *"Sign in with Splitwise to add people"* rather than the now-unreachable "Add at least one
  person". Nothing is lost by signing in: the receipt is already saved in the draft and the flow
  returns to exactly this step. Signed in, adding someone who is not a Splitwise friend is still
  possible from the add-person sheet ("Add only to this split").
- **FR-53** **A saved split can be shared as a read-only link.** The split page gains a *Share
  this receipt* panel. **Create share link** mints a token and shows `/s/<token>`, with **Copy
  link** and **Turn off link**. Opening that link shows the same page the owner sees — merchant,
  date, total, receipt photo, who paid, who owes what, the settle-up transfers, and every item
  with the faces that shared it — rendered by the same component (`components/split/SplitView.tsx`),
  so the two views cannot drift apart. No sign-in, no account, nothing to tap.
  - **Read-only in both senses.** The shared page carries no Edit, Sync, Archive, Remove or Share
    controls, and no API route reachable from it can write anything.
  - **Nobody is "you".** The owner's view says *you lent / you borrowed / (you) / You pay*; the
    shared view has no viewer to address, so every person is named in full. The same component
    decides this from one prop (`viewerId`), which is `null` on the public page.
  - **The token is the permission.** 192 bits of randomness, base64url, held only on the split it
    belongs to. Creating a link twice returns the same one, so re-sharing never breaks a link a
    friend already has.
  - **Turning it off is immediate and total.** Revoking discards the token; the old link, and the
    photo route behind it, return 404 for everyone from that moment.
  - **Removing a split takes its link with it.** The token lives inside the split's JSON `data`,
    which `redactedForRemoval` clears (DB-12) — so a receipt removed for good cannot stay readable
    through a link somebody kept. Tested directly (`tests/share.test.ts`).
  - **Never indexed.** The page sets `robots: noindex, nofollow, nocache` and the photo route
    sends `X-Robots-Tag: noindex, nofollow` with a short private cache, so a revoked link stops
    working quickly everywhere.
  - **The photo stays private.** The storage bucket is still private; bytes reach a browser only
    through `/api/s/[token]/image`, which resolves the token itself and refuses anything that is
    not a well-formed token before it ever queries the database.
- **FB-10** **Feedback alerts are visible, testable, and honest about being off.** The contact
  form already wrote every message to the database *and* emailed the admin — but only when
  `RESEND_API_KEY` is set, and it never was on the deployed site, so nothing arrived and nothing
  said why. Three changes: the admin **Feedback inbox** panel now states in one line whether email
  alerts are on (and to which masked address) or off (and which variable turns them on); a **Send
  a test alert** button (`POST /api/admin/test-email`, admin-only, rate limited) proves the
  delivery path without waiting for real feedback, and reports the provider's own refusal reason
  rather than a generic failure; and `NEEDED-FROM-ME.md` gains step ⑥b, the Resend account setup.
  The database stays the source of truth either way — a delivery problem must never tell someone
  their feedback failed after it was safely recorded.

### Sharing leads the split page (added 2026-09-13, tenth pass)

*Gaurav: "these all things are down, make it more prominent on top … too heavy
to scroll, do good UX of this split page. The link works good and cool."*

- **FR-54** **The share action sits in the split page's action bar, not at the bottom of it.**
  FR-53 shipped the share panel below the items, under the Splitwise panel and the manage panel —
  four screens from the top on a phone, below two panels about deleting things. Sharing is the
  most common thing anyone does on this page, and it was the hardest thing to find on it.
  - **Share is now the lead action**, beside *Edit split* and *Open in Splitwise*, and it is the
    only filled button of the three: the other two step back to outlines. The link itself opens
    in a sheet, so the page keeps the same shape whether or not a link exists — no panel that
    appears and disappears, and no scrolling to find out.
  - **The button says whether a link is live**, with a dot and the screen-reader text "a link is
    currently on". Whether this receipt is currently readable by other people is a standing fact
    about it, not something you should have to open a dialog to learn.
  - **Send link uses the OS share sheet** (`navigator.share`) where there is one — on a phone,
    that is the difference between "copy this, now go find Messages" and one tap. Where there
    isn't one, it copies, and cancelling the OS sheet is not treated as an error.
  - **The action bar follows you down the page**, sticky under the site nav (which is itself
    sticky at 60px, z-index 30; the bar sits at z-index 20). It is opaque rather than blurred: a
    nav may show a hint of the page moving under it, but a toolbar in the middle of a page of
    numbers just gets page text ghosting through its own labels.
    This page is long by nature — a photo, two people panels, and every line of the receipt — and
    Back, Share and Edit were previously reachable only by scrolling to the top.
  - **On a phone it stays one row.** A sticky bar that wraps to two rows costs two rows of the
    receipt, permanently. Below 40rem the back link keeps its arrow and drops its words (with an
    `aria-label` carrying the full name), "Open in Splitwise" becomes "Splitwise", and the buttons
    tighten — while every target keeps its 44px height.
- **GAP-6** **A dialog is rendered into `<body>`, never where it is written.** Making the action
  bar sticky gave it a `z-index` and a `backdrop-filter`, and either alone is enough to turn an
  element into both a stacking context and the containing block for `position: fixed` descendants.
  The share sheet, written inside that bar, was then laid out relative to the bar and painted under
  the site nav: on a phone its buttons could not be clicked at all. `Sheet` now portals to
  `document.body`, so no caller can reintroduce this by styling an ancestor. Caught by the mobile
  journey test, which reported the nav intercepting pointer events.
- **TEST-6** **Clipboard access is a browser permission, not a given.** The desktop project now
  grants `clipboard-read`/`clipboard-write` and asserts that *Copy* really put the link on the
  clipboard; WebKit has no such permission, so on the mobile project the copy assertion is skipped
  rather than asserting the fallback. Without this the test was silently exercising the failure
  path and calling it a pass.
