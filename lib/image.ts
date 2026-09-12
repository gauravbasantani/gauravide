/**
 * Client-side image preparation. Runs in the browser, before anything is
 * uploaded — which is the point.
 *
 * Photos carry EXIF, and EXIF carries GPS. Sending a raw photo to the vision
 * provider would tell them where the user shops (GAP-4). Re-encoding through a
 * canvas drops every EXIF tag, and applying the orientation flag first means
 * the model sees the receipt upright instead of sideways.
 */

const MAX_EDGE = 2000 // plenty for OCR; keeps uploads small on bad wifi
const QUALITY = 0.85

export type PreparedImage = { file: File; width: number; height: number }

export async function prepareImage(input: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' })

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  )
  if (!blob) throw new Error('could not encode image')

  // New File from canvas output: no EXIF survives this, GPS included.
  return {
    file: new File([blob], 'receipt.jpg', { type: 'image/jpeg' }),
    width,
    height,
  }
}

/** A preview URL for the uploaded image. Caller revokes it. */
export function previewUrl(file: File): string {
  return URL.createObjectURL(file)
}
