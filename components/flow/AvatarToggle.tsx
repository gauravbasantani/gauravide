'use client'

import { colourOf, initialsOf } from '@/lib/avatar'
import styles from './AvatarToggle.module.css'

// Re-exported for client components. Server code must import from @/lib/avatar.
export { colourOf, initialsOf }

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
