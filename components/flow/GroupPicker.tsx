'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { colourOf } from './AvatarToggle'
import { missingFrom, rankGroups, type SwGroup, type SwPerson } from '@/lib/useSplitwise'
import styles from './GroupPicker.module.css'

type Props = {
  groups: SwGroup[]
  people: SwPerson[]
  selectedId: number | null
  onSelect: (groupId: number) => void
  /** Pre-filled name for a new group (usually the merchant). */
  suggestedName?: string
  creating?: boolean
  createError?: string | null
  /** Present when a new group can be created from here (FR-19a). */
  onCreate?: (name: string) => void
}

/** How many groups show before "Show more" — most people have a long tail. */
const VISIBLE = 3

/**
 * Where the expense lands: the best-matching groups first, each annotated with
 * who is missing (FR-19c), then No group, then Create a new group.
 */
export function GroupPicker({
  groups,
  people,
  selectedId,
  onSelect,
  suggestedName = '',
  creating,
  createError,
  onCreate,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')

  // A newly created group arrives as one more group: close the form.
  useEffect(() => {
    setCreateOpen(false)
  }, [groups.length])

  const scored = rankGroups(
    groups,
    people.map((p) => p.id),
  ).map((g) => ({ g, missing: missingFrom(g, people) }))
  // The selected group always stays visible, even when the list is collapsed.
  const shown = expanded
    ? scored
    : scored.filter((entry, index) => index < VISIBLE || entry.g.id === selectedId)
  const hidden = scored.length - shown.length
  const firstNames = people.map((p) => p.name.split(' ')[0]).join(', ')

  return (
    <div className={styles.picker}>
      <div className={styles.list} role="group" aria-label="Where should this expense go?">
        {shown.map(({ g, missing }, index) => {
          const everyone = missing.length === 0
          return (
            <button
              key={g.id}
              type="button"
              className={styles.option}
              aria-pressed={selectedId === g.id}
              onClick={() => onSelect(g.id)}
            >
              <span className={styles.radio} aria-hidden="true" />
              <span
                className={styles.tile}
                style={{ background: colourOf('group-' + g.id) }}
                aria-hidden="true"
              >
                {g.name.trim().charAt(0).toUpperCase()}
              </span>
              <span className={styles.optionMain}>
                <span className={styles.name}>{g.name}</span>
                <span className={everyone ? styles.match : styles.gap}>
                  {g.members.length} {g.members.length === 1 ? 'member' : 'members'} ·{' '}
                  {everyone
                    ? 'everyone’s in'
                    : `${missing.map((m) => m.name.split(' ')[0]).join(', ')} not in it`}
                </span>
              </span>
              {index === 0 && everyone ? <span className={styles.badge}>Best match</span> : null}
            </button>
          )
        })}

        {hidden > 0 ? (
          <button type="button" className={styles.more} onClick={() => setExpanded(true)}>
            Show {hidden} more {hidden === 1 ? 'group' : 'groups'}
          </button>
        ) : expanded && scored.length > VISIBLE ? (
          <button type="button" className={styles.more} onClick={() => setExpanded(false)}>
            Show fewer
          </button>
        ) : null}

        <button
          type="button"
          className={styles.option}
          aria-pressed={selectedId === 0}
          onClick={() => onSelect(0)}
        >
          <span className={styles.radio} aria-hidden="true" />
          <span className={[styles.tile, styles.tileNeutral].join(' ')} aria-hidden="true">
            ↔
          </span>
          <span className={styles.optionMain}>
            <span className={styles.name}>No group</span>
            <span className={styles.gap}>Between you and each person directly</span>
          </span>
        </button>
      </div>

      {onCreate ? (
        createOpen ? (
          <div className={styles.create}>
            <Field
              label="New group name"
              value={name}
              placeholder={suggestedName || 'Dinner crew'}
              onChange={(e) => setName(e.target.value)}
              help={`With ${firstNames}. Splitwise will show it to everyone in it.`}
            />
            {createError ? (
              <p className={styles.error} role="alert">
                {createError}
              </p>
            ) : null}
            <div className={styles.createActions}>
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button loading={creating} onClick={() => onCreate(name.trim() || suggestedName)}>
                Create group
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={styles.createToggle}
            onClick={() => {
              setName(suggestedName)
              setCreateOpen(true)
            }}
          >
            <span className={styles.plus} aria-hidden="true">
              ＋
            </span>
            <span className={styles.createText}>
              <strong>Create a new group</strong>
              <small>For a crew you’ll split with again · {firstNames}</small>
            </span>
          </button>
        )
      ) : null}
    </div>
  )
}
