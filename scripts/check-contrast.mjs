#!/usr/bin/env node
/**
 * Contrast gate — ACCESSIBILITY.md §3, plan.md rule 23.
 *
 * Reads app/tokens.css and verifies every colour pair against its WCAG 2.2
 * threshold. A colour that fails its intended use fails the build.
 *
 * This exists because eyeballing contrast does not work: the first draft of
 * this palette had eight failures that all looked fine.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(root, 'app/tokens.css'), 'utf8')

/** Read a token from either the :root block or the dark-mode block. */
function token(name, dark = false) {
  const scope = dark
    ? css.slice(css.indexOf('prefers-color-scheme: dark'))
    : css.slice(0, css.indexOf('prefers-color-scheme: dark'))
  const m = scope.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`token --${name} not found (${dark ? 'dark' : 'light'})`)
  return m[1]
}

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
function luminance(hex) {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const TEXT = 4.5
const UI = 3.0

/** [label, foreground, background, threshold] */
const checks = [
  // light — text
  ['text on bg', token('text'), token('bg'), TEXT],
  ['text-muted on bg', token('text-muted'), token('bg'), TEXT],
  ['text-muted on bg-subtle', token('text-muted'), token('bg-subtle'), TEXT],
  ['primary on bg', token('primary'), token('bg'), TEXT],
  ['danger-text on bg', token('danger-text'), token('bg'), TEXT],
  ['success-text on bg', token('success-text'), token('bg'), TEXT],
  ['warning-text on bg', token('warning-text'), token('bg'), TEXT],
  ['danger-text on danger-subtle', token('danger-text'), token('danger-subtle'), TEXT],
  ['primary on primary-subtle', token('primary'), token('primary-subtle'), TEXT],
  // light — fills
  ['primary-on over primary', token('primary-on'), token('primary'), TEXT],
  ['white over primary-hover', '#FFFFFF', token('primary-hover'), TEXT],
  ['white over primary-active', '#FFFFFF', token('primary-active'), TEXT],
  ['white over danger', '#FFFFFF', token('danger'), TEXT],
  ['white over success-fill', '#FFFFFF', token('success-fill'), TEXT],
  ['white over warning-fill', '#FFFFFF', token('warning-fill'), TEXT],
  // light — non-text UI
  ['border-interactive on bg', token('border-interactive'), token('bg'), UI],
  ['primary focus ring on bg', token('primary'), token('bg'), UI],
  ['secondary-strong on bg', token('secondary-strong'), token('bg'), UI],
  // dark — text
  ['DK text on surface', token('text', true), token('surface', true), TEXT],
  ['DK text-muted on surface', token('text-muted', true), token('surface', true), TEXT],
  ['DK primary on surface', token('primary', true), token('surface', true), TEXT],
  ['DK danger-text on surface', token('danger-text', true), token('surface', true), TEXT],
  ['DK primary-on over primary', token('primary-on', true), token('primary', true), TEXT],
  // dark — non-text UI
  ['DK border-interactive on surface', token('border-interactive', true), token('surface', true), UI],
]

// Person colours: white initials in light, dark initials in dark.
for (let i = 1; i <= 8; i++) {
  checks.push([`person-${i} initials`, token('person-on'), token(`person-${i}`), TEXT])
  checks.push([`DK person-${i} initials`, token('person-on', true), token(`person-${i}`, true), TEXT])
}

let failed = 0
for (const [label, fg, bg, need] of checks) {
  const r = ratio(fg, bg)
  const ok = r >= need
  if (!ok) failed++
  if (!ok || process.env.VERBOSE) {
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${label.padEnd(36)} ${r.toFixed(2)} (need ${need})`)
  }
}

if (failed > 0) {
  console.error(`\n✗ ${failed} of ${checks.length} contrast checks failed.`)
  console.error('  Fix the token, not the threshold. See ACCESSIBILITY.md §3.')
  process.exit(1)
}
console.log(`✓ contrast: ${checks.length}/${checks.length} pairs pass (WCAG 2.2 AA)`)
