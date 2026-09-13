import { describe, expect, it } from 'vitest'
import { newShareToken, SHARE_TOKEN, shareUrl } from '@/lib/share'
import { redactedForRemoval, type StoredSplitData } from '@/lib/history'

describe('share tokens', () => {
  it('are url-safe and long enough not to be guessed', () => {
    const token = newShareToken()
    expect(token).toMatch(SHARE_TOKEN)
    expect(token.length).toBeGreaterThanOrEqual(32)
  })

  it('are different every time', () => {
    const tokens = new Set(Array.from({ length: 200 }, newShareToken))
    expect(tokens.size).toBe(200)
  })

  it('rejects anything that is not a token before it reaches the database', () => {
    for (const bad of ['', 'short', '../../etc', 'a'.repeat(65), 'has spaces', 'semi;colon']) {
      expect(SHARE_TOKEN.test(bad)).toBe(false)
    }
  })

  it('builds a link against the given origin', () => {
    expect(shareUrl('abc', 'https://example.com/')).toBe('https://example.com/s/abc')
  })
})

describe('removing a split', () => {
  it('takes the share token with it, so an old link stops resolving', () => {
    const data = {
      currency: 'USD',
      totalCents: 1000,
      merchant: 'SAFEWAY',
      items: [],
      people: [],
      shareToken: newShareToken(),
      sharedAt: new Date().toISOString(),
    } as unknown as StoredSplitData & Record<string, unknown>

    const redacted = redactedForRemoval(data, false)
    expect(redacted.shareToken).toBeUndefined()
    expect(redacted.sharedAt).toBeUndefined()
    expect(redacted.totalCents).toBe(1000)
  })
})
