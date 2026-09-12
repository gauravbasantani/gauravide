'use client'

import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  variant?: ButtonVariant
  /** Full width — the mobile CTA pattern. */
  full?: boolean
  /** Shows a spinner, locks the width, and disables interaction. */
  loading?: boolean
  /**
   * Why the button is disabled. Rendered below it for everyone and wired to
   * the button with aria-describedby.
   *
   * Required whenever `disabled` is true: a dead grey button with no
   * explanation is the most common dead end in apps like this (UX §4).
   */
  disabledReason?: string
  children: ReactNode
}

let idCounter = 0

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', full, loading, disabledReason, disabled, children, ...rest },
  ref,
) {
  const isDisabled = Boolean(disabled ?? loading)
  const reasonId =
    isDisabled && disabledReason ? `btn-reason-${(idCounter = (idCounter + 1) % 1e6)}` : undefined

  const classes = [styles.base, styles[variant], full ? styles.full : '', loading ? styles.loading : '']
    .filter(Boolean)
    .join(' ')

  return (
    <span className={full ? styles.wrapFull : styles.wrap}>
      <button
        {...rest}
        ref={ref}
        className={classes}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        aria-describedby={reasonId}
      >
        <span className={styles.label}>{children}</span>
        {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
      </button>
      {reasonId ? (
        <span id={reasonId} className={styles.reason}>
          {disabledReason}
        </span>
      ) : null}
    </span>
  )
})
