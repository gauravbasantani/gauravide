'use client'

import { missingFrom, rankGroups, type SwGroup, type SwPerson } from '@/lib/useSplitwise'
import styles from './GroupPicker.module.css'

type Props = {
  groups: SwGroup[]
  people: SwPerson[]
  selectedId: number | null
  onSelect: (groupId: number) => void
}

/**
 * Every candidate group, each annotated with who is missing from it (FR-19c).
 * Not one suggestion — the user picks with full information.
 */
export function GroupPicker({ groups, people, selectedId, onSelect }: Props) {
  const ranked = rankGroups(
    groups,
    people.map((p) => p.id),
  )

  return (
    <div className={styles.list} role="group" aria-label="Where should this expense go?">
      {ranked.slice(0, 6).map((g) => {
        const missing = missingFrom(g, people)
        const exact = missing.length === 0
        return (
          <button
            key={g.id}
            type="button"
            className={styles.option}
            aria-pressed={selectedId === g.id}
            onClick={() => onSelect(g.id)}
          >
            <span className={styles.optionMain}>
              <span className={styles.name}>{g.name}</span>
              {exact ? (
                <span className={styles.match}>✓ everyone is in this group</span>
              ) : (
                <span className={styles.gap}>
                  {people.length - missing.length} of {people.length} ·{' '}
                  {missing.map((m) => m.name).join(', ')} not in this group
                </span>
              )}
            </span>
          </button>
        )
      })}

      <button
        type="button"
        className={styles.option}
        aria-pressed={selectedId === 0}
        onClick={() => onSelect(0)}
      >
        <span className={styles.optionMain}>
          <span className={styles.name}>No group</span>
          <span className={styles.gap}>A personal expense between you and them</span>
        </span>
      </button>
    </div>
  )
}
