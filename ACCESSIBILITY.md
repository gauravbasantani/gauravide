# Gauravide — Accessibility

**Target: WCAG 2.2 Level AA, and ADA conformance.**

Tokens and components: [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) · Rules: [requirements.md](requirements.md) §5f

---

## 1. Position

This app divides money between real people. **Someone who is blind, has low vision, tremors, or
is simply using one hand on a phone in a dark restaurant has exactly as much right to know what
they owe.** Accessibility here isn't a compliance exercise; it's the same promise as the
arithmetic — the number is right, and you can find out what it is.

Two operating principles:

1. **Semantic HTML first. ARIA only where HTML can't express it.** A `<button>` is better than a
   `<div role="button">` every time — it's focusable, keyboard-operable, and announced correctly
   with no code. **No ARIA is better than bad ARIA.**
2. **Test with a screen reader, not just a linter.** axe catches maybe 30% of real barriers.
   The rest you find by closing your eyes and using VoiceOver.

---

## 2. WCAG 2.2 — the criteria that actually bite here

2.2 added nine success criteria. Four are live risks for this specific app:

| Criterion | Risk in Gauravide | Our handling |
|---|---|---|
| **2.4.11 Focus Not Obscured (AA)** | **Real.** Our primary CTA is sticky at the bottom on mobile — it can cover a focused input or the last item row | Focused elements scroll clear of the sticky bar. `scroll-padding-bottom` equal to the CTA height. **Tested explicitly** |
| **2.5.7 Dragging Movements (AA)** | Drag-and-drop upload on desktop | A **file picker button** sits beside it, always. No function requires dragging |
| **2.5.8 Target Size Minimum (AA)** | Avatar toggles, item edit hit areas | 24×24 CSS px is the floor; **we use 44×44** |
| **3.3.7 Redundant Entry (A)** | Re-asking for a name/email already given | Nothing is asked twice in a flow. Invited person's details carry forward |
| **3.2.6 Consistent Help (A)** | Contact/help link moving around | Footer link in the same position on every page |
| **3.3.8 Accessible Authentication (AA)** | Cognitive tests at login | Splitwise OAuth — no puzzle, no CAPTCHA, no memory test. Passes by design |

---

## 3. Colour and contrast

### 3.1 Measured ratios — light mode on `--bg #FFFFFF`

| Token | Hex | Ratio | Verdict |
|---|---|---|---|
| `--text` | `#0F172A` | **17.9:1** | ✅ body |
| `--text-muted` | `#64748B` | **4.8:1** | ✅ body — helper text, captions, placeholders |
| `--text-subtle` | `#94A3B8` | **2.8:1** | ❌ **never text.** Decorative borders/icons only |
| `--primary` | `#4F46E5` | **6.3:1** | ✅ body and UI |
| `--primary-on` on `--primary` | `#FFF` on `#4F46E5` | **6.3:1** | ✅ button labels |
| `--danger` | `#E11D48` | 4.3:1 | ⚠️ fills/large only — **`--danger-text #BE123C` (5.9:1)** for messages |
| `--success` | `#059669` | 3.7:1 | ⚠️ icons only — **`--success-text #047857` (4.8:1)** for text |
| `--warning` | `#D97706` | 3.2:1 | ⚠️ icons only — **`--warning-text #B45309` (4.6:1)** for text |

> **This is why the semantic tokens have `-text` variants.** The saturated versions look right
> as a fill or an icon but fail as small text — a mistake that's easy to make and invisible
> until someone with low vision can't read an error message. **Error text uses `--danger-text`.**

### 3.2 Person colours — and why colour can't identify anyone

Light mode, white initials: indigo `#4338CA` 7.9 · teal `#0F766E` 5.5 · rose `#9F1239` 8.0 ·
amber `#92400E` 7.1 · violet `#6D28D9` 7.1 · cyan `#155E75` 7.3 · emerald `#065F46` 7.7 ·
plum `#86198F` 8.2 — **all pass**. Dark mode flips to lighter fills with dark initials, all ≥9:1.

**But contrast was never the real problem.** Simulating protanopia, deuteranopia, tritanopia
and greyscale over the original palette found pairs at **ΔE 2.0** — visually identical to a
colour-blind user. Three attempts at a fix produced this result:

| Approach | Outcome |
|---|---|
| Bright categorical | 5 of 8 below AA; rust↔amber ΔE 2.0 (deuteranopia) |
| Optimised for dichromacy | Separable but garish — a palette nobody would ship |
| Optimised for dichromacy **+ greyscale** | **Even 4 colours fell to ΔE 10.7.** Impossible |

**Greyscale separation requires lightness spread. AA-with-white-initials confines lightness to
a narrow band. Both cannot hold at once.** This is a constraint, not a tuning failure.

**Therefore colour is decorative, and identity is carried three other ways:**

1. **Initials on every avatar, always** — the primary identifier, at every size.
2. **Accessible name gives the full name** — *"Alex Kumar, sharing Organic Milk"* — so a screen
   reader user never depends on visuals at all.
3. **Assigned vs unassigned** — the only state that changes behaviour — uses **fill + ring +
   ✓ badge**, never hue (WCAG 1.4.1).

A user who sees no colour at all can still complete a split correctly. That is the actual
requirement; a prettier palette was never going to satisfy it.

### 3.3 Border contrast — WCAG 1.4.11

**The most commonly missed criterion.** Non-text UI boundaries need **≥3:1**, and default
grey borders almost never reach it:

| Token | Hex | Ratio on white | Use |
|---|---|---|---|
| `--border` | `#E2E8F0` | 1.2:1 | ❌ decorative dividers only |
| `--border-strong` | `#CBD5E1` | 1.5:1 | ❌ decorative emphasis only |
| **`--border-interactive`** | **`#78859A`** | **3.7:1** | ✅ **inputs, toggles, secondary buttons** |

Any boundary a user must *perceive to operate a control* uses `--border-interactive`. A row
divider can stay faint; an input outline cannot.

### 3.4 Focus indicator and indicator dots — two more that failed

| Element | First draft | Ratio | Fixed to | Ratio |
|---|---|---|---|---|
| Focus ring, light | `rgb(79 70 229 / .35)` | **1.76:1** ❌ | solid `--primary` + 2px gap | **6.29:1** ✅ |
| Focus ring, dark | `rgb(129 140 248 / .45)` | **2.11:1** ❌ | solid `--primary` + 2px gap | **4.90:1** ✅ |
| "Invited" dot | `--secondary #F59E0B` | **2.15:1** ❌ | `--secondary-strong #B45309` | **5.02:1** ✅ |

> **Translucent focus rings are a trap.** They look refined in a mockup on white, then blend
> into whatever is behind them — failing exactly for keyboard-only and low-vision users, the
> people the indicator exists for. The fix is a solid ring with a background-coloured gap, which
> reads on any surface: `box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--primary)`.

> **Amber is the classic small-indicator failure.** `#F59E0B` is a lovely fill and a terrible
> 8px dot — 2.15:1 against white. Small marks that carry meaning need `--secondary-strong`, and
> a word beside them regardless (1.4.1).

### 3.5 Rules

- **Body text ≥ 4.5:1. Large text (≥18.66px bold / 24px) ≥ 3:1.**
- **Non-text contrast ≥ 3:1** — input borders, focus rings, the avatar's assigned ring, icon-only
  buttons (§3.3). The criterion most often missed, and the reason `--border-interactive` exists.
- **Never colour alone** (WCAG 1.4.1). Assigned avatars carry **fill + ring + ✓ badge**; the
  invited state carries a dot **and** the word *invited*; errors carry an icon **and** text.
- **Verify dark mode separately.** Ratios don't transfer — that's why `--primary` lightens to
  `#818CF8` on dark, where the light-mode indigo would sit at ~2.9:1.
- **A person's colour is never the only way to identify them** (§3.2). Initials always show;
  the full name is always in the accessible name. Colour is reinforcement for the majority, not
  information for anyone.
- **Semantic fills need their own tone.** `--success #059669` with a white label is 3.8:1;
  badges use `--success-fill #047857` (5.5:1). Same for `--warning-fill #B45309`.

---

## 4. Keyboard

Every function is reachable without a pointer. **The whole flow is completable by keyboard alone.**

| Key | Behaviour |
|---|---|
| `Tab` / `Shift+Tab` | Move through controls in visual order |
| `Enter` | Activate; submit the screen's primary action |
| `Space` | Toggle an avatar / checkbox |
| `Esc` | Close the top overlay, return focus to its trigger |
| `←` `→` | Move between avatars within an item row (roving tabindex) |
| `Cmd/Ctrl + V` | Paste a receipt image on the upload screen |

**Focus management**
- **Route change:** focus moves to the new page's `<h1>`, and it's announced.
- **Overlay opens:** focus moves inside and is **trapped**; `Esc` and the close button both exit.
- **Overlay closes:** focus returns to the element that opened it. Never to `<body>`.
- **Content inserted** (a split line becoming four rows): focus stays put; the change is
  announced politely.
- **Skip link** — "Skip to main content" — first in the tab order on every page.
- **Focus ring is always visible.** `:focus-visible` with a 3px ring at ≥3:1 against both the
  element and the page.
- **Roving tabindex** on the avatar row, so ten people don't mean ten tab stops per item.

---

## 5. Forms, labels and helper text

The area most commonly broken, and the one you asked about specifically.

```html
<label for="tip">Tip</label>
<input
  id="tip"
  type="text"
  inputmode="decimal"
  aria-describedby="tip-help tip-err"
  aria-invalid="true"
/>
<p id="tip-help" class="helper">Leave blank if the tip is already on the receipt.</p>
<p id="tip-err" class="error" role="alert">Tips look like 5.00</p>
```

**Rules**

1. **Every input has a visible `<label>`.** Placeholder-as-label fails — it vanishes on typing,
   is often too low-contrast, and screen readers treat it as a hint, not a name.
2. **Helper text is linked with `aria-describedby`**, so it's read *after* the field name rather
   than lost. Styled `--text-muted` (4.8:1), never `--text-subtle`.
3. **Errors:** set `aria-invalid="true"`, render the message in `--danger-text` **below** the
   field, keep it in `aria-describedby`, and give it `role="alert"` so it's announced
   immediately. Never a tooltip; never colour alone — include an icon and words.
4. **Error text says the fix**, not the failure: *"Prices look like 5.49"*.
5. **`inputmode="decimal"`** on money fields so phones show a numeric keypad.
6. **Never auto-advance focus** between fields — it disorients screen reader and switch users.
7. **Nothing is asked twice** (2.2 §3.3.7).
8. **Grouped controls use `<fieldset>` + `<legend>`** — e.g. the delete choice, the tax method.

---

## 6. ARIA, component by component

Only where semantics need help. Everything else is plain HTML.

### Avatar toggle
```html
<button
  type="button"
  aria-pressed="true"
  aria-label="Alex Kumar, sharing Organic Milk">
  AK
</button>
```
- `aria-pressed` conveys assigned/unassigned — no separate announcement needed.
- The label names **the person and the item**, because out of context "AK" means nothing.
- Two people called Alex get disambiguated in the label (GAP-17): *"Alex Kumar"* / *"Alex Rossi"*.

### Running total — live region
```html
<div aria-live="polite" aria-atomic="true">
  Your share: $22.40. Alex: $13.10. Maya: $10.17.
</div>
```
- **`polite`**, never `assertive` — it changes on every tap and must not interrupt.
- **Debounced ~500ms**, so rapid tapping doesn't produce a queue of announcements.
- `aria-atomic` so the whole set is read, not a fragment.

### Item row
```html
<li>
  <span id="item-3-name">Chicken 2lb</span>
  <span>$12.99</span>
  <div role="group" aria-labelledby="item-3-name">…avatars…</div>
</li>
```
Grouping the avatars under the item name means a screen reader user always knows which item
they're assigning.

### Modal
```html
<div role="dialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-desc">
  <h2 id="dlg-title">Delete this split?</h2>
  <p id="dlg-desc">Alex and Maya will see it disappear from Splitwise.</p>
</div>
```
Focus trapped; background `inert`; `Esc` closes; focus returns to the trigger.

### Toast
- Informational: `role="status"` (polite).
- **Undo toast:** `role="status"`, announced once as *"Deleted. Undo available for 30 seconds."*
  **The countdown is not announced every second** — it's `aria-hidden`, with the time stated once.
- Errors: `role="alert"` (assertive) — these interrupt, correctly.

### Progress
```html
<div role="status" aria-live="polite">Reading your receipt…</div>
```
Then on completion: *"Found 14 items. Review them."* — a state change must be announced, or a
blind user is left waiting with no idea anything happened.

### Receipt image
```html
<img alt="Receipt from Walmart Supercenter, 11 September, total $45.67" />
```
Alt text carries **the useful facts**, not "receipt image". The itemised data is in the list
below it, which is the accessible version of the picture.

### Icon-only buttons
Always `aria-label`. Decorative icons inside labelled buttons get `aria-hidden="true"` so they
aren't read twice.

---

## 7. The flow with VoiceOver

What a blind user actually hears. **If this reads badly, the screen is wrong** — regardless of
what an automated checker says.

**Dashboard**
> *"Gauravide, heading level 1. Your splits. List, 3 items. Walmart Supercenter, 11 September,
> $45.67, 4 people, Roommates. Button."*
> *"New receipt. Button."*

**Upload**
> *"Take a photo. Button." · "Upload image. Button." · "Upload PDF. Button."*
> *"Type it in instead. Button."*

**Extracting**
> *"Reading your receipt…"* → *"Found 14 items. Review them. Heading level 1, Check the items."*

**Check items**
> *"Walmart Supercenter, 11 September. List, 14 items. Organic Milk, $5.49, edit. Text field."*
> *"Subtotal $42.10. Tax $3.47. Total $45.67."*
> *"Looks right. Button."*

**Assign**
> *"Split with Roommates. Group. Alex Kumar, sharing Organic Milk. Toggle button, pressed."*
> *(tap)* → *"Not pressed."* → live region: *"Your share $22.40. Alex $13.10. Maya $10.17."*
> *"Detergent, $8.99. Warning: nobody assigned."*

**Confirm**
> *"Total $45.67. Matches receipt. You $22.40. Alex $13.10. Maya $10.17."*
> *"Add to Splitwise. Button."*

**Done**
> *"Added to Splitwise. Alex owes you $13.10. Maya owes you $10.17."*

---

## 8. Announcement policy

Over-announcing is as disabling as silence. What speaks, and how:

| Event | Politeness | Notes |
|---|---|---|
| Running total changes | `polite` | Debounced 500ms |
| Extraction finished | `polite` | States the item count |
| Item assigned/unassigned | — | `aria-pressed` covers it; no extra announcement |
| Validation error | `assertive` | `role="alert"` |
| Toast (info) | `polite` | Once |
| Undo countdown | **silent** | Duration stated once; ticks are `aria-hidden` |
| Submitting | `polite` | *"Adding to Splitwise…"* then the result |
| Route change | `polite` | New `<h1>` receives focus |
| Network retry | `polite` | Never repeatedly |

---

## 9. Vision, motion, zoom

- **Text resize to 200%** (WCAG 1.4.4) with no loss of content — `rem` everywhere, no fixed heights.
- **Zoom to 400%** at 1280px wide reflows to a single column (WCAG 1.4.10) — no horizontal scroll.
- **Text spacing override** (1.4.12): the layout survives increased line-height, letter- and
  word-spacing. No text in fixed-height boxes.
- **Reflow, not truncation** — a 60-character item name wraps or ellipsises, but the **price is
  never truncated**.
- **`prefers-reduced-motion`** removes animation; nothing depends on an animation completing.
- **Orientation** (1.3.4): portrait and landscape both work; never locked.
- **Forced-colours / high-contrast mode:** borders survive; nothing relies on a background tint.
- **Dark mode is designed**, not inverted — it's an accessibility feature for light sensitivity.

---

## 10. Structure and semantics

- **One `<h1>` per screen**, headings in order, never skipped for styling.
- **Landmarks:** `<header>`, `<nav>`, `<main>`, `<footer>` — one `<main>` per page.
- **Lists are lists.** Items and splits are `<ul>`/`<li>`, so screen readers announce counts.
- **`<html lang="en">`**; if a receipt is in another language, its container gets its own `lang`.
- **Page `<title>` is unique and specific:** *"Check the items · Gauravide"*.
- **Buttons vs links:** a link navigates, a button acts. Never a `<div>` with a click handler.
- **Tables** (the per-person breakdown) use real `<th>` with `scope`.

---

## 11. Testing

**Contrast is computed, never eyeballed.** A ratio checker runs over the token file in CI; a
new colour that fails its intended use fails the build. Every "this looks fine" judgement in
this document was wrong at least once — five person colours and two border tokens shipped in
the first draft below threshold.

**Automated (every build)**
- `axe-core` in CI — **zero violations** is the gate.
- ESLint `jsx-a11y` with strict rules.
- Lighthouse accessibility ≥ 95 (a floor, not a finish line).

**Manual (before each session ships)**
- [ ] **Keyboard only, whole flow** — unplug the mouse. Focus always visible, never trapped,
      never hidden behind the sticky CTA.
- [ ] **VoiceOver on iOS**, whole flow, screen curtain on (screen off). This is the real test.
- [ ] **VoiceOver on macOS Safari** + **NVDA on Windows** for the main flow.
- [ ] **200% text** and **400% zoom**.
- [ ] **Dark mode** contrast re-checked — ratios don't transfer from light.
- [ ] **Forced-colours mode** (Windows high contrast).
- [ ] **Reduced motion** on.
- [ ] **Colour-blind simulation** — deuteranopia and protanopia — on the avatar row.
- [ ] Focused input not obscured by the sticky CTA (2.4.11) — **check on a small phone**.

**The honest test:** complete a full split with the screen turned off. If you can't, neither
can someone who has no choice.

---

## 12. Definition of done

A screen ships only when:

- [ ] Zero `axe` violations
- [ ] Keyboard-completable, focus visible and never obscured
- [ ] Every control has an accessible name that means something out of context
- [ ] Every input has a visible label; helper and error text wired with `aria-describedby`
- [ ] Errors use `role="alert"`, `--danger-text`, an icon, and words
- [ ] Live regions are `polite` and debounced; nothing chatters
- [ ] AA contrast verified in **both** light and dark, **computed not estimated**
- [ ] Control boundaries use `--border-interactive` (≥3:1), not the decorative greys
- [ ] Avatar initials readable on every person colour, in both themes
- [ ] Focus ring visible and ≥3:1 on every background it can appear over
- [ ] No meaning carried by a small coloured dot alone
- [ ] Nothing conveyed by colour alone
- [ ] 200% text and 400% zoom hold
- [ ] Targets ≥ 44×44
- [ ] VoiceOver walkthrough reads sensibly start to finish
