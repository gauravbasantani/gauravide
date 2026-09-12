'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { prepareImage, previewUrl } from '@/lib/image'
import type { ExtractedReceipt } from '@/lib/receipt'
import styles from './UploadStep.module.css'
import flow from './flow.module.css'

type Props = {
  onExtracted: (receipt: ExtractedReceipt, warnings: string[], source: string) => void
  onManual: () => void
}

type Phase = 'idle' | 'selected' | 'working' | 'error'

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPTED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
])
const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|webp|heic|pdf)$/i

export function UploadStep({ onExtracted, onManual }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [selected, setSelected] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const previewRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    }
  }, [])

  function setFilePreview(file: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    const isPdf = file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name ?? '')
    const next = file && !isPdf ? previewUrl(file) : null
    previewRef.current = next
    setPreview(next)
  }

  function select(file: File) {
    if (file.size > MAX_BYTES) {
      setError('That file is over 10 MB — try a photo instead of a scan.')
      setPhase('error')
      return
    }
    if (!ACCEPTED_TYPES.has(file.type) && !ACCEPTED_EXTENSIONS.test(file.name)) {
      setError('Use a JPG, PNG, WEBP, HEIC photo, or PDF.')
      setPhase('error')
      return
    }
    setSelected(file)
    setFilePreview(file)
    setError(null)
    setPhase('selected')
  }

  async function extract() {
    if (!selected) return
    setPhase('working')
    setError(null)
    try {
      // EXIF (and its GPS) is stripped here, before anything is uploaded.
      const prepared = await prepareImage(selected)
      setFilePreview(prepared.file)

      const form = new FormData()
      form.append('file', prepared.file)
      const res = await fetch('/api/receipt/extract', { method: 'POST', body: form })
      const body = await res.json()

      if (!res.ok) {
        setPhase('error')
        setError(body.message ?? "Couldn't read that one.")
        return
      }
      onExtracted(body.receipt, body.warnings ?? [], body.source)
    } catch {
      setPhase('error')
      setError("Couldn't read that one — try again with more light, or type it in.")
    }
  }

  function handleInputChange(input: HTMLInputElement) {
    const file = input.files?.[0]
    input.value = '' // Selecting the same file again must retry too.
    if (file) select(file)
  }

  function picker(label: string, className?: string) {
    return (
      <label className={className}>
        {label}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          className="sr-only"
          onChange={(e) => handleInputChange(e.currentTarget)}
        />
      </label>
    )
  }

  if (phase === 'working') {
    return (
      <div className={styles.working}>
        {preview ? (
          <div className={styles.thumbWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="The receipt you just uploaded" className={styles.thumb} />
            <span className={styles.shimmer} aria-hidden="true" />
          </div>
        ) : null}
        <p role="status" aria-live="polite">
          Reading your receipt…
        </p>
        <Button variant="tertiary" onClick={onManual}>
          Type it in instead
        </Button>
      </div>
    )
  }

  if (phase === 'selected') {
    return (
      <div className={styles.selected}>
        {preview ? (
          <div className={styles.thumbWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Preview of the receipt you selected" className={styles.thumb} />
          </div>
        ) : (
          <div className={styles.filePreview} aria-hidden="true">
            <span className={styles.fileIcon}>PDF</span>
          </div>
        )}
        <div className={styles.fileDetails}>
          <strong>Receipt ready</strong>
          <span>{selected?.name}</span>
          <span className="t-caption">Check the preview, then scan it into editable items.</span>
        </div>
        <div className={styles.selectedActions}>
          <Button full onClick={() => void extract()}>
            Next: read this receipt
          </Button>
          {picker('Choose a different file', styles.fakeSecondary)}
          <Button variant="tertiary" onClick={onManual}>
            Type it in instead
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {phase === 'error' && error ? (
        <div className={styles.error} role="alert">
          <p className={styles.errorTitle}>{error}</p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <label className={styles.fakeSecondary}>
              Try another photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                className="sr-only"
                onChange={(e) => handleInputChange(e.currentTarget)}
              />
            </label>
            <Button onClick={onManual}>Type it in</Button>
          </div>
        </div>
      ) : null}

      <div
        className={styles.zone}
        data-dragging={dragging}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) select(file)
        }}
        /* Dragging is never the only way in — every drop zone has buttons
           beside it (WCAG 2.2 §2.5.7). */
        onPaste={(e) => {
          const file = e.clipboardData.files[0]
          if (file) select(file)
        }}
      >
        <span className={styles.icon} aria-hidden="true">
          🧾
        </span>
        <h2 className="t-section">Add your receipt</h2>
        <p className={styles.description}>
          We’ll turn the lines into an editable draft. Nothing is added to Splitwise until you
          review and approve it.
        </p>

        <div className={styles.tips} aria-label="Photo tips">
          <span>☀️ Good light</span>
          <span>▣ Keep it flat</span>
          <span>↕ Include the total</span>
        </div>

        <div className={styles.actions}>
          <label className={[styles.primaryAction, styles.fakePrimary].join(' ')}>
            Take a photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => handleInputChange(e.currentTarget)}
            />
          </label>
          <label className={styles.fakeSecondary}>
            Choose a file
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              className="sr-only"
              onChange={(e) => handleInputChange(e.currentTarget)}
            />
          </label>
          <Button variant="secondary" full onClick={onManual}>
            Type it in
          </Button>
        </div>

        <p className={styles.hint}>
          You can also drag an image here, or paste one with ⌘V. Photos are stripped of location
          data before they leave your device.
        </p>
      </div>

      <p className={flow.srHint} style={{ marginTop: 'var(--space-4)' }}>
        JPG, PNG, WEBP, HEIC or PDF, up to 10 MB.
      </p>
    </div>
  )
}
