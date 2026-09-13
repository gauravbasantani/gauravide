'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

  /*
   * The sheet is rendered into <body>, not where it is written.
   *
   * A dialog must cover the page, and `position: fixed` plus a z-index only
   * mean that relative to the viewport and the root stacking context. Any
   * ancestor with a transform, a filter, a backdrop-filter or its own z-index
   * quietly becomes the containing block and the stacking context instead, and
   * the sheet ends up trapped inside it — laid out in a toolbar's box, or
   * painted under the site nav. That shipped once, when the split page's
   * action bar became sticky with a blurred background and the share sheet's
   * buttons could no longer be clicked on a phone.
   *
   * Portalling makes it impossible for any caller to reintroduce, rather than
   * asking every future caller to know this.
   */
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

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

  if (!open || !mounted) return null

  return createPortal(
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
    </div>,
    document.body,
  )
}
