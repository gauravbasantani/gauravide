/**
 * Client-side image preparation. Runs in the browser, before anything is
 * uploaded — which is the point.
 *
 * Photos carry EXIF, and EXIF carries GPS. Sending a raw photo to the vision
 * provider would tell them where the user shops (GAP-4). Re-encoding through a
 * canvas drops every EXIF tag, and applying the orientation flag first means
 * the model sees the receipt upright instead of sideways.
 *
 * WHY THIS IS DEFENSIVE: on mobile Safari the obvious implementation
 * (createImageBitmap with options, then canvas.toBlob) silently produced a
 * ~0-byte image. Nothing threw. The upload succeeded, extraction found no
 * items, and the user reached an empty review screen with no idea why.
 * Caught by a Playwright run against real WebKit.
 *
 * So: three decode strategies, and a size sanity check that refuses to
 * upload an implausibly small result.
 */

const MAX_EDGE = 2000 // plenty for OCR; keeps uploads small on bad wifi
const QUALITY = 0.85

/** Below this, a "photo" is certainly a failed encode, not a real image. */
const MIN_PLAUSIBLE_BYTES = 5_000

export type PreparedImage = {
  file: File
  width: number
  height: number
  /** False when every canvas path failed and we fell back to the original. */
  exifStripped: boolean
}

type Decoded = { source: CanvasImageSource; width: number; height: number; close?: () => void }

/** Strategy 1: the fast path, with orientation applied during decode. */
async function viaBitmapWithOptions(file: File): Promise<Decoded | null> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    if (!bmp.width || !bmp.height) return null
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
  } catch {
    return null
  }
}

/** Strategy 2: same, without the options bag some engines reject. */
async function viaBitmap(file: File): Promise<Decoded | null> {
  try {
    const bmp = await createImageBitmap(file)
    if (!bmp.width || !bmp.height) return null
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
  } catch {
    return null
  }
}

/** Strategy 3: a plain <img>. Slower, but the most widely supported path. */
async function viaImageElement(file: File): Promise<Decoded | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('image decode failed'))
      el.src = url
    })
    if (!img.naturalWidth || !img.naturalHeight) return null
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    }
  } catch {
    URL.revokeObjectURL(url)
    return null
  }
}

function encode(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(resolve, 'image/jpeg', QUALITY)
    } catch {
      resolve(null)
    }
  })
}

export async function prepareImage(input: File): Promise<PreparedImage> {
  for (const decode of [viaBitmapWithOptions, viaBitmap, viaImageElement]) {
    const decoded = await decode(input)
    if (!decoded) continue

    try {
      const scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height))
      const width = Math.max(1, Math.round(decoded.width * scale))
      const height = Math.max(1, Math.round(decoded.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) continue

      ctx.drawImage(decoded.source, 0, 0, width, height)
      const blob = await encode(canvas)

      // The check that would have caught the Safari bug before a user did.
      if (blob && blob.size >= MIN_PLAUSIBLE_BYTES) {
        return {
          file: new File([blob], 'receipt.jpg', { type: 'image/jpeg' }),
          width,
          height,
          exifStripped: true,
        }
      }
    } finally {
      decoded.close?.()
    }
  }

  // Every canvas path failed. Upload the original rather than an empty file:
  // a working app with server-side EXIF stripping beats a broken one. The
  // server strips EXIF before the image reaches any third party.
  return {
    file: input,
    width: 0,
    height: 0,
    exifStripped: false,
  }
}

/** A preview URL for the uploaded image. Caller revokes it. */
export function previewUrl(file: File): string {
  return URL.createObjectURL(file)
}
