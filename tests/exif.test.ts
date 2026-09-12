import { describe, it, expect } from 'vitest'
import { stripJpegMetadata, hasExif } from '@/lib/exif'

/** A minimal JPEG: SOI, an APP1 (EXIF) block, then SOS + data + EOI. */
function jpegWithExif(): Uint8Array {
  const exifPayload = new TextEncoder().encode('Exif\0\0GPSLatitude=33.4255')
  const len = exifPayload.length + 2
  return new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe1, (len >> 8) & 0xff, len & 0xff, ...exifPayload, // APP1
    0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, // DQT — must survive
    0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0x33, // SOS + scan data
    0xff, 0xd9, // EOI
  ])
}

describe('stripJpegMetadata (GAP-4 backstop)', () => {
  it('removes the EXIF block', () => {
    const before = jpegWithExif()
    expect(hasExif(before)).toBe(true)
    expect(hasExif(stripJpegMetadata(before))).toBe(false)
  })

  it('does not leak GPS text', () => {
    const out = stripJpegMetadata(jpegWithExif())
    expect(new TextDecoder().decode(out)).not.toContain('GPSLatitude')
  })

  it('keeps the segments a decoder needs', () => {
    const out = stripJpegMetadata(jpegWithExif())
    expect(out[0]).toBe(0xff)
    expect(out[1]).toBe(0xd8) // SOI
    // DQT survives
    let hasDqt = false
    for (let i = 0; i < out.length - 1; i++) {
      if (out[i] === 0xff && out[i + 1] === 0xdb) hasDqt = true
    }
    expect(hasDqt).toBe(true)
    // ends with EOI
    expect(out[out.length - 2]).toBe(0xff)
    expect(out[out.length - 1]).toBe(0xd9)
  })

  it('leaves a non-JPEG untouched', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
    expect(stripJpegMetadata(png)).toEqual(png)
  })

  it('never throws on truncated or malformed input', () => {
    for (const bad of [new Uint8Array([]), new Uint8Array([0xff]), new Uint8Array([0xff, 0xd8, 0xff, 0xe1])]) {
      expect(() => stripJpegMetadata(bad)).not.toThrow()
    }
  })
})
