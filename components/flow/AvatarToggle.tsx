'use client'

import styles from './AvatarToggle.module.css'

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

type Props = {
  name: string
  personId: string
  assigned: boolean
  /** What they're being assigned to — "AK" alone means nothing out of context. */
  context?: string
  size?: 'md' | 'sm'
  onToggle: () => void
}

export function AvatarToggle({ name, personId, assigned, context, size = 'md', onToggle }: Props) {
  const colour = colourOf(personId)
  const classes = [styles.toggle, assigned ? styles.on : styles.off, size === 'sm' ? styles.sm : '']
    .filter(Boolean)
    .join(' ')

  return (
    <span className={[styles.wrap, size === 'sm' ? styles.sm : ''].filter(Boolean).join(' ')}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={assigned}
        aria-label={context ? `${name}, sharing ${context}` : name}
        className={classes}
        style={assigned ? { color: colour } : undefined}
      >
        <span className={styles.circle} style={assigned ? { background: colour } : undefined}>
          {initialsOf(name)}
        </span>
      </button>
      {assigned ? (
        <span className={styles.badge} aria-hidden="true">
          ✓
        </span>
      ) : null}
    </span>
  )
}
