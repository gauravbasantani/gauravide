'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import styles from './CameraCapture.module.css'

type Props = {
  open: boolean
  onClose: () => void
  onCapture: (file: File) => void
}

type Status = 'starting' | 'ready' | 'denied' | 'unavailable'

/**
 * Take the photo in the app, on a laptop or iPad (FR-44a).
 *
 * Phones use the native camera through <input capture>, which gives a
 * full-resolution shot and the system's own framing. Everywhere else the
 * camera only exists through getUserMedia — without this, "snap a photo"
 * would be a promise the app couldn't keep on a desktop.
 *
 * The stream is stopped on close, on unmount and after the shot, so the
 * camera light never stays on.
 */
export function CameraCapture({ open, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<Status>('starting')
  const [busy, setBusy] = useState(false)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setStatus('starting')

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unavailable')
        return
      }
      try {
        // The back camera on a tablet; a laptop only has the one.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => undefined)
        }
        setStatus('ready')
      } catch (error) {
        if (cancelled) return
        const name = error instanceof Error ? error.name : ''
        setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable')
      }
    }
    void start()

    return () => {
      cancelled = true
      stop()
    }
  }, [open, stop])

  useEffect(() => stop, [stop])

  async function takePhoto() {
    const video = videoRef.current
    if (!video || busy) return
    setBusy(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 960
      const context = canvas.getContext('2d')
      if (!context) return
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92),
      )
      if (!blob) return
      stop()
      onCapture(new File([blob], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      onClose()
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <Sheet
      open
      title="Take a photo of the receipt"
      description="Fill the frame with the receipt, keep it flat, and make sure the total is in shot."
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void takePhoto()}
            loading={busy}
            disabled={status !== 'ready'}
            disabledReason={status !== 'ready' ? 'Waiting for the camera' : undefined}
          >
            Take photo
          </Button>
        </>
      }
    >
      <div className={styles.stage}>
        {/* Never mirrored: the text on a receipt has to read the right way round. */}
        <video ref={videoRef} className={styles.video} playsInline muted autoPlay aria-label="Camera preview" />
        {status !== 'ready' ? (
          <p className={styles.overlay} role="status">
            {status === 'starting'
              ? 'Starting the camera…'
              : status === 'denied'
                ? 'Camera access was blocked. Allow it in your browser’s address bar, or close this and choose a file instead.'
                : 'No camera available on this device. Close this and choose a file instead.'}
          </p>
        ) : null}
      </div>
      <p className={styles.hint}>
        The photo goes straight into your split. Location data is stripped before anything is
        uploaded.
      </p>
    </Sheet>
  )
}
