# Gauravide — Architecture

*How the system is put together, and why. Written to be read by someone new to the codebase.*

Specs: [requirements.md](requirements.md) · Flow: [userflow.md](userflow.md) · Build order: [plan.md](plan.md)

---

## 1. The system in one picture

```
                    ┌─────────────────────────────────────┐
   BROWSER          │  Next.js client (React)             │
   untrusted        │  · screens, state, live totals      │
                    │  · NO keys, NO business math         │
                    └──────────────┬──────────────────────┘
                                   │  fetch() — same origin, cookie auth
 ══════════════════════════════════╪══════════════════ TRUST BOUNDARY ══
                                   │
                    ┌──────────────▼──────────────────────┐
   SERVER           │  Next.js API routes (Vercel)        │
   trusted          │  · auth · validation · rate limits  │
                    │  · the ONLY place keys exist        │
                    └──┬────────────┬───────────┬─────────┘
                       │            │           │
              ┌────────▼──┐  ┌──────▼─────┐  ┌──▼──────────┐
              │ lib/      │  │ Gemini     │  │ Supabase    │
              │ money     │  │ ↓ OCR.space│  │ Postgres +  │
              │ split     │  │ ↓ manual   │  │ Storage     │
              │ receipt   │  └────────────┘  └─────────────┘
              │ splitwise │
              └─────┬─────┘
                    │
              ┌─────▼──────┐
              │ Splitwise  │
              │ REST API   │
              └────────────┘
```

**One rule explains most of the design:** everything valuable — API keys, money math, database
access — lives on the server side of that boundary. The browser renders and collects taps.

---

## 2. Principles

| # | Principle | What it rules out |
|---|---|---|
| P1 | **Secrets never cross the boundary** | No `NEXT_PUBLIC_` key, no direct third-party call from the browser |
| P2 | **Money math lives in one pure module** | No arithmetic scattered across components |
| P3 | **Validate at every boundary** | No untrusted data (user *or* model) reaching logic unchecked |
| P4 | **The receipt is the source of truth** | No estimating, no inferring, no silent correction |
| P5 | **Fail toward "nothing was destroyed"** | No irreversible action without an undo window |
| P6 | **Boring, few dependencies** | Every package on a financial app is supply-chain risk |
| P7 | **Each layer is replaceable** | Vision provider, database, and Splitwise each sit behind one module |

---

## 3. Layers

### 3.1 Client (`app/**/page.tsx`, `components/`)

Renders screens, holds in-progress split state, updates running totals as you tap.

**Does:** presentation, local state, optimistic UI, local drafts (UX-17).
**Never:** talks to a third party, holds a key, or decides what anyone owes.

> Running totals in the browser are a *preview*. The authoritative shares are recomputed
> server-side at submit using the same `lib/split` module. The client cannot be the reason a
> number is wrong.

### 3.2 API routes (`app/api/**/route.ts`)

The trust boundary. Every route does the same five things in the same order:

```ts
export async function POST(req: Request) {
  const session = await requireSession()            // 1. authenticate
  await rateLimit(session.userId, 'extract')        // 2. throttle
  const input = Schema.parse(await req.json())      // 3. validate (Zod)
  const result = await service.doTheThing(input)    // 4. delegate — no logic here
  return Response.json(result)                      // 5. shape the response
}
```

Routes are thin on purpose: **no business logic lives here**, so it can't drift between
endpoints and can be unit-tested without HTTP.

### 3.3 Services (`lib/`)

Where the actual work happens. Pure where possible, I/O isolated where not.

| Module | Responsibility | Pure? |
|---|---|---|
| `money.ts` | Integer cents, largest-remainder rounding | ✅ pure |
| `split.ts` | Assignments → per-person shares, tax allocation | ✅ pure |
| `receipt.ts` | Vision providers + the fallback ladder + Zod schema | ❌ I/O |
| `splitwise.ts` | Typed client for the Splitwise API | ❌ I/O |
| `session.ts` | Encrypted cookie read/write | ❌ I/O |
| `db.ts` | Supabase access, ownership checks | ❌ I/O |
| `events.ts` | Analytics — financial content physically cannot enter | ❌ I/O |

**`money.ts` and `split.ts` are the heart of the application.** They are pure functions with no
network, no database, no framework. Every money rule is tested there, in milliseconds, without
mocking anything.

### 3.4 Data

Postgres for structured records, object storage for receipt images, an encrypted cookie for
the session. **No server-side session store** — nothing to scale, nothing to leak.

---

## 4. Dependency rule

```
   app/  ──▶  lib/  ──▶  external
     ▲          │
     └──────────┘   ✗  lib/ never imports from app/
```

- `lib/money` and `lib/split` import **nothing** — not React, not Next, not Supabase.
- I/O modules may import pure modules. Never the reverse.
- Components never import `lib/splitwise` or `lib/db` directly. They call routes.

This is what makes the core testable and the providers swappable.

---

## 5. The main flow, end to end

```
  1. Client      POST /api/receipt/extract        { image }
  2. Route       auth → rate limit → size/magic-byte check
  3. receipt.ts  strip EXIF (orientation + GPS)   ← GAP-4
  4. receipt.ts  Gemini ──fail──▶ OCR.space ──fail──▶ { needsManualEntry: true }
  5. receipt.ts  Zod.parse(modelOutput)           ← model output is untrusted (P3)
  6. receipt.ts  sanity bounds: negatives, tax>25%, item>total   ← ACC-6
  7. Client      user reviews and edits items     ← the machine proposes (P4)
  8. Client      user assigns people; totals preview locally
  9. Client      POST /api/splitwise/expense      { items, assignments, payer, group }
 10. Route       auth → validate → split.compute() ← authoritative recompute
 11. Route       assert Σ shares === total        ← ACC-3, hard block
 12. splitwise   create_expense (idempotency key)
 13. db.ts       persist split + image            (Session 2)
 14. events.ts   record { name, itemCount } only  ← no financial content
```

Steps 10–11 are the ones that matter. The client's numbers are never trusted; the server
recomputes from raw assignments and refuses to submit unless the arithmetic closes exactly.

---

## 6. Data model

**One table, one JSONB column** — deliberate, not lazy. The app performs exactly two reads:
*list my splits* and *open one split*. It never queries inside line items, so normalising them
would buy joins and migrations and return nothing.

```sql
create table splits (
  id           uuid primary key default gen_random_uuid(),
  owner_id     text not null,
  data         jsonb not null,        -- merchant, date, items, shares, totals
  expense_ids  text[] not null default '{}',
  image_path   text,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index on splits (owner_id, created_at desc);
alter table splits enable row level security;   -- no policy = deny all
```

**Session 3 adds two more:** `events` (analytics, no financial content) and `feedback`.

**Access model — three layers, each independently sufficient:**

| Layer | Protection |
|---|---|
| Network | Table has no policy → unreachable from any browser key |
| Application | Every query filters `owner_id` from the session cookie |
| Configuration | New tables not auto-exposed; RLS auto-enabled |

**Images:** private bucket, `{owner_id}/{split_id}.jpg`, signed URLs ≤ 60s. Never public.

**Migrations:** plain `.sql` files in `db/migrations/`, applied in order, never edited after
being run. Committed to git — the schema's history is part of the code's history.

---

## 7. Security architecture

**Trust boundary** is the API route. Below it, everything is trusted; above it, nothing is.

| Asset | Where it lives | Never |
|---|---|---|
| Vision + Splitwise keys | Server env vars | In the bundle, in a response |
| Supabase secret key | Server env vars | In the browser, in git |
| User's Splitwise token | Encrypted `HttpOnly` cookie | In the database, in JS |
| Receipt images | Private bucket, signed URLs | Public, guessable |
| Receipt contents | `splits.data`, owner-scoped | In logs, in analytics |

**Two independently untrusted inputs**, both Zod-validated before touching logic:
1. **The user** — files, form fields, feedback text
2. **The vision model** — its JSON is a network response from a system that can hallucinate

**Logging discipline:** request ids and error *types* only. Never item names, amounts,
participants, or tokens. This is enforced by never passing those objects to a logger.

---

## 8. Reliability

**The one genuine single point of failure is the vision API** — its free quota is per-project,
so one busy day could stop extraction for everyone. Hence a ladder, not a fallback:

```
   Gemini ──quota/error──▶ OCR.space ──quota/error──▶ Manual entry
                                                      (no API at all)
```

Every other layer degrades gracefully: Splitwise down → work preserved, retry offered.
Database cold → "waking up", draft intact. Extraction impossible → type it in.

**Nothing in the app can reach a state where the user is stuck holding a receipt.**

---

## 9. Observability

- **Errors:** typed and counted by category (`extraction_failed`, `splitwise_5xx`,
  `reconciliation_failed`).
- **`reconciliation_failed` must always be zero.** It is an alarm, not a metric — any non-zero
  value means the money math produced something impossible.
- **Usage analytics** answer *is this easy to use* — median upload→submit, drop-off by screen,
  edit rate, undo rate — and contain no financial content by construction.
- **Uptime:** external monitor on `/api/health`, which also keeps the database warm.

---

## 10. Testing

| Layer | Approach | Why that depth |
|---|---|---|
| `money.ts`, `split.ts` | **Unit, exhaustive** — odd totals, 3-way rounding, coupons, unit splits, tax flags | A bug here silently miscounts real money |
| `lib/receipt` schema | Unit — malformed and hostile model output | The model is untrusted input |
| API routes | Integration — auth, validation, rate limits, ownership | The trust boundary |
| Flow | One end-to-end happy path + one failure path | Guards the four-tap promise |
| Layout | Manual stress pass: 320px, 50 items, 10 people, 60-char names | Non-breakable (UX-38…44) |

**Property-based testing on the split math** is worth the hour: for any receipt and any
assignment, per-person shares must always sum to exactly the total. That single property
catches more than a hundred hand-written cases.

---

## 11. Scaling — what breaks, and when

Honest about the fact that this is a personal app that might get shared.

| Users | What breaks first | Fix |
|---|---|---|
| 1–20 | Nothing | — |
| ~50 | **Gemini daily quota** | Ladder already handles it; consider paid vision (~$0.001–0.01/receipt) |
| ~500 | Supabase 500 MB / 1 GB storage | Compress harder, archive old images, or upgrade |
| ~5,000 | Vercel Hobby bandwidth; Hobby is non-commercial | Vercel Pro or Cloudflare Pages |
| Any | Splitwise Pro lapses | Everything stops — see [requirements.md](requirements.md) §4 |

**The architecture doesn't change at any of these steps.** Stateless routes scale horizontally
for free; the database is the only stateful component and it's one indexed table. Nothing here
needs rewriting to grow — only paying.

---

## 12. Key decisions and why

| # | Decision | Reason | If we're wrong |
|---|---|---|---|
| A1 | Next.js full-stack, not separate frontend/backend | One deploy, one language, no CORS, no second service to keep alive | Split later; routes are already thin |
| A2 | No database in Session 1 | Nothing stored = nothing to breach, and it ships faster | Session 2 adds it without touching the flow |
| A3 | One JSONB table, not three | Two query shapes, zero item-level queries | Normalise when a real query demands it |
| A4 | Money in integer cents, one pure module | Floats produce shares that don't sum | — |
| A5 | Server recomputes shares at submit | The client can be wrong, tampered with, or stale | — |
| A6 | Vision provider behind one module | The one layer likely to change | Swap in an hour |
| A7 | Encrypted cookie, no session store | Nothing to scale, nothing to leak | Move to DB sessions if we ever need revocation |
| A8 | Splitwise is optional in v1 | Their API now needs a paid subscription | The app is useful without it |

---

## 13. Conventions

- **TypeScript strict.** No `any` — use `unknown` and narrow.
- **Money is `number` of cents, always named `*Cents`.** A variable called `price` is a bug
  waiting to happen; `priceCents` is not.
- **Zod schemas live next to the boundary they guard**, exported as types.
- **Errors are typed values, not thrown strings.** Routes map them to status codes in one place.
- **Files under ~200 lines.** A long file is usually two modules.
- **No comment explains *what* — only *why*.** The what is the code.
