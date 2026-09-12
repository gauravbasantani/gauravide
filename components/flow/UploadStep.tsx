'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { prepareImage, previewUrl } from '@/lib/image'
import type { ExtractedReceipt } from '@/lib/receipt'
import styles from './UploadStep.module.css'
import flow from './flow.module.css'

type Props = {
  onExtracted: (receipt: ExtractedReceipt, warnings: string[], source: string) => void
  onManual: () => void
}

type Phase = 'idle' | 'working' | 'error'

export function UploadStep({ onExtracted, onManual }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handle(file: File) {
    setPhase('working')
    setError(null)
    try {
      // EXIF (and its GPS) is stripped here, before anything is uploaded.
      const prepared = await prepareImage(file)
      setPreview(previewUrl(prepared.file))

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

  return (
    <div>
      {phase === 'error' && error ? (
        <div className={styles.error} role="alert">
          <p className={styles.errorTitle}>{error}</p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => cameraRef.current?.click()}>
              Try another photo
            </Button>
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
          if (file) void handle(file)
        }}
        /* Dragging is never the only way in — every drop zone has buttons
           beside it (WCAG 2.2 §2.5.7). */
        onPaste={(e) => {
          const file = e.clipboardData.files[0]
          if (file) void handle(file)
        }}
      >
        <span className={styles.icon} aria-hidden="true">
          🧾
        </span>
        <h2 className="t-section">Add your receipt</h2>

        <div className={styles.actions}>
          <span className={styles.primaryAction}>
            <Button full onClick={() => cameraRef.current?.click()}>
              Take a photo
            </Button>
          </span>
          <Button variant="secondary" full onClick={() => fileRef.current?.click()}>
            Choose a file
          </Button>
          <Button variant="secondary" full onClick={onManual}>
            Type it in
          </Button>
        </div>

        <p className={styles.hint}>
          You can also drag an image here, or paste one with ⌘V. Photos are stripped of location
          data before they leave your device.
        </p>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className={styles.file}
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handle(f)
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className={styles.file}
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handle(f)
        }}
      />
      <p className={flow.srHint} style={{ marginTop: 'var(--space-4)' }}>
        JPG, PNG, WEBP or HEIC, up to 10 MB.
      </p>
    </div>
  )
}
