/**
 * Server-side EXIF stripping — the backstop for GAP-4.
 *
 * The browser normally strips EXIF by re-encoding through a canvas. When that
 * fails (it silently did, on mobile Safari) the original file is uploaded
 * instead, and this removes the metadata before the image reaches any third
 * party. GPS coordinates must never leave with a receipt photo.
 *
 * Works on the JPEG segment structure directly: drop APP1 (EXIF/XMP) and
 * APP2..APP15, keep everything the decoder needs.
 */

const SOI = 0xd8 // start of image
const SOS = 0xda // start of scan — image data follows, stop parsing
const EOI = 0xd9

/** True for APP1–APP15: metadata segments, none required to decode. */
const isMetadataMarker = (marker: number) => marker >= 0xe1 && marker <= 0xef

export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  // Not a JPEG — nothing we can safely rewrite.
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== SOI) return bytes

  const keep: Uint8Array[] = [bytes.subarray(0, 2)] // SOI
  let i = 2

  while (i < bytes.length - 1) {
    if (bytes[i] !== 0xff) break // desynchronised; bail and keep the rest

    const marker = bytes[i + 1]
    if (marker === undefined) break

    // Padding fill bytes.
    if (marker === 0xff) {
      i += 1
      continue
    }
    // Image data begins; copy everything from here unchanged.
    if (marker === SOS || marker === EOI) {
      keep.push(bytes.subarray(i))
      i = bytes.length
      break
    }

    const hi = bytes[i + 2]
    const lo = bytes[i + 3]
    if (hi === undefined || lo === undefined) break
    const length = (hi << 8) | lo
    if (length < 2) break

    const end = i + 2 + length
    if (end > bytes.length) break

    if (!isMetadataMarker(marker)) keep.push(bytes.subarray(i, end))
    i = end
  }

  if (i < bytes.length && keep.length === 1) return bytes // parsed nothing useful

  const total = keep.reduce((n, part) => n + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of keep) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** Does this JPEG still carry an EXIF block? Used by tests. */
export function hasExif(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xe1) return true
  }
  return false
}
