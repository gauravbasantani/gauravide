import { beforeAll, describe, expect, it } from 'vitest'
import {
  credentialsMatch,
  hashPassword,
  readAdminToken,
  sealAdminToken,
  verifyPassword,
} from '@/lib/adminCrypto'
import { computeMetrics, minutesSaved, type EventRow, type SplitRow } from '@/lib/metrics'
import { hashToken, makeResetToken } from '@/lib/adminStore'
import { maskEmail } from '@/lib/email'
import { NOT_REMOVED, redactedForRemoval } from '@/lib/history'
import { hashPassword as scriptHash } from '../scripts/admin-password.mjs'

describe('admin password', () => {
  it('verifies the right password and refuses a wrong one', async () => {
    const stored = await hashPassword('correct horse battery')
    expect(stored.startsWith('scrypt:32768:8:1:')).toBe(true)
    expect(stored).not.toContain('correct horse')
    expect(await verifyPassword('correct horse battery', stored)).toBe(true)
    expect(await verifyPassword('correct horse batterY', stored)).toBe(false)
  })

  it('salts every hash, so the same password never hashes the same way twice', async () => {
    expect(await hashPassword('same-password-1')).not.toBe(await hashPassword('same-password-1'))
  })

  it('accepts hashes from npm run admin:password', async () => {
    expect(await verifyPassword('from-the-script-2026', await scriptHash('from-the-script-2026'))).toBe(true)
  })

  it('refuses malformed or absurd hashes instead of hanging', async () => {
    expect(await verifyPassword('x', 'plaintext')).toBe(false)
    expect(await verifyPassword('x', 'scrypt:1073741824:8:1:abc:def')).toBe(false)
  })

  it('needs both username and password; username ignores case and spaces', async () => {
    const stored = await hashPassword('s3cret-pass-word')
    expect(await credentialsMatch(' Gaurav ', 's3cret-pass-word', 'gaurav', stored)).toBe(true)
    expect(await credentialsMatch('someone', 's3cret-pass-word', 'gaurav', stored)).toBe(false)
    expect(await credentialsMatch('gaurav', 'wrong', 'gaurav', stored)).toBe(false)
  })
})

describe('admin session token', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = 'unit-test-session-secret'
  })

  it('is valid until it expires, and cannot be forged', async () => {
    const now = Date.parse('2026-09-12T10:00:00Z')
    const token = await sealAdminToken(now)
    expect(await readAdminToken(token, now + 60_000)).toBe(true)
    expect(await readAdminToken(token, now + 8 * 60 * 60 * 1000 + 1)).toBe(false)
    expect(await readAdminToken(token.slice(0, -2) + 'AA', now)).toBe(false)
    expect(await readAdminToken('nonsense', now)).toBe(false)
    expect(await readAdminToken(undefined, now)).toBe(false)
  })

  it('stops working when the secret rotates', async () => {
    const token = await sealAdminToken()
    process.env.SESSION_SECRET = 'rotated-secret'
    expect(await readAdminToken(token)).toBe(false)
    process.env.SESSION_SECRET = 'unit-test-session-secret'
  })
})

describe('admin metrics', () => {
  const now = Date.parse('2026-09-12T12:00:00Z')
  const event = (user_key: string, name: string, created_at: string, props: Record<string, unknown> = {}): EventRow => ({
    user_key,
    name,
    created_at,
    props,
  })
  const split = (owner_id: string, created_at: string, currency: string, total: number, extra: Partial<SplitRow> = {}): SplitRow => ({
    owner_id,
    created_at,
    archived_at: null,
    image_path: null,
    currency,
    total: String(total),
    mode: null,
    group_id: null,
    item_count: null,
    people_count: null,
    payer_count: null,
    participants: null,
    ...extra,
  })

  const events: EventRow[] = [
    event('101', 'receipt_extracted', '2026-09-12T09:00:00Z', { source: 'gemini' }),
    event('101', 'split_submitted', '2026-09-12T09:05:00Z', {
      mode: 'items',
      payers: 'one',
      group: 'group',
      item_splits: 'no',
      items: 4,
      people: 2,
    }),
    event('101', 'split_submitted', '2026-09-11T20:00:00Z', {
      mode: 'equal',
      payers: 'several',
      group: 'none',
      item_splits: 'no',
    }),
    event('101', 'split_edited', '2026-09-12T10:00:00Z'),
    event('anon-1', 'receipt_extracted', '2026-09-10T08:00:00Z', { source: 'ocrspace' }),
    event('anon-1', 'receipt_failed', '2026-09-10T08:01:00Z', { reason: 'error' }),
    event('202', 'split_submitted', '2026-07-01T08:00:00Z', { mode: 'equal' }),
  ]
  const splits: SplitRow[] = [
    split('101', '2026-09-12T09:05:00Z', 'USD', 4000, { participants: ['101', '202'], image_path: '101/a.jpg' }),
    split('101', '2026-09-11T20:00:00Z', 'USD', 2000, { participants: ['101', '303'] }),
    split('202', '2026-07-01T08:00:00Z', 'EUR', 1500),
  ]

  it('last 30 days', () => {
    const m = computeMetrics({ splits, events, range: '30d', now })
    expect(m.people).toEqual({ total: 2, accounts: 1, guests: 1, newAccounts: 1, active7: 1, returning: 1 })
    expect(m.receiptsScanned).toBe(2)
    expect(m.splitsSent).toBe(2)
    expect(m.splitsEdited).toBe(1)
    expect(m.scanToSend).toBe(1)
    expect(m.money).toEqual([{ currency: 'USD', cents: 6000 }])
    expect(m.averageReceipt).toEqual({ currency: 'USD', cents: 3000 })
    expect(m.peopleHelped).toBe(3)
    expect(m.itemsSplit).toBe(4)
    expect(m.timeSaved).toEqual({
      minutes: minutesSaved(4, 2) + minutesSaved(null, null),
      estimatedSends: 1,
      perSender: 7.5,
    })
    expect(m.timeSaved.minutes).toBe(7.5)
    expect(m.frequency).toMatchObject({
      weeklyActive: 1,
      monthlyActive: 1,
      stickiness: 1,
      splitsPerSender: 2,
      buckets: { once: 1, twoToThree: 1, fourToNine: 0, tenPlus: 0 },
    })
    // 101 split at 20:00 on the 11th and 09:05 on the 12th: 13h05m apart.
    expect(m.frequency.medianDaysBetweenSplits).toBeCloseTo(13.0833 / 24, 4)
    expect(m.weekly).toHaveLength(8)
    expect(m.weekly.at(-1)).toEqual({ weekStart: '2026-09-05', splits: 2, minutes: 7.5 })
    expect(m.modes.map((x) => [x.key, x.count])).toEqual([
      ['items', 1],
      ['equal', 1],
      ['shares', 0],
      ['exact', 0],
    ])
    expect(m.habits).toEqual({ severalPayers: 0.5, inGroup: 0.5, itemSplits: 0, withPhoto: 0.5 })
    expect(m.reader).toEqual({ gemini: 1, backup: 1, failed: 1 })
    expect(m.daily).toHaveLength(30)
    expect(m.daily[0]?.date).toBe('2026-08-14')
    expect(m.daily.at(-1)).toEqual({ date: '2026-09-12', scanned: 1, sent: 1 })
    expect(m.users.map((u) => [u.key, u.receipts, u.splits])).toEqual([
      ['101', 1, 2],
      ['202', 0, 1],
    ])
  })

  it('all time never adds different currencies together', () => {
    const m = computeMetrics({ splits, events, range: 'all', now })
    expect(m.people.total).toBe(3)
    expect(m.money).toEqual([
      { currency: 'USD', cents: 6000 },
      { currency: 'EUR', cents: 1500 },
    ])
  })

  it('malformed event rows never crash the page', () => {
    const odd = [
      { user_key: '101', name: 'split_submitted', created_at: '2026-09-12T08:00:00Z', props: '{"mode":"items","payers":"one","items":3,"people":2}' },
      { user_key: '101', name: 'split_submitted', created_at: '2026-09-12T08:30:00Z', props: '[object Object]' },
      { user_key: '101', name: 'split_submitted', created_at: '2026-09-12T08:45:00Z', props: null },
      { user_key: '101', name: 'split_submitted', created_at: 'not a date', props: {} },
    ] as unknown as EventRow[]
    const m = computeMetrics({ splits: [], events: odd, range: '7d', now })
    expect(m.splitsSent).toBe(3)
    expect(m.modes.find((x) => x.key === 'items')?.count).toBe(1)
    expect(m.habits.severalPayers).toBe(0)
    expect(m.itemsSplit).toBe(3)
  })

  it('an empty app shows zeros, not NaN', () => {
    const m = computeMetrics({ splits: [], events: [], range: '7d', now })
    expect(m.people.total).toBe(0)
    expect(m.scanToSend).toBeNull()
    expect(m.averageReceipt).toBeNull()
    expect(m.habits.withPhoto).toBeNull()
    expect(m.daily).toHaveLength(7)
    expect(m.timeSaved.minutes).toBe(0)
  })
})

describe('reset links and email addresses', () => {
  it('stores only a hash of the reset token', () => {
    const token = makeResetToken()
    expect(token.length).toBeGreaterThan(30)
    expect(hashToken(token)).toHaveLength(64)
    expect(hashToken(token)).not.toContain(token)
    expect(hashToken(token)).toBe(hashToken(token))
    expect(hashToken(token)).not.toBe(hashToken(makeResetToken()))
  })

  it('masks the address it emails', () => {
    expect(maskEmail('gaurav.inbox29@gmail.com')).toBe('g*************@gmail.com')
    expect(maskEmail('a@b.com')).toBe('a*@b.com')
  })
})

describe('removing a split keeps the usage count (DB-12)', () => {
  const now = Date.parse('2026-09-12T12:00:00Z')
  const base: SplitRow = {
    owner_id: '101',
    created_at: '2026-09-12T09:00:00Z',
    archived_at: null,
    image_path: null,
    currency: 'USD',
    total: '4000',
    mode: 'items',
    group_id: null,
    item_count: '6',
    people_count: '2',
    payer_count: '1',
    participants: ['101', '202'],
  }

  it('counts money, people and photos after the owner removed their copy', () => {
    const live = computeMetrics({ splits: [{ ...base, image_path: '101/a.jpg' }], events: [], range: '30d', now })
    const removed = computeMetrics({
      splits: [{ ...base, removed_at: '2026-09-12T11:00:00Z', had_photo: 'true' }],
      events: [],
      range: '30d',
      now,
    })
    expect(removed.money).toEqual(live.money)
    expect(removed.peopleHelped).toBe(live.peopleHelped)
    expect(removed.habits.withPhoto).toBe(live.habits.withPhoto)
    expect(removed.removedByUsers).toBe(1)
    expect(live.removedByUsers).toBe(0)
  })
})

describe('what a removed split leaves behind', () => {
  const data = {
    merchant: 'Costco Wholesale',
    date: '2026-09-12',
    currency: 'USD',
    totalCents: 10850,
    taxCents: 0,
    tipCents: 0,
    feeCents: 0,
    items: [{ name: 'Harvest Snaps', cents: 859 }],
    people: [{ id: 101, name: 'Gaurav' }],
    payerId: 101,
    groupId: 0,
    groupName: '',
    status: 'in_splitwise' as const,
    owed: { '101': 5857 },
    paid: { '101': 10850 },
    itemCount: 5,
    peopleCount: 2,
    participants: [101, 202],
  }

  it('keeps the counts and drops everything that describes the receipt', () => {
    const left = redactedForRemoval(data, true)
    expect(left).toMatchObject({
      currency: 'USD',
      totalCents: 10850,
      itemCount: 5,
      peopleCount: 2,
      participants: [101, 202],
      hadPhoto: true,
    })
    expect(typeof left.removedAt).toBe('string')
    const json = JSON.stringify(left)
    for (const secret of ['Costco', 'Harvest Snaps', 'Gaurav', '5857', 'merchant', 'items', 'owed', 'paid']) {
      expect(json).not.toContain(secret)
    }
  })

  it('marks the row so the owner can no longer read it', () => {
    expect(NOT_REMOVED).toEqual({ 'data->>removedAt': 'is.null' })
  })
})
