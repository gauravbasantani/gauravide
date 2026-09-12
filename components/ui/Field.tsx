'use client'

import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'
import styles from './Field.module.css'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'> & {
  /** Always visible. Placeholder-as-label fails: it vanishes on typing and
   *  screen readers treat it as a hint, not a name (ACCESSIBILITY.md §5). */
  label: string
  /** Sits below the field, wired via aria-describedby so it is read after the name. */
  help?: string
  /** Replaces help text, announced immediately via role="alert". */
  error?: string
  /** Money fields get tabular numerals and a numeric keypad on phones. */
  money?: boolean
}

export function Field({ label, help, error, money, ...rest }: Props) {
  const id = useId()
  const helpId = `${id}-help`
  const errId = `${id}-err`

  const describedBy = [help ? helpId : null, error ? errId : null].filter(Boolean).join(' ')

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        {...rest}
        id={id}
        className={[styles.input, error ? styles.invalid : '', money ? styles.money : '']
          .filter(Boolean)
          .join(' ')}
        inputMode={money ? 'decimal' : rest.inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      />
      {help && !error ? (
        <p id={helpId} className={styles.help}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errId} className={styles.error} role="alert">
          <span className={styles.errorIcon} aria-hidden="true">
            !
          </span>
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  )
}
