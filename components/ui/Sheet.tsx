'use client'

import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import styles from './Sheet.module.css'

type Props = {
  open: boolean
  title: string
  description?: string
  /** Modals (destructive/irreversible) only close on an explicit action. */
  dismissible?: boolean
  onClose: () => void
  children: ReactNode
  actions?: ReactNode
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

export function Sheet({
  open,
  title,
  description,
  dismissible = true,
  onClose,
  children,
  actions,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocusTo = useRef<HTMLElement | null>(null)
  const id = useId()

  // Callers pass inline arrows for onClose, so its identity changes on every
  // parent render. Holding it in a ref keeps it out of the effect's
  // dependencies — otherwise the effect tore down and re-ran on each render,
  // yanking focus out of the dialog on every keystroke.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return

    // Remember where focus came from, so we can put it back (ACCESSIBILITY §4).
    returnFocusTo.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel) return

      // Focus trap: cycle within the panel.
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      returnFocusTo.current?.focus()
    }
    // Deliberately NOT depending on onClose — see onCloseRef above.
  }, [open, dismissible])

  if (!open) return null

  return (
    <div className={styles.backdrop}>
      {/* A real <button> rather than a click handler on the backdrop div:
          keyboard and screen-reader users get the same dismiss affordance
          that mouse users get from clicking outside. */}
      {dismissible ? (
        <button type="button" className={styles.scrim} onClick={onClose}>
          <span className="sr-only">Close</span>
        </button>
      ) : null}
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-desc` : undefined}
      >
        <h2 id={`${id}-title`} className={styles.title}>
          {title}
        </h2>
        {description ? (
          <p id={`${id}-desc`} className={styles.desc}>
            {description}
          </p>
        ) : null}
        <div className={styles.body}>{children}</div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </div>
  )
}
