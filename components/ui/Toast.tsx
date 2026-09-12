'use client'

import { useEffect, useState } from 'react'
import styles from './Toast.module.css'

export type ToastProps = {
  message: string
  /** Optional action, e.g. Undo. */
  actionLabel?: string
  onAction?: () => void
  /** Seconds before auto-dismiss. 4 for info, 30 when there is an undo (DEL-3). */
  duration?: number
  tone?: 'info' | 'error'
  onDismiss?: () => void
}

export function Toast({
  message,
  actionLabel,
  onAction,
  duration = 4,
  tone = 'info',
  onDismiss,
}: ToastProps) {
  const [left, setLeft] = useState(duration)

  useEffect(() => {
    if (left <= 0) {
      onDismiss?.()
      return
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [left, onDismiss])

  return (
    <div className={styles.region}>
      <div
        className={[styles.toast, tone === 'error' ? styles.error : ''].filter(Boolean).join(' ')}
        /* Errors interrupt; everything else waits its turn. */
        role={tone === 'error' ? 'alert' : 'status'}
      >
        <span className={styles.message}>
          {message}
          {/* The countdown is announced once in the action label, never ticked
              every second — that would be unbearable (ACCESSIBILITY.md §8). */}
        </span>
        {actionLabel ? (
          <button
            type="button"
            className={styles.action}
            onClick={onAction}
            aria-label={`${actionLabel}. ${left} seconds remaining.`}
          >
            {actionLabel}
            <span className={styles.count} aria-hidden="true">
              ({left})
            </span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
