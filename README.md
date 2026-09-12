# Gauravide

**Split a receipt in 30 seconds.** Snap a photo, tap who shares what, and it lands in Splitwise.

*Gaurav + divide — every bill, divided fairly.*

---

## Status

**Phase 1 complete** — scaffold, design tokens, UI primitives, CI gates.

| Phase | Scope | State |
|---|---|---|
| P1 | Scaffold, tokens, primitives, security headers, CI | ✅ done |
| P2 | Splitwise OAuth | ⏸ blocked — needs Splitwise Pro |
| P3 | Receipt extraction (Gemini → OCR.space → manual) | next |
| P4 | Review & edit items | |
| P5 | Assignment + split math | |
| P6 | Destination group + push to Splitwise | ⏸ needs Pro |
| P7–P9 | Supabase, dashboard, history, delete/undo/archive | |
| P10–P12 | Metrics, About/FAQ/Contact, responsive & a11y pass | |

Full build order: [plan.md](plan.md).

---

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

Environment variables live in `.env.local` (git-ignored). See
[NEEDED-FROM-ME.md](NEEDED-FROM-ME.md) for how to obtain each one.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run verify` | **typecheck + lint + contrast + tests** — run before every commit |
| `npm run check:contrast` | WCAG 2.2 AA gate over `app/tokens.css` |
| `npm test` | Unit tests |

---

## Documentation

| Document | What's in it |
|---|---|
| [requirements.md](requirements.md) | Every rule, numbered — functional, security, accuracy, usability |
| [userflow.md](userflow.md) | Screens, scenarios, edge cases |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers, trust boundary, data model, testing, scaling |
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | Tokens, components, states, copy, error handling |
| [ACCESSIBILITY.md](ACCESSIBILITY.md) | WCAG 2.2 AA + ADA — ARIA, contrast, VoiceOver, test plan |
| [plan.md](plan.md) | Build order, setup, phase gates, decisions |
| [NEEDED-FROM-ME.md](NEEDED-FROM-ME.md) | Account setup checklist |

---

## Principles that constrain the code

1. **Money is integer cents**, in one pure module. No floats, ever.
2. **The server recomputes shares at submit** — the client's totals are a preview.
3. **Secrets never reach the browser.** Every third-party call goes through an API route.
4. **Model output is untrusted input** — Zod-validated before it touches any math.
5. **No hard-coded colour, spacing or duration.** Tokens only; CI enforces it.
6. **A screen isn't done until all six states exist** — empty, loading, partial, success,
   error, offline.
7. **Accessibility is a build gate**, not a review comment.

---

## A note on Splitwise

Splitwise now requires an active **Splitwise Pro** subscription to register a third-party API
application. The API itself is free; Pro is the gate. Phases P1–P5 have no Splitwise dependency
at all — the app scans, splits and computes exact shares without it.

Not affiliated with, endorsed by, or sponsored by Splitwise.
