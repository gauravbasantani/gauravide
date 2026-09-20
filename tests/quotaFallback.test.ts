/**
 * A spent daily allowance must fail fast, not slowly.
 *
 * When the free tier's daily cap is gone, every retry spends another unit of
 * an allowance that is already at zero and adds a backoff the user waits
 * through. Measured before this: the first scan of the day after the cap took
 * forty-five seconds to reach the backup reader.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DAILY_429 = {
  error: {
    code: 429,
    message: 'You exceeded your current quota',
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
        violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }],
      },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '44s' },
    ],
  },
}

const BURST_429 = {
  error: { code: 429, message: 'Too many requests', details: [] },
}

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('a spent daily quota', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.GEMINI_API_KEY = 'test-key'
    delete process.env.OCRSPACE_API_KEY // force the ladder to the bottom
  })
  afterEach(() => vi.unstubAllGlobals())

  it('is not retried — one call, not three', async () => {
    const fetchMock = vi.fn(async () => respond(429, DAILY_429))
    vi.stubGlobal('fetch', fetchMock)
    const { extractReceipt } = await import('@/lib/receipt')

    await expect(extractReceipt('AAAA', 'image/jpeg')).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('short-circuits the next receipt instead of calling at all', async () => {
    const fetchMock = vi.fn(async () => respond(429, DAILY_429))
    vi.stubGlobal('fetch', fetchMock)
    const { extractReceipt } = await import('@/lib/receipt')

    await expect(extractReceipt('AAAA', 'image/jpeg')).rejects.toThrow()
    await expect(extractReceipt('AAAA', 'image/jpeg')).rejects.toThrow()
    // The second receipt must not spend an allowance already known to be gone.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('still retries a momentary burst, which does clear', async () => {
    const fetchMock = vi.fn(async () => respond(429, BURST_429))
    vi.stubGlobal('fetch', fetchMock)
    const { extractReceipt } = await import('@/lib/receipt')

    await expect(extractReceipt('AAAA', 'image/jpeg')).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
