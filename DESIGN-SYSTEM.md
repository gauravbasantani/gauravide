# Gauravide — Design System

*Tokens, components, states, copy, and error handling. The implementation contract for the UI.*

Rules: [requirements.md](requirements.md) §5f · Screens: [userflow.md](userflow.md) · Code: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## 1. The feeling we're going for

**Calm, confident, quick.** A money app that doesn't make you anxious.

Minimal is not bare. The richness comes from **type, spacing, alignment and motion done
properly** — not from more elements. Every visual decision answers one question:

> *Does this help someone split a bill faster, or trust the number more?*

If not, it's decoration. Remove it.

---

## 2. Colour

### 2.1 Why these colours

**Primary is indigo, deliberately not green.** Splitwise owns teal-green, and Gauravide must
not echo it (PAGE-9) — we're a separate product that integrates with them, and looking like a
clone is both a trademark risk and confusing. Indigo reads trustworthy and modern, and holds up
in dark mode where green tends to glow.

**Amber is the secondary**, used for attention rather than action — the "invited" dot, warnings,
a low-confidence field. It's warm, it separates cleanly from indigo, and it ties to the food /
receipt context.

### 2.2 Tokens

Defined once as CSS custom properties. **Never hard-code a colour in a component.**

```css
:root {
  /* ── Brand ───────────────────────────────── */
  --primary:          #4F46E5;   /* indigo 600 — CTAs, assigned state */
  --primary-hover:    #4338CA;
  --primary-active:   #3730A3;
  --primary-subtle:   #EEF2FF;   /* tinted backgrounds */
  --primary-on:       #FFFFFF;   /* text on primary */

  --secondary:        #F59E0B;   /* amber — FILLS and large marks only (2.2:1 on white) */
  --secondary-strong: #B45309;   /* 5.0:1 ✓ — small indicators: the "invited" dot,
                                    icons, anything that must be PERCEIVED to be understood */
  --secondary-subtle: #FFFBEB;

  /* ── Semantic ────────────────────────────── */
  /* Each has a -text variant that passes AA on white. The base tones are for
     FILLS and ICONS only — used as text on white they fail 4.5:1. See §12. */
  --success:          #059669;   /* large icons only — 3.8:1        */
  --success-text:     #047857;   /* 5.5:1 ✓ text                    */
  --success-fill:     #047857;   /* 5.5:1 ✓ white label on the fill */
  --success-subtle:   #ECFDF5;
  --warning:          #D97706;   /* large icons only — 3.2:1        */
  --warning-text:     #B45309;   /* 5.0:1 ✓ text                    */
  --warning-fill:     #B45309;   /* 5.0:1 ✓ white label on the fill */
  --warning-subtle:   #FFFBEB;
  --danger:           #E11D48;   /* fill — 4.3:1, NOT for small text */
  --danger-text:      #BE123C;   /* 5.9:1 ✓ — error messages use this */
  --danger-hover:     #BE123C;
  --danger-subtle:    #FFF1F2;

  /* ── Neutrals ────────────────────────────── */
  --bg:               #FFFFFF;
  --bg-subtle:        #F8FAFC;   /* page background */
  --surface:          #FFFFFF;   /* cards, sheets */
  --border:           #E2E8F0;   /* 1.2:1 — DECORATIVE dividers only */
  --border-strong:    #CBD5E1;   /* 1.5:1 — decorative emphasis only   */
  --border-interactive: #78859A; /* 3.7:1 ✓ — inputs, toggles, any control
                                    boundary. WCAG 1.4.11 needs ≥3:1 and the
                                    lighter greys above do not reach it.    */
  --text:             #0F172A;   /* primary text — 17.9:1 */
  --text-muted:       #64748B;   /* meta, captions, HELPER TEXT — 4.8:1 ✓ */
  --text-subtle:      #94A3B8;   /* 2.8:1 — DECORATIVE ONLY, never text.
                                    Placeholders and helper text use --text-muted. */

  /* ── Focus ───────────────────────────────── */
  /* SOLID, with a background-coloured gap so it reads on any surface.
     A translucent ring blends toward the background: 35% indigo on white
     lands at 1.76:1 and fails WCAG 1.4.11 (needs 3:1). Solid = 6.3:1. */
  --focus-ring:       0 0 0 2px var(--bg), 0 0 0 4px var(--primary);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --primary:        #818CF8;   /* lighter — indigo 600 is too dim on dark */
    --primary-hover:  #A5B4FC;
    --primary-active: #C7D2FE;
    --primary-subtle: #1E1B4B;
    --primary-on:     #1E1B4B;

    --secondary:        #FBBF24;
    --secondary-strong: #FBBF24;   /* 8.8:1 on --surface — light-on-dark already passes */
    --secondary-subtle: #292010;

    --success: #34D399;  --success-subtle: #022C22;
    --warning: #FBBF24;  --warning-subtle: #292010;
    --danger:  #FB7185;  --danger-hover: #FDA4AF;  --danger-subtle: #2A1218;

    --bg:            #0B1120;
    --bg-subtle:     #0F172A;
    --surface:       #1E293B;
    --border:        #334155;         /* decorative */
    --border-strong: #475569;         /* decorative */
    --border-interactive: #8794A6;    /* 3.4:1 on --surface ✓ */
    --text:          #F1F5F9;
    --text-muted:    #94A3B8;
    --text-subtle:   #64748B;

    --focus-ring:    0 0 0 2px var(--bg), 0 0 0 4px var(--primary);  /* 4.9:1 ✓ */
  }
}
```

**Dark mode is designed, not inverted.** Primary lightens, surfaces lift off a near-black page,
and shadows are replaced by borders (shadows are invisible on dark).

### 2.3 Person colours

Each participant gets a stable colour across the entire app — avatar, running total, their line
on the confirm screen. This is where the UI becomes visually rich *and* easier to scan.

**Colour here is decoration, not identity.** That distinction is the whole design.

I tried three times to build a palette where colour alone could tell eight people apart for
every kind of vision. **It is mathematically impossible** within our constraints, and the
attempts are worth recording so nobody retries them:

| Attempt | Result |
|---|---|
| Bright categorical (cyan/orange/gold/lime…) | 5 of 8 failed AA with white initials; rust↔amber were **ΔE 2.0** under deuteranopia — identical |
| Optimised for dichromat separation | Separable, but garish magenta-heavy. Not a palette you'd want |
| Optimised for dichromacy **+ greyscale** | **Even 4 colours dropped below ΔE 11.** Greyscale demands lightness spread; AA-with-white confines lightness to a narrow band. The two requirements are incompatible |

**So identity never rests on colour:**

1. **Initials are always visible** on every avatar, at every size. They are the identifier.
2. **The accessible name carries the full name** — *"Alex Kumar, sharing Organic Milk"*.
3. **Assigned vs unassigned** — the only *functional* state — is conveyed by **fill + ring + ✓
   badge**, never hue.
4. Colour is then free to be chosen for **beauty**, which is what makes the avatar row look
   considered rather than like a chart legend.

```css
/* light mode — white initials, all ≥ 5.4:1 */
--person-1: #4338CA;  /* indigo   7.9 */   --person-5: #6D28D9;  /* violet  7.1 */
--person-2: #0F766E;  /* teal     5.5 */   --person-6: #155E75;  /* cyan    7.3 */
--person-3: #9F1239;  /* rose     8.0 */   --person-7: #065F46;  /* emerald 7.7 */
--person-4: #92400E;  /* amber    7.1 */   --person-8: #86198F;  /* plum    8.2 */
```

```css
/* dark mode — lighter fills, DARK initials, all ≥ 9:1 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --person-1: #A5B4FC;  --person-5: #C4B5FD;
    --person-2: #5EEAD4;  --person-6: #67E8F9;
    --person-3: #FDA4AF;  --person-7: #6EE7B7;
    --person-4: #FCD34D;  --person-8: #F0ABFC;
    --person-on: #0B1120;
  }
}
```

Deep, even-chroma jewel tones in one family — rich without being loud, and coherent beside the
indigo primary. Assigned by stable hash of the person's id, so someone keeps their colour
between sessions. Beyond 8, cycle: the initials still disambiguate.

### 2.4 Colour rules

- **Colour never carries meaning alone.** Assigned avatars differ by **fill + ring + checkmark**,
  not hue. Strip every colour out and the UI still works.
- **One primary action per screen** gets `--primary`. If two things are indigo, one is wrong.
- **`--danger` appears only on destructive actions.** Never as an accent.
- **`--success` appears in exactly one place:** the `✓ matches receipt` confirmation. Rare use
  is what makes it mean something.
- All text pairs meet **WCAG 2.2 AA** (4.5:1 body, 3:1 large, 3:1 for UI component boundaries).
- **The focus ring is solid, never translucent.** A 35%-alpha ring blends toward its
  background and lands at 1.76:1 — invisible to the people who most need it. The token uses a
  background-coloured gap plus a solid `--primary` ring, so it reads at ≥4.9:1 on every surface
  in both themes.
- **`--secondary` (amber) is for fills and large marks only** — at 2.2:1 on white it fails as a
  small indicator. The "invited" dot, warning icons and low-confidence borders use
  `--secondary-strong` (5.0:1), and always carry a word or icon alongside.
- **`--text-subtle` is never used for text.** At 2.8:1 it fails AA. Placeholders, helper text
  and disabled labels all use `--text-muted` (4.8:1).
- **`--border` and `--border-strong` are decorative only.** At 1.2:1 and 1.5:1 they're fine as
  dividers between rows, but any **control boundary** — input, toggle, secondary button —
  needs `--border-interactive` to satisfy WCAG 1.4.11 (3:1 non-text contrast). This is the
  most commonly missed criterion in otherwise-accessible design systems.
- **Person colours carry white initials in light mode, dark initials in dark mode** — all
  ≥5.4:1. But colour is **never** how a person is identified: the initials are, always.
- **`--success` and `--warning` are large-icon tones only.** A white label on `#059669` is
  3.8:1 and fails — badges and pills use `--success-fill` / `--warning-fill`.
  Full tables: [ACCESSIBILITY.md](ACCESSIBILITY.md) §3.

---

## 3. Type, space, radius, elevation

### Type
Full scale in [requirements.md](requirements.md) §5f (TYPE-1…12). The short version:

| Role | Size / Weight | Use |
|---|---|---|
| Display | 32 / 600 | The receipt total |
| Title | 24 / 600 | Screen titles |
| Section | 18 / 600 | Group headers |
| Body | 16 / 400 | Items, prose |
| Body-strong | 16 / 600 | Per-person totals |
| Meta | 14 / 400 | Dates, context |
| Caption | 13 / 400 | Helper text |
| Label | 12 / 500 | Status chips |

System font stack. Three weights. `tabular-nums` on **every** number. All sizes in `rem`.

### Space — 4px base
```
--space-1: 4px    --space-4: 16px   --space-8: 32px
--space-2: 8px    --space-5: 20px   --space-10: 40px
--space-3: 12px   --space-6: 24px   --space-12: 48px
```
Screen gutters: **16px** phone, **24px** tablet, **32px** desktop.

### Radius
```
--radius-sm: 6px     inputs, chips
--radius-md: 10px    buttons, cards
--radius-lg: 16px    sheets, modals
--radius-full: 999px avatars, pills
```

### Elevation
```
--shadow-sm: 0 1px 2px rgb(15 23 42 / .06)                        cards
--shadow-md: 0 4px 12px rgb(15 23 42 / .08)                       dropdowns
--shadow-lg: 0 12px 32px rgb(15 23 42 / .16)                      modals, sheets
```
**Dark mode uses borders instead of shadows.** Elevation means *interactive or floating* —
never decoration.

---

## 4. Buttons — the CTA hierarchy

Exactly four kinds. More than four is indecision.

| Kind | Looks like | Use | Per screen |
|---|---|---|---|
| **Primary** | Filled `--primary`, white text | **The one thing to do next** — *Add to Splitwise*, *Looks right* | **Exactly 1** |
| **Secondary** | `--surface` fill, `--border-interactive` outline | The alternative — *Back*, *Use No group* | 0–2 |
| **Tertiary** | Text only, `--primary` | Minor, inline — *Type it in instead*, *Add item* | any |
| **Destructive** | `--danger` fill, or outline when not the main action | Delete, permanent removal | 0–1 |

### Every state, specified

| State | Primary button |
|---|---|
| Default | `--primary` fill, `--primary-on` text, `--radius-md`, 44px min height |
| Hover *(pointer devices only)* | `--primary-hover`, 120ms |
| Active | `--primary-active`, `scale(0.98)` |
| Focus | `--focus-ring` — solid 2px gap + 2px `--primary`, ≥3:1 on any surface |
| Disabled | 40% opacity, `cursor: not-allowed`, **tooltip or inline text saying why** |
| Loading | Spinner replaces label, **width locked** so the layout doesn't jump, button disabled |
| Success | Brief ✓ (600ms) before navigating — confirms the action landed |

> **Never disable a button without explaining why.** A dead grey button with no reason is the
> most common dead-end in apps like this. Say *"Assign everyone to an item first"*.

### Placement
- **Mobile:** primary CTA is full-width, in the bottom third, `position: sticky` above the safe
  area. Thumb-reachable one-handed (UX-24).
- **Tablet/desktop:** right-aligned in the action row; Enter triggers it.

---

## 5. Components and their states

Every component must define **all seven**: `default · hover · active · focus · disabled ·
loading · error`. A component that hasn't defined them isn't finished.

### Avatar toggle *(the most-tapped element in the app)*

| State | Appearance |
|---|---|
| Unassigned | Outline ring, initials in `--text-muted`, transparent fill |
| Assigned | Filled with the person's colour, white initials, **small ✓ badge** |
| Assigned + invited | As above plus a `--secondary-strong` dot at top-right, **and the word *invited*** in the sheet — never the dot alone |
| Pressing | `scale(0.92)`, spring back over 150ms |
| Focus | `--focus-ring` |
| Disabled | 40% opacity |

Minimum **44×44px** including padding, even when the circle renders smaller.

### Item row
`default` · `editing` (inline field, no mode switch) · `low-confidence` (`--secondary-strong` left border +
`--secondary-subtle` tint + an icon) · `unassigned` (⚠ badge, blocks progress) · `split-into-N` (indented,
labelled *1 of 4*).

### Input field
`default` · `focus` (`--primary` border + ring) · `filled` · `error` (`--danger` border,
message **below** in `--danger-text`, never a tooltip) · `disabled` · `loading`.

**Always a visible `<label>`** — never placeholder-as-label (it disappears on typing, and
screen readers treat it as a hint, not a name). Helper text sits below the field in
`--text-muted` and is wired with `aria-describedby`; the error message replaces it and adds
`aria-invalid`. See [ACCESSIBILITY.md](ACCESSIBILITY.md) §5.
**Minimum 16px text** or iOS Safari zooms and breaks the layout (TYPE-10).

### Money display
Always `tabular-nums`. Always a currency symbol. Negative values (coupons) in `--text-muted`
with a leading `−`, never red — a discount is good news.

---

## 6. Overlays — which one, and when

The decision most apps get wrong. **Pick by weight and interruption, not by habit.**

| Need | Use | Dismiss | Example |
|---|---|---|---|
| Confirm something reversible | **Inline** — no overlay at all | — | Removing a person |
| Short input while keeping context | **Bottom sheet** (mobile) / **Popover** (desktop) | Tap outside, Esc, swipe down | Add person, pick group |
| Destructive or irreversible | **Modal** — centred, focus-trapped | Explicit button only | Delete this split? |
| Brief result + undo | **Toast** — bottom, above the CTA | Auto after timeout | *Deleted. Undo (28)* |
| Blocking system state | **Full-screen state** | Action required | Session expired, offline |

**Rules**
- **Never stack overlays.** A sheet may not open a modal. If that seems necessary, the flow is wrong.
- **Every overlay traps focus, closes on Esc, returns focus** to whatever opened it.
- Background scroll locks while an overlay is open.
- **Sheets on mobile, popovers/modals on desktop** — same component, presentation adapts.
- Destructive modals put the **safe action on the right**, focused by default.

### Toast anatomy
```
┌──────────────────────────────────────┐
│  Deleted.                  Undo (28) │   ← countdown visible, not implied
└──────────────────────────────────────┘
```
One line, one action. Bottom-centre mobile, bottom-right desktop, never covering the primary CTA.
Auto-dismiss: 4s informational, **30s when there's an undo** (DEL-3).

---

## 7. Every state a screen can be in

A screen isn't done until all six exist. **This is the single biggest cause of "broken" feeling
apps** — building only the success case.

| State | What it must do | Example |
|---|---|---|
| **Empty** | Explain + one action. Never a blank page | *"No splits yet."* + `⊕ Split your first receipt` |
| **Loading** | **Skeleton** of the real shape, not a spinner | Dashboard rows as grey bars |
| **Partial** | Show what you have, mark what's missing | Items loaded, image still uploading |
| **Success** | Confirm concretely, then move on | *Added to Splitwise* + breakdown |
| **Error** | What happened + **what to do next** | See §8 |
| **Offline** | Say it, preserve work, retry when back | Banner + drafts kept |

**In-context progress, not full-screen spinners** (UX-12): the receipt thumbnail with a scanning
shimmer and *"Reading your receipt…"* beats a blank screen with a circle.

---

## 8. Error handling

### 8.1 The rule

> **Never say what broke. Say what to do next.**

| ❌ Don't | ✅ Do |
|---|---|
| Extraction failed | Couldn't read that one — try again with more light, or type it in |
| Error 500 | Something went wrong on our side. Your split is saved — try again |
| Invalid input | Prices need to be numbers, like 5.49 |
| Unauthorized | You've been signed out. Sign in again — your split is still here |
| Network request failed | You're offline. We'll keep this and retry when you're back |
| Rate limit exceeded | Slow down a moment — try again in 30 seconds |

### 8.2 Where errors appear

| Severity | Placement |
|---|---|
| Field-level | Below the field, `--danger`, with the fix |
| Screen-level | Banner at the top of content, dismissible |
| Blocking | Full-screen state with a single clear action |
| Transient | Toast |

### 8.3 Error pages

**404 — page not found**
```
        🧾
   This page doesn't exist

   The link may be wrong, or the
   split may have been deleted.

   [ Go to my splits ]
```

**500 — something broke**
> *Something went wrong on our side.* **Your work is saved.**
> `[ Try again ]` `[ Go to my splits ]`
> Small print: a reference id, for the feedback form. Never a stack trace (UX-22).

**403 — not yours**
> *This split belongs to someone else.* `[ Go to my splits ]`
> Never reveal whether it exists (SEC-25).

**Offline** — persistent banner, not a page: *You're offline. Your split is saved on this device.*

**Session expired** — modal: *You've been signed out.* `[ Sign in again ]` — and **the
in-progress split survives it** (GAP-5).

### 8.4 Error taxonomy → UI

| Class | Recovery | Surface |
|---|---|---|
| Validation | User fixes it | Inline, at the field |
| Extraction failed | Retry, or manual entry | Screen banner + manual CTA |
| Provider quota | **Automatic** — next provider, then manual | Silent; only if all fail: *"Scanning is busy — type it in, it takes a minute"* |
| Splitwise 4xx | Show their message, keep work | Banner |
| Splitwise 5xx | Retry with backoff | Toast + retry |
| Reconciliation failed | **Block submit** — this is our bug | Modal: *"Numbers don't add up. We won't submit something wrong."* |
| Auth expired | Re-auth, keep the split | Modal |
| Offline | Auto-retry on reconnect | Banner |

---

## 9. Motion

| Token | Duration | Curve | Use |
|---|---|---|---|
| `--motion-fast` | 120ms | ease-out | Hover, press |
| `--motion-base` | 180ms | ease-out | Toggles, fades |
| `--motion-slow` | 260ms | `cubic-bezier(.32,.72,0,1)` | Sheets, page transitions |

**Motion explains change; it never decorates.** Only: a total ticking up, a row entering the
dashboard, an avatar filling, a sheet rising, the undo countdown.

Nothing loops. Nothing bounces for fun. Nothing longer than 300ms.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    transition-duration: .01ms !important;
  }
}
```
State changes still happen — instantly. **Nothing may depend on an animation completing.**

---

## 10. Responsive

| | Phone `<640` | Tablet `640–1024` | Desktop `>1024` |
|---|---|---|---|
| Gutter | 16px | 24px | 32px |
| Max width | full | 720px | 1120px |
| Dashboard | 1 column | 2 columns | 2 columns, wider |
| Check / Assign | Stacked | List + thumbnail | **Receipt left, items right** |
| Primary CTA | Sticky, full-width, bottom | Inline right | Inline right |
| Overlays | Bottom sheet | Sheet or modal | Modal / popover |
| Input | Camera first | Camera + picker | Drag-drop + picker |

**Non-negotiables:** works at **320px**; **never scrolls horizontally**; survives **200% text**;
50 items, 10 people and a 60-character item name all hold; the primary CTA is never pushed
off-screen by a tall receipt image.

Desktop puts the receipt **beside** the items — extra width buys verification, not bigger margins.

---

## 11. Copy

### Voice
**A competent friend who's good with money.** Clear, brief, never cute about numbers. The app's
name is a joke; its arithmetic is not.

### Rules
1. **Plain words only.** Banned: *prorate, reconcile, OCR, parse, sync, API, payload* (UX-19).
2. **Second person, active voice.** *"Add your first receipt"*, not *"A receipt may be added"*.
3. **Sentence case everywhere.** Buttons too. Never ALL CAPS except 12px labels.
4. **Buttons are verbs.** *Add to Splitwise*, *Split the total*, *Invite*. Never *OK* or *Submit*.
5. **Numbers as numerals.** *4 bags*, not *four bags*.
6. **Say the consequence before the action**, especially when it's irreversible.

| ❌ | ✅ |
|---|---|
| Tax prorated by taxable subtotal | Tax split by who bought what |
| Submit | Add to Splitwise |
| Are you sure? | Delete this split? Alex and Maya will see it disappear |
| Operation successful | Added to Splitwise |
| No data | No splits yet |
| Invalid | Prices look like 5.49 |
| Processing your request… | Reading your receipt… |

### Microcopy that carries weight
- Privacy line, under the upload button: *Your splits are saved to your account, private to you.*
- Tax method: *Tax split by who bought what* / *Tax split proportionally*
- Reconciliation: *✓ matches receipt*
- Invite: *They'll get a Splitwise invite from you.*
- Restore: *It will be created as a new expense.*

---

## 12. Accessibility

**Target: WCAG 2.2 Level AA + ADA conformance.** Full specification — ARIA per component,
VoiceOver walkthroughs, contrast tables, keyboard map, announcement policy and the test plan —
is in **[ACCESSIBILITY.md](ACCESSIBILITY.md)**.

The essentials that constrain every component here:

- **AA contrast** on all text; **never colour alone** (assigned = fill + ring + ✓).
- **44×44px** targets (WCAG 2.2 requires 24×24 minimum — we exceed it deliberately).
- **Visible focus** on everything; `outline: none` without a replacement is a defect.
- **Focus is never obscured** by the sticky CTA (WCAG 2.2 §2.4.11) — a real risk with a
  bottom-pinned button, so focused fields scroll clear of it.
- **Every drag has a click alternative** (WCAG 2.2 §2.5.7) — drag-and-drop upload always has a
  file picker beside it.
- **Visible labels**, never placeholder-only. Helper text in `--text-muted`, linked with
  `aria-describedby`.
- **Running total is a polite live region**; the undo countdown is not announced every second.
- **Full keyboard path**; Esc closes, Enter confirms, focus returns where it came from.
- **200% text** and **400% zoom** without clipping; `rem` everywhere.
- **`prefers-reduced-motion`** honoured; nothing depends on an animation finishing.

---

## 13. Maintainability

**The point of all this is that a change happens in one place.**

1. **Tokens are the only source of truth.** No hex, no px spacing, no duration inside a
   component. Changing the brand colour = editing one line.
2. **Components own their states**, not their callers. `<Button loading>` — never a caller
   swapping in a spinner.
3. **One component per concept.** One `Sheet` that renders as a bottom sheet or a popover by
   breakpoint — not `MobileSheet` and `DesktopPopover`.
4. **Props describe intent, not appearance.** `variant="primary"`, never `color="indigo"`.
5. **Copy lives beside its component**, not in a global strings file — until there's a second
   language, a central file only makes text harder to find.
6. **Every new component ships with all seven states** (§5) or it isn't merged.
7. **No component imports from `lib/db` or `lib/splitwise`.** UI calls routes
   ([ARCHITECTURE.md](ARCHITECTURE.md) §4).

### Definition of done, for any screen

- [ ] All six screen states exist (§7)
- [ ] All seven component states exist (§5)
- [ ] Exactly one primary CTA
- [ ] Works at 320 / 768 / 1440, and while dragging between them
- [ ] Keyboard-only completable; focus visible throughout
- [ ] Light **and** dark verified
- [ ] Every error names the next action
- [ ] No hard-coded colour, spacing or duration
- [ ] Readable at 200% text
- [ ] Nothing breaks with 50 items, 10 people, 60-character names

---

## 14. Edge cases — the full sweep

Everything below has a defined behaviour. **"We didn't think about it" is how apps feel broken.**

### Navigation and session

| Case | Behaviour |
|---|---|
| Browser **back** from Confirm | Returns to Assign with every assignment intact. No "are you sure" dialog |
| Browser back **after** submitting | Lands on the dashboard, not a resubmit. Submit is idempotent (FR-22) |
| **Refresh** mid-split | Draft restored from local storage (UX-17); a banner says *Picked up where you left off* |
| **Two tabs**, same split | Last write wins; the stale tab is told *This was updated elsewhere* and offers reload |
| **Deep link** to a deleted split | 404 page, not a crash |
| Deep link to **someone else's** split | 403 page that never reveals whether it exists |
| Not signed in, visits `/new` | Sign-in first, then **continue to `/new`**, not dumped on the dashboard |
| **Session expires** mid-split | Modal, re-auth, split preserved (GAP-5) |
| Signs out with unsaved work | Warns once: *Your current split isn't saved yet* |

### Upload

| Case | Behaviour |
|---|---|
| **Pasted** image (Cmd+V) | Accepted — screenshots are a real input |
| Multiple files dropped | Take the first, say so: *Using the first image* |
| Upload cancelled mid-way | Returns to the upload screen cleanly, no ghost state |
| 0-byte or corrupt file | *That file looks empty — try another* |
| File over 10 MB | Rejected **before** reading the body; offer to retake |
| Wrong type renamed `.jpg` | Rejected by magic bytes, not extension |
| **HEIC** from iPhone | Converted client-side if the provider can't read it |
| PDF with 12 pages | Page 1 used; a note says so, manual add available |
| Sideways photo | EXIF orientation normalised before extraction (GAP-4) |
| Very dark / blurry photo | Sanity bounds catch nonsense; offer retake **or** manual entry |

### Receipt data

| Case | Behaviour |
|---|---|
| **One item only** | Layout looks deliberate, not broken |
| **No items readable** | "Split the total" mode (GAP-1) |
| Items don't sum to subtotal | Flagged, highlighted, user fixes. **Never auto-corrected** |
| Coupon / negative line | Kept, shown in `--text-muted` with `−`, included in the math |
| Tip > subtotal | Allowed (generous tipper) but flagged as unusual |
| Tax > 25% of subtotal | Flagged — almost always a decimal misread |
| Item price > total | Flagged, same reason |
| **European decimals** (`1.234,56`) | Detected from the receipt's format and parsed correctly. A comma decimal misread as a thousands separator is a 100× money error |
| Unknown currency symbol | Ask once, don't guess |
| Future or very old date | Accepted; the receipt is the truth. Only flagged if >1 year out |
| Duplicate receipt | Warn, never block (GAP-3) |

### People and assignment

| Case | Behaviour |
|---|---|
| **Only you** in the split | Allowed — still useful for keeping a record |
| Nobody assigned to an item | ⚠ badge, blocks progress, names the item |
| **Two people with the same name** | Show a disambiguator (last initial or email domain) |
| Very long name | Truncates in the avatar row, full name in the sheet |
| **No friends at all** in Splitwise | Empty state explains it, `+ Add person` is the primary action |
| Person removed from Splitwise mid-flow | Detected at submit; offer to remove them or re-invite |
| More than 10 people | Avatars wrap or scroll **within their row** — the page never widens |
| A person's share rounds to $0.00 | Shown as `$0.00`, not hidden. They still took something |

### Network and submission

| Case | Behaviour |
|---|---|
| Slow connection | Skeletons, no blocking spinner; extraction shows real progress |
| Request times out | *Taking longer than usual* + retry, work preserved |
| **Offline mid-submit** | Queued; banner; auto-retries on reconnect |
| **Double-tap submit** | One expense — idempotency key (FR-22) |
| First of two expenses succeeds, second fails | Says exactly which exists; retry creates **only** the missing one (FR-19h) |
| Splitwise rate-limits us | *Slow down a moment — try again in 30 seconds* |
| All vision providers exhausted | *Scanning is busy — type it in, it takes a minute* |

### Device and browser

| Case | Behaviour |
|---|---|
| **Keyboard covers the input** on mobile | Field scrolls into view above the keyboard |
| iOS **safe areas** / notch | Sticky CTA sits above the home indicator |
| **Landscape** phone | Works; CTA stays reachable |
| Tablet split-screen | Treated as its width, not its device class |
| **Private browsing** — no storage | Drafts silently unavailable; everything else works. All storage access in `try/catch` |
| Storage quota full | Fails silently for drafts, never blocks the flow |
| **Cookies blocked** | Clear message: the app needs a cookie to keep you signed in |
| Back/forward cache restore | State revalidated on `pageshow` |
| Very old browser | Baseline HTML still renders and says the browser is unsupported |

### Accessibility

| Case | Behaviour |
|---|---|
| Screen reader on the avatar grid | *"Alex, assigned to Organic Milk. Double-tap to remove."* |
| 200% text | No clipping, no overlap, CTA still reachable |
| Keyboard-only, whole flow | Completable; focus visible; Esc closes; Enter confirms |
| Reduced motion | Instant state changes; nothing depends on an animation finishing |
| High-contrast / forced colours | Borders survive; nothing relies on a background tint |
| Colour-blind user | Assigned = fill **+ ring + ✓**; never hue alone |
