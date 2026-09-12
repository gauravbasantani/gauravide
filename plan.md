# Gauravide — Execution Plan

*Build order, setup, schema, and API surface. Nothing here is built yet.*

Specs: [requirements.md](requirements.md) · [userflow.md](userflow.md) · **Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)** · **UI: [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)** · **A11y: [ACCESSIBILITY.md](ACCESSIBILITY.md)**

---

## 0. Shape of the build

> ⚠️ **Splitwise API access now requires a paid Splitwise Pro subscription** (~$40–60/yr),
> discovered 2026-09-11. Only **P6** depends on it. The build order below puts everything free
> first, so you can see the app working before deciding whether to pay.
> Options: [requirements.md](requirements.md) §4.

| Session | Phases | Output | Est |
|---|---|---|---|
| **1a** | P0 – P5 | Photo → items → assign → **exact per-person shares**. No Splitwise API, no database. **Entirely free.** | ~3h45m |
| **1b** | P6 | Push to Splitwise — **needs Pro** | ~40m |
| **2** | P7 – P9 | Supabase, dashboard, history, edit, delete/undo/archive | ~2h |
| **3** | P10 – P12 | Metrics + admin, About/FAQ/Contact, design & responsive polish | ~3h10m |

**Total ~9h45m.** Accessibility is built in per-phase, not bolted on at the end — retrofitting it costs three times as much. The 3-hour original budget buys Session 1 only — which is the point of
cutting it here: Session 1 is a real, shippable app on its own.

Ship Session 1 before designing the schema. You'll know what history actually needs to store
once the split flow is real — guessing first means migrating twice.

---

## 1. What I need from you before I build

> 📋 **Step-by-step version with every click written out: [NEEDED-FROM-ME.md](NEEDED-FROM-ME.md)**
> — use that one if you're actually doing the setup. What follows is the summary.

Six accounts, all free, **none require a credit card.** About 20 minutes total. Do them in
this order — each one gives you something to paste into the next.

---

### ① GitHub account — 2 min
*Needed for: deploying, and logging into the next two services.*

1. Go to **github.com** → Sign up (if you don't have one).
2. That's it. No repo needed yet — I'll create it.

---

### ② Splitwise developer app — ⚠️ BLOCKED (needs Splitwise Pro)
**Registering a third-party app now requires an active Splitwise Pro subscription
(~$40–60/yr).** Confirmed on their site. See [requirements.md](requirements.md) §4 for the
options. **Skip this step** — P6 is the only phase that needs it.

<details><summary>For when you have Pro</summary>

1. Sign in at **secure.splitwise.com** with your normal Splitwise account.
2. Go to **secure.splitwise.com/apps** → **Register your application**.
3. Fill in:
   - **Application name:** `Gauravide`
   - **Description:** `Split receipts and push them to Splitwise`
   - **Homepage URL:** `https://gauravide.vercel.app`
   - **Callback URL:** `https://gauravide.vercel.app/api/auth/callback`
4. Save. You'll land on a page showing **Consumer Key** and **Consumer Secret**.
5. Copy both. The secret is shown properly only here — save it now.

Also add `http://localhost:3000/api/auth/callback` for local testing, or register a second app
called `Gauravide (dev)`.
</details>

---

### ③ Gemini API key — 3 min
*Gives you: `GEMINI_API_KEY` — this is what reads the receipts.*

1. Go to **aistudio.google.com** → sign in with any Google account.
2. Left sidebar → **Get API key** → **Create API key**.
3. Choose **Create API key in new project**.
4. Copy the key.

**No credit card, no billing setup.** The free tier is generous and this is the only AI service
the app uses.

---

### ④ Backup receipt reader — 3 min
*Gives you: `OCRSPACE_API_KEY` — the fallback if Gemini's daily quota runs out.*

1. Go to **ocr.space/ocrapi** → **Free API Key**.
2. Enter your email → the key arrives by email.
3. Copy it.

**Why this instead of Azure:** Azure's free tier requires a credit card on file. OCR.space's
free tier needs only an email — 25,000 requests/month, no card. Since the whole point is
*never stops, never costs*, this fits better. *(If you're happy to put a card on Azure for
better quality, say so and I'll use Azure instead — it reads receipts more accurately.)*

---

### ⑤ Supabase — 3 min *(Session 2, but set it up now)*
*Gives you: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`*

1. **supabase.com** → **Start your project** → sign in **with GitHub**.
2. **New project.** Name `gauravide`, pick the region closest to you, and **save the database
   password somewhere** — it's shown once.
3. Wait ~2 minutes while it provisions.
4. **Settings → API** → copy the **Project URL** and the **`service_role`** key.

> ⚠️ The `service_role` key is a master key. Never put it in a browser, a repo, or a message.
> §1b below explains where it goes.

---

### ⑥ Vercel — 2 min
*This is where the app lives.*

1. **vercel.com** → **Sign up with GitHub**.
2. Stop there. I'll walk you through importing the project when the code exists.

---

### ⑦ UptimeRobot — 2 min *(optional but recommended)*
*Emails you if the app ever goes down.*

1. **uptimerobot.com** → free account (email only).
2. We'll add the monitor after the first deploy, once there's a URL.

---

## 1b. How to hand these to me — safely

**Do not paste keys into this chat.** Anything typed here lives in the conversation log.
Instead:

1. In the project folder `/Users/gaurav/Downloads/Splitwise`, create a file named
   **`.env.local`**
2. Paste this in and fill the blanks:

```
SPLITWISE_CLIENT_ID=
SPLITWISE_CLIENT_SECRET=
SESSION_SECRET=
GEMINI_API_KEY=
OCRSPACE_API_KEY=
APP_URL=http://localhost:3000

# Session 2
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
ADMIN_USER_IDS=
```

3. For `SESSION_SECRET`, run this in Terminal and paste the output:
   ```
   openssl rand -base64 32
   ```
4. Tell me *"env is ready"* — I'll read the file, never print the values, and the first thing
   I commit will be a `.gitignore` containing `.env.local`.

Later, the same values get pasted into **Vercel → Settings → Environment Variables** so the
deployed app has them. I'll tell you exactly when.

---

## 1c. Also needed from you (not accounts)

| What | Why | When |
|---|---|---|
| **2–3 photos of real receipts** — a grocery one, a restaurant one, and one crumpled or faded | To verify extraction against reality, not a clean demo | Before P3 |
| **A receipt with an odd total** (e.g. $45.67 split 3 ways) | The rounding trap — tests the money math | Before P5 |
| **Your Splitwise account with at least one group and 2+ friends** | To test group matching and assignment | Before P2 |
| **A second Splitwise account** (any spare email) | To prove one user can't read another's data | Before P7 |
| **Your Splitwise user id** | For `ADMIN_USER_IDS`, so you can see the metrics page | Session 3 |

Put the receipt photos anywhere in the project folder and tell me where.

---

## 1d. What I do NOT need from you

- Your Splitwise password — OAuth means the app never sees it
- Any payment details, anywhere
- A custom domain — `gauravide.vercel.app` is free and permanent
- Design assets — the design system is specified in the docs and I'll build it

---

## 2. Phase 0 — Verify assumptions (30 min, before any UI)

> **All of P0 requires API access, and therefore Splitwise Pro.** If you're building Session 1a
> free, skip P0 entirely and run it later, immediately before P6.
>
> **One verification is worth doing regardless — V0 below.** It decides whether Gauravide can
> ever be shared with anyone but you.

- [ ] **V0 ⭐ THE question: do *users* need their own Splitwise Pro?**
      This decides whether Gauravide can ever be shared, so verify it two ways:
      1. **Email Splitwise support now** (the answer arrives while you build):
         *"If I subscribe to Pro and register an app, do users of my app need their own Pro
         subscription to authorize it and create expenses?"*
      *(The official docs do not answer this — I checked dev.splitwise.com directly.)*
      2. **Test empirically in Session 2** — sign into the app with the spare **free** account
         and create an expense. If it works, users don't need Pro. This is the definitive answer
         and costs nothing.

      **Best reading of their wording:** only the developer needs it. *"If your Pro subscription
      lapses, your apps and their users will lose third-party API access"* only makes sense if
      user access flows from the developer's subscription — a user's own Pro wouldn't be
      affected by yours lapsing. **Likely, not confirmed.** Don't plan distribution on it.

Four API behaviours the design depends on. Each has a fallback in
[requirements.md](requirements.md) §8, but confirm them before building on top.

- [ ] **V1** `create_expense` share sums — shares must total `cost` exactly. Confirm the error
      when they don't, so FR-18 rounding is verified against the real API.
- [ ] **V2** `add_user_to_group` with `email` + `first_name` for a person with **no Splitwise
      account** — does it create and invite them? (FR-11d)
- [ ] **V3** `create_expense` with `users__N__email` instead of `user_id` — if this works, it's
      a simpler path than pre-creating a friend.
- [ ] **V4** `group_id: 0` creates a non-group expense. (FR-19a)
- [ ] **V5** Group object returns an `invite_link` field. (FR-11g)
- [ ] **V6** Free-account expense caps — create ~6 expenses on a free test account, watch for a
      4xx. (§4 *Does Splitwise cost anything?*)
- [ ] **V7** Gemini accepts HEIC, or decide to convert client-side. (§8 risks)
- [ ] **V10** OCR.space returns usable text for a thermal receipt — it's raw OCR, so confirm the
      parser can find prices. (D3)
- [ ] **V8** `create_expense` accepts `currency_code`, and what happens when it differs from the
      group's default. (GAP-2)
- [ ] **V9** Behaviour on a revoked token — confirm it's a 401 and not a silent failure. (GAP-5)

Do this with `curl` and a personal access token. **Do not build UI first.**

---

## 3. Stack and structure

> 🏗 **How the layers fit together, the dependency rules, the trust boundary, testing and
> scaling: [ARCHITECTURE.md](ARCHITECTURE.md).** Read it before P1 — it's what keeps the build
> from turning into one large `page.tsx`.

Next.js (App Router) · TypeScript · Tailwind · Zod · Vercel.
Dependency list stays short on purpose (SEC-17).

```
app/
  page.tsx                    Landing (signed out) / Dashboard (signed in)
  new/page.tsx                Screens 2–5: upload → check → assign → confirm
  split/[id]/page.tsx         View / edit a past split        (S2)
  archive/page.tsx            Archive + restore               (S2)
  admin/page.tsx              Metrics + feedback inbox        (S3)
  about|faq|contact/page.tsx                                  (S3)
  api/
    auth/login|callback|logout/route.ts
    receipt/extract/route.ts        image|pdf  → items JSON
    splitwise/
      me|groups|friends/route.ts
      invite/route.ts               add_user_to_group | create_friend
      group/route.ts                create_group
      expense/route.ts              create | update | delete
    splits/route.ts                 list | create              (S2)
    splits/[id]/route.ts            get | update | archive     (S2)
    feedback/route.ts                                          (S3)
    admin/metrics/route.ts                                     (S3)
lib/
  money.ts        integer cents, largest-remainder  (ACC-2, FR-18)
  split.ts        assignment → per-person shares    (FR-16, FR-12a)
  receipt.ts      vision call + Zod schema          (SEC-10)
  splitwise.ts    typed API client
  session.ts      encrypted cookie                  (SEC-2)
  db.ts           Supabase server client            (S2)
components/
  ItemRow · AvatarToggle · RunningTotal · GroupPicker
  AddPersonSheet · UndoToast · ReceiptCard
ui/tokens.css     colour, space, type scale         (VIS-15, TYPE-3)
```

---

## 4. Data model — barely minimum

**One table.** Not three.

The app only ever does two reads: *list my splits* and *open one split*. It never queries
inside the items — no "show me all milk purchases", no aggregation across line items. So
normalising items and shares into their own tables buys nothing and costs joins, migrations,
and an hour of your time.

Everything about a split lives in one JSONB column. If you ever need per-item queries, you
normalise then — with real data telling you how.

```sql
-- the whole Session 2 schema
create table splits (
  id           uuid primary key default gen_random_uuid(),
  owner_id     text not null,          -- Splitwise user id
  data         jsonb not null,         -- everything: merchant, date, items, shares, totals
  expense_ids  text[] not null default '{}',   -- 1, or 2 for the guest route
  image_path   text,                   -- key in the private bucket
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index on splits (owner_id, created_at desc);

-- safety net: nothing is readable except through the server routes
alter table splits enable row level security;
```

That's it. No policies needed — RLS with **no policy means deny-all**, and every query goes
through a server route holding the service key, which bypasses RLS after checking `owner_id`
against the session (DB-4). The table is sealed to anyone else by default.

**Shape of `data`** (all money in integer cents — ACC-2):

```json
{
  "merchant": "Walmart Supercenter",
  "date": "2026-09-11",
  "currency": "USD",
  "items": [{ "name": "Organic Milk", "qty": 1, "cents": 549, "taxable": true,
              "people": ["u1","u2"] }],
  "subtotal": 4210, "tax": 347, "tip": 0, "fees": 0, "total": 4567,
  "payer": "u1",
  "group": "12345",
  "taxMethod": "flags",
  "shares": { "u1": 2240, "u2": 1310, "u3": 1017 }
}
```

**Two more tables, Session 3 only** — add them when you build those features, not before:

```sql
create table events   (id bigserial primary key, user_key text not null, name text not null,
                       props jsonb not null default '{}', created_at timestamptz default now());
create table feedback (id uuid primary key default gen_random_uuid(), user_key text not null,
                       category text not null, message text not null, contact text,
                       diagnostics jsonb, status text default 'new',
                       created_at timestamptz default now());
alter table events enable row level security;
alter table feedback enable row level security;
```

**Storage:** one private bucket `receipts`, path `{owner_id}/{split_id}.jpg`. Signed URLs
≤ 60s (DB-5). Compress client-side to ≤ 300 KB before upload (DB-6) — 1 GB then holds ~3,000
receipts.

*The fully normalised schema is in [requirements.md](requirements.md) §5c if you ever outgrow
this. You probably won't.*

---

## 4b. Setup — start to finish, about 15 minutes

**Supabase (5 min)**
1. supabase.com → **New organization** (Personal, Free) → **New project**. Region nearest you;
   save the DB password. Security settings: **Data API on**, **auto-expose new tables OFF**,
   **automatic RLS ON** — server-only access by default (DB-3).
2. **SQL Editor** → paste the `create table splits` block above → Run.
3. **Storage** → New bucket → name `receipts` → **Private** (not public).
4. **Settings → API** → copy `Project URL` and the `service_role` key.

**Vercel (5 min)**
5. Push the repo to GitHub → vercel.com → **Import Project**.
6. **Settings → Environment Variables** → paste the block from §1.
   `SUPABASE_SERVICE_KEY` is server-only — never prefix anything `NEXT_PUBLIC_`.
7. Add `vercel.json` with the daily cron (§1) so the project never pauses.

**Splitwise (5 min)**
8. `secure.splitwise.com/apps` → **Register an application**.
9. Callback URL: `https://<your-domain>/api/auth/callback` — add the localhost one too.
10. Copy the client id and secret into Vercel's env vars and `.env.local`.

**Total infrastructure: two dashboards, one table, one bucket, one cron.** Everything else is
application code.

---

## 5. Phases

Each phase ends with a **gate**. Don't start the next until the gate passes.

### Session 1 — the core (~4h10m)

**P1 · Scaffold, design tokens & primitives** — 50m
Next.js + **TypeScript strict** + Tailwind, **the full token layer from
[DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) §2–3 (colour incl. dark mode, type scale, space, radius,
elevation, motion)**, a **contrast-check script over the tokens**, plus the four button variants and `Input`/`Sheet`/`Toast` primitives with
**all seven states and their ARIA baked in** ([ACCESSIBILITY.md](ACCESSIBILITY.md) §6) — built
once, before any screen. Add `axe-core` + `eslint-plugin-jsx-a11y` to CI now, so violations fail
the build from commit one rather than being retrofitted. Security headers (SEC-13…16),
`.gitignore`, ESLint + Prettier, **Vitest configured**, the `app/ lib/ components/` skeleton
from [ARCHITECTURE.md](ARCHITECTURE.md) §3, `db/migrations/` folder, deploy to Vercel.
→ *Gate: production URL loads over HTTPS; CSP has no `unsafe-inline`; `npm test` runs; a
deliberate `any` fails the build; **a demo page shows every button/input/toast state in light
and dark**; **axe reports zero violations and the demo page is keyboard-navigable**.*

> **Why tokens come first, not last.** Building screens against hard-coded colours and then
> "adding a design system" means touching every file twice. Half an hour here saves two later,
> and it's what makes DESIGN-SYSTEM §13 (maintainability) true rather than aspirational.

**P2 · Auth** — 35m
OAuth2 with `state` (SEC-4), encrypted cookie session (SEC-2), fetch + cache groups/friends
(FR-11a), logout.
→ *Gate: sign in, see your real groups; `document.cookie` shows no token; bundle has no secret.*

**P3 · Extraction** — 45m
Includes the **Gemini → OCR.space → manual** fallback ladder (A1–A3).
Upload (magic-byte validation, 10 MB cap), PDF page-1 render, vision call, **Zod-validated**
JSON (SEC-10), tax flags (FR-16), sanity bounds (ACC-6).
→ *Gate: a real grocery receipt returns ≥90% correct items; a renamed `.exe` is rejected;
**forcing a Gemini failure falls through to OCR.space, and forcing both falls through to
manual entry**.*

**P3b · Gap fixes** — 35m
EXIF strip + orientation normalise (GAP-4), currency carry-through and mismatch warning
(GAP-2), duplicate near-match warning (GAP-3), **"Just split the total" mode** (GAP-1).
→ *Gate: a sideways photo extracts; a total-only receipt is still splittable; GPS never leaves
the device.*

**P4 · Review items** — 25m
Editable list, low-confidence highlighting (ACC-5), reconciliation checks 1 & 2 (ACC-3),
manual-entry fallback (FR-8).
→ *Gate: a mismatched subtotal is surfaced, not auto-corrected.*

**P5 · Assign & split math** — 45m
`lib/money.ts` + `lib/split.ts` first, **with unit tests before any UI**. Avatar toggles,
everyone-default (UX-6), live totals (UX-11), add-person sheet (FR-11d), split-into-N (FR-12a).
→ *Gate: 4 bags of tomatoes as 2/1/1 across A/B/C/D = $3.00 each, summing to $12.00; a 3-way
odd total sums to the cent.*

**P6 · Destination & submit** — 40m · ⚠️ **requires Splitwise Pro**
*Until Pro is purchased, P5 ends with a "Copy summary" fallback so the user can enter the
expense in Splitwise by hand — the app is still useful.*
Group picker with member matching (FR-19b), gap resolution (FR-19f), create group, the
two-expense guest route (FR-19g) with partial-failure reporting (FR-19h), idempotency (FR-22).
→ *Gate: expense appears correctly in the real Splitwise app; double-tap creates one.*

### Session 2 — persistence (~2h)

**P7 · Database & dashboard** — 50m
One table, one bucket (§4b), server-route ownership checks (DB-4), client-side compression,
dashboard list (DASH-1…5), `/api/health` + daily cron (GAP-14), cold-start state (DB-9).
→ *Gate: a second account cannot read the first's splits; a receipt URL leaks nothing when
logged out; the cron shows a successful run.*

**P8 · History & edit** — 40m
Reopen a split, edit, `update_expense` on the stored id (HIST-4/5), checks re-run (HIST-6).
→ *Gate: editing updates in place — no duplicate expense.*

**P9 · Delete / undo / archive** — 30m
Two-choice delete (DEL-1), 30s deferred deletion (DEL-4), flush-on-close with safe failure
(DEL-5), archive + restore + re-create (DEL-6/7).
→ *Gate: undo at 27s leaves Splitwise untouched — verified by no delete call being made.*

### Session 3 — surface (~3h10m)

**P10 · Metrics & admin** — 45m · events table, allowlist auth (SEC-26), three metric blocks.
→ *Gate: admin view contains no merchant, amount, name or email anywhere.*

**P11 · About / FAQ / Contact** — 30m · disclaimer (PAGE-3), FAQ seed, feedback form + inbox,
escaped rendering (FB-10).
→ *Gate: `<script>` in feedback renders harmlessly in the admin inbox.*

**P12 · Responsive, states & edge cases** — 1h40m
*(Tokens and primitives already exist from P1.)* Three-breakpoint layouts (UX-29…37), the
**six screen states** for every screen (DESIGN-SYSTEM §7), **error pages** — 404, 500, 403,
offline, session-expired (§8.3), stress cases (UX-38…44), local drafts (UX-17), accessibility
(UX-23…28), and a pass through the **edge-case sweep (§14)**, plus the full
[ACCESSIBILITY.md](ACCESSIBILITY.md) §11 manual pass — including **completing a whole split
with VoiceOver and the screen off**.
→ *Gate: stress table passes at 320/768/1440; keyboard-only completes the flow; 200% text and
400% zoom hold; zero axe violations; focus never obscured by the sticky CTA (WCAG 2.4.11);
VoiceOver walkthrough reads sensibly end to end.*

---

## 6. Build rules

1. **`lib/money.ts` and `lib/split.ts` are written and unit-tested before any UI touches them.**
   Everything else is recoverable; a money bug is not. Include the property test from
   [ARCHITECTURE.md](ARCHITECTURE.md) §10: *for any receipt and any assignment, shares sum to
   the total exactly.*
2. **Business logic never lives in an API route.** Routes authenticate, validate, delegate.
   The five-step route shape is in [ARCHITECTURE.md](ARCHITECTURE.md) §3.2.
3. **`lib/money` and `lib/split` import nothing.** No React, no Next, no Supabase. That's what
   keeps them testable in milliseconds.
4. **The server recomputes shares at submit** — the client's totals are a preview, never the
   source of truth.
5. **Reconciliation is enforced in code, never assumed** — ACC-3 check 3 hard-blocks submit.
6. **No secret leaves the server.** Every third-party call is a server route.
7. **Model output is untrusted input** — Zod-validated before it reaches any math.
8. **Every failure path gets built when its feature does,** not "later". The escape hatches
   are the difference between usable and abandoned.
9. **Each phase deploys.** No long-lived broken state.
10. **Strip EXIF before anything else touches the image** (GAP-4) — orientation first, so the
   model sees it upright; GPS removed, so location never leaves the device.
11. **Currency travels with the receipt** from extraction to submit (GAP-2). Never assume USD,
   never convert.
12. **Every screen that can be reached must be reachable at 320px** (UX-30) — check as you
   build, not in P12.
13. **No hard-coded colour, spacing, radius or duration in any component.** Tokens only
    ([DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) §13). This is what makes a rebrand one line.
14. **A screen isn't done until all six states exist** — empty, loading, partial, success,
    error, offline (§7). Building only the success case is what makes apps feel broken.
15. **A component isn't done until all seven states exist** — default, hover, active, focus,
    disabled, loading, error (§5).
16. **Exactly one primary CTA per screen.** If two things are indigo, one of them is wrong.
17. **Never disable a button without saying why** — a dead grey button with no explanation is
    the most common dead end in apps like this.
18. **Semantic HTML first, ARIA only where HTML can't express it.** A `<div role="button">` is a
    defect when `<button>` exists. No ARIA beats bad ARIA.
19. **Every input gets a visible label**, helper text via `aria-describedby`, errors via
    `role="alert"` — wired when the component is built, never retrofitted.
20. **`--text-subtle` is never used for text** (2.8:1, fails AA). Helper text and placeholders
    use `--text-muted`; error text uses `--danger-text`.
21. **Control boundaries use `--border-interactive`** (3.7:1), never the decorative greys —
    WCAG 1.4.11 needs ≥3:1 and `--border-strong` is 1.5:1.
22. **Colour never identifies a person.** Initials render on every avatar at every size; the
    accessible name carries the full name; assigned state is fill + ring + ✓, never hue. The
    palette is decorative by design — see [ACCESSIBILITY.md](ACCESSIBILITY.md) §3.2 for why a
    fully colour-blind-safe 8-colour palette is impossible here.
23. **A contrast checker runs over the token file in CI.** Any new colour that fails its
    intended use fails the build. Colours are computed, never eyeballed — the first draft of
    the palette had seven failures that all looked fine.

---

## 6b. Decisions — all made

Nothing here is left open. Every layer is free, and the single thing that could stop the app
has a fallback behind it.

| # | Decision | **Chosen** | Why |
|---|---|---|---|
| D1 | Session 1 scope | **P0–P5 free first, P6 after the Pro decision** | Only P6 needs the paid API; everything hard is free |
| **D9** | **Splitwise Pro (~$40–60/yr)** | **Open — yours to decide after seeing 1a work** | Build first, pay later, if at all |
| D2 | Database + host | **Supabase + Vercel**, daily keep-alive cron | Only free tier with Postgres + storage + RLS together |
| D3 | Vision provider | **Gemini → OCR.space → manual entry** | Two independent free quotas, **neither needs a credit card**; manual entry always works |
| D4 | At quota exhaustion | **Degrade, never fail** — switch provider, then offer manual entry | A slow path beats a dead app |
| D5 | Per-user money in admin | **Excluded** | Counts, not finances (MET-3) |
| D6 | Two-expense guest route | **Build in v1** | It's Scenario 2 — the case that made the group picker necessary |
| D7 | Domain | **`gauravide.vercel.app`** to start | Free forever. A custom domain is ~$10/yr, optional, later |
| D8 | Monitoring | **UptimeRobot free** on `/api/health` | "Never stops" is only real if you find out before your users do |

---

## 6b2. Before sharing it with anyone but yourself

None of these block building. All of them matter the day you send someone the link.

| # | Gate | Status | Action |
|---|---|---|---|
| 1 | **Do users need Pro?** (V0) | ❓ unknown | Email support + test with the free account |
| 2 | **Gemini quota is per-project** | ⚠️ known | ~20 active users can exhaust the daily free limit **for everyone**. Ladder covers it; watch MET-16 |
| 3 | **Vercel Hobby is non-commercial** | ⚠️ known | Fine while free. Charging means Vercel Pro or Cloudflare Pages |
| 4 | **"Replicates existing Splitwise functionality"** clause | ⚠️ **real risk** | Pro includes receipt scanning. Personal use ≈ no risk; **before public sharing, email developers@splitwise.com and get it in writing** |
| 4b | **Can never charge for it** | ⚠️ binding | *"may not be used in connection with any fee-based service"* — no subscription, no ads, ever |
| 4c | **They can cap your user count** | ⚠️ at their discretion | No published number; assume nothing |
| 5 | **Privacy policy — mandatory, not optional** | 📝 drafted | Their terms *require* a lawful GDPR/CCPA-compliant policy that doesn't conflict with Splitwise's. The About page must be a real policy |
| 6 | Supabase free tier | ✅ fine | ~500 users before storage pressure |
| 7 | Support burden | ✅ planned | Feedback inbox exists (FB-1…11) |

**Sequence that avoids wasted money:** build 1a free → decide on Pro → build 1b → test with the
free second account → *then* decide about sharing.

---

## 6c. The always-on design

Each layer, what could stop it, and what's behind it.

| Layer | Choice | Cost | Could it stop? | Behind it |
|---|---|---|---|---|
| **Frontend** | Next.js on Vercel Hobby | Free | No — serverless, never sleeps | 100 GB/mo is far beyond personal use |
| **Backend** | Next.js API routes, same deploy | Free | No | Nothing separate to keep alive |
| **Database** | Supabase Postgres | Free | Pauses at 7 days idle | **Daily cron** (§1) + cold-start state (DB-9) |
| **File storage** | Supabase Storage, private bucket | Free | No | 1 GB ≈ 3,000 compressed receipts |
| **Receipt reading** | **Gemini** | Free | **Yes — daily project quota** | **→ OCR.space → manual entry** |
| **Receipt reading (2nd)** | OCR.space | Free, no card | 25k requests/mo | → manual entry |
| **Splitwise API** | OAuth2 + REST | **Paid — needs Pro** | Lapsed subscription stops it | "Copy summary" manual fallback |
| **Cron** | Vercel Cron (1/day on Hobby) | Free | Rarely | GitHub Actions or cron-job.org |
| **Monitoring** | UptimeRobot | Free | — | Email alert on `/api/health` failure |
| **Domain** | `*.vercel.app` | Free | No | — |

### The one real weak point, and how it's covered

**Vision API quota is per-project, not per-user** (GAP-12). Twenty busy users could exhaust
Gemini's daily free limit and extraction would stop **for everyone**. This is the only part of
the stack that can genuinely go down, so it gets a three-step ladder:

```
   Gemini  ──quota/error──▶  OCR.space  ──quota/error──▶  Manual entry
    free                      free                        always works
    no card                   no card                     no API at all
```

- **A1** The extract route tries Gemini, falls back to OCR.space on quota or error, and **always**
  offers manual entry (FR-8). A user is never blocked from splitting a bill.
- **A2** Per-user rate limit (SEC-12) so one person can't burn the shared quota.
- **A3** When both providers are exhausted, say it plainly: *"Scanning is busy right now — you
  can type the items in, it takes a minute."* Never a raw error.
- **A4** Track provider failures as metrics (MET-16) so you see it coming.

**Cost if you ever outgrow free:** paid vision is roughly $0.001–0.01 per receipt. A thousand
receipts a month is a few dollars. There is no cliff where this suddenly becomes expensive.

### What "free forever" actually means here

Everything above stays free at personal and small-group scale, permanently — these are free
*tiers*, not trials. Two honest caveats, neither affecting you now:

- **Vercel Hobby is non-commercial.** If you ever charge for Gauravide, you need Pro (~$20/mo)
  or move to Cloudflare Pages (free, commercial use allowed).
- **Nothing here expires**, unlike Render's databases or PlanetScale's discontinued free tier.

---

## 7. Definition of done — Session 1

- [ ] A real receipt becomes a correct, itemised Splitwise expense in under 60 seconds.
- [ ] Per-person shares sum to the receipt total to the cent on an odd 3-way total.
- [ ] No API key in the bundle; no token in `document.cookie`.
- [ ] Oversized and wrong-type files are rejected cleanly.
- [ ] Every failure path offers a next step.
- [ ] Works one-handed on a phone.
- [ ] A receipt with no readable items can still be split by total (GAP-1).
- [ ] A sideways iPhone photo extracts correctly, and its GPS never leaves the device (GAP-4).
- [ ] A revoked token prompts re-auth without losing the in-progress split (GAP-5).

Full criteria: [requirements.md](requirements.md) §7.
