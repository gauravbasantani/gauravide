/**
 * Avatar helpers — plain functions, no 'use client'.
 *
 * They live here, not in AvatarToggle.tsx, because server components (the
 * dashboard, the split page) call them while rendering. A function exported
 * from a 'use client' module becomes a client reference on the server, and
 * calling it there throws — which crashed "Your splits" after tapping Done.
 */

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase()
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase()
}

/** Stable colour per person. Decorative — the initials identify them (§3.2). */
export function colourOf(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return `var(--person-${(hash % 8) + 1})`
}
