/**
 * Admin metrics — pure, so every number on the admin page is unit-tested.
 *
 * Inputs are narrow rows only: counts, dates, currency totals and Splitwise
 * ids. Nothing here can see what anyone bought, item names, or who owes whom
 * (MET-1…MET-4).
 */

export type Range = '7d' | '30d' | 'all'

/** One saved split, as the admin query selects it — never its contents. */
export type SplitRow = {
  owner_id: string
  created_at: string
  archived_at: string | null
  image_path: string | null
  currency: string | null
  total: string | null
  mode: string | null
  group_id: string | null
  item_count: string | null
  people_count: string | null
  payer_count: string | null
  participants: unknown
}

export type EventRow = {
  user_key: string
  name: string
  created_at: string
  props: Record<string, unknown> | null
}

/**
 * Time saved per receipt, in minutes. Conservative on purpose: by hand, a
 * receipt takes a couple of minutes plus reading each line and working out
 * each person's total; in the app it takes about a minute.
 */
export const TIME_MODEL = {
  manualBaseMin: 2,
  perItemMin: 0.25,
  perPersonMin: 0.75,
  appMin: 1,
  /** Used for splits sent before item and person counts were recorded. */
  defaultItems: 6,
  defaultPeople: 2,
} as const

export function minutesSaved(items: number | null, people: number | null): number {
  const i = items ?? TIME_MODEL.defaultItems
  const p = people ?? TIME_MODEL.defaultPeople
  return Math.max(
    0.5,
    TIME_MODEL.manualBaseMin + TIME_MODEL.perItemMin * i + TIME_MODEL.perPersonMin * p - TIME_MODEL.appMin,
  )
}

export const MODE_LABELS = {
  items: 'By item',
  equal: 'Equally',
  shares: 'By shares',
  exact: 'Exact amounts',
} as const

export type Metrics = {
  range: Range
  /** Days in the range; null for all time. */
  days: number | null
  people: {
    /** Signed-in accounts plus signed-out browsers active in the range. */
    total: number
    accounts: number
    guests: number
    newAccounts: number
    active7: number
    /** Accounts with more than one split — the honest measure of usefulness (MET-7). */
    returning: number
  }
  receiptsScanned: number
  splitsSent: number
  splitsEdited: number
  /** Share of scanned receipts that reached Splitwise. */
  scanToSend: number | null
  money: { currency: string; cents: number }[]
  averageReceipt: { currency: string; cents: number } | null
  /** Distinct Splitwise people in saved splits — the user and everyone they split with. */
  peopleHelped: number
  itemsSplit: number
  timeSaved: {
    minutes: number
    estimatedSends: number
    /** Minutes saved per account that sent a split in the range. */
    perSender: number | null
  }
  daily: { date: string; scanned: number; sent: number }[]
  modes: { key: keyof typeof MODE_LABELS; label: string; count: number }[]
  modesUnknown: number
  habits: {
    severalPayers: number | null
    inGroup: number | null
    itemSplits: number | null
    withPhoto: number | null
  }
  reader: { gemini: number; backup: number; failed: number }
  /** How often people use it — the question behind "is this actually useful?" */
  frequency: {
    weeklyActive: number
    monthlyActive: number
    /** Weekly ÷ monthly active: how much of this month's crowd comes back each week. */
    stickiness: number | null
    /** Splits sent per account that sent any, in the range. */
    splitsPerSender: number | null
    /** Median time between one account's consecutive splits, all time. */
    medianDaysBetweenSplits: number | null
    /** Accounts by how many splits they have ever sent. */
    buckets: { once: number; twoToThree: number; fourToNine: number; tenPlus: number }
  }
  /** The last 8 weeks, oldest first. */
  weekly: { weekStart: string; splits: number; minutes: number }[]
  users: { key: string; firstSeen: string; lastSeen: string; receipts: number; splits: number }[]
}

const DAY = 86_400_000
const isAccount = (key: string) => /^\d+$/.test(key)
const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null)
const dayKey = (time: number) => new Date(time).toISOString().slice(0, 10)

function num(value: unknown): number | null {
  const n =
    typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

/**
 * Event props as a plain object, whatever arrives: an object, a JSON string, or
 * junk. One malformed row must never take the whole admin page down.
 */
function toProps(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return toProps(JSON.parse(value))
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export function computeMetrics({
  splits,
  events: rawEvents,
  range,
  now,
}: {
  splits: SplitRow[]
  events: EventRow[]
  range: Range
  now: number
}): Metrics {
  const events = rawEvents
    .filter((e) => typeof e.user_key === 'string' && !Number.isNaN(Date.parse(e.created_at)))
    .map((e) => ({ ...e, props: toProps(e.props) }))
  const days = range === '7d' ? 7 : range === '30d' ? 30 : null
  const since = days ? now - days * DAY : null
  const inRange = (iso: string) => since === null || Date.parse(iso) >= since
  const rangedEvents = events.filter((e) => inRange(e.created_at))
  const rangedSplits = splits.filter((s) => inRange(s.created_at))

  const scans = rangedEvents.filter((e) => e.name === 'receipt_extracted')
  const failures = rangedEvents.filter((e) => e.name === 'receipt_failed')
  const sends = rangedEvents.filter((e) => e.name === 'split_submitted')
  const edits = rangedEvents.filter((e) => e.name === 'split_edited')

  /* People */
  const keys = new Set([...rangedEvents.map((e) => e.user_key), ...rangedSplits.map((s) => s.owner_id)])
  const accounts = [...keys].filter(isAccount).length
  const guests = [...keys].filter((key) => !isAccount(key)).length

  // Lifetime activity per account — "joined" means first ever, not first in range.
  const lifetime = new Map<string, { first: string; last: string; receipts: number; splits: number }>()
  const touch = (key: string, at: string, kind?: 'receipt' | 'split') => {
    if (!isAccount(key)) return
    const current = lifetime.get(key) ?? { first: at, last: at, receipts: 0, splits: 0 }
    if (at < current.first) current.first = at
    if (at > current.last) current.last = at
    if (kind === 'receipt') current.receipts++
    if (kind === 'split') current.splits++
    lifetime.set(key, current)
  }
  for (const e of events) {
    touch(
      e.user_key,
      e.created_at,
      e.name === 'receipt_extracted' ? 'receipt' : e.name === 'split_submitted' ? 'split' : undefined,
    )
  }
  for (const s of splits) touch(s.owner_id, s.created_at)
  const everyone = [...lifetime.values()]

  /* Money — saved splits only, never mixed across currencies */
  const byCurrency = new Map<string, number>()
  for (const s of rangedSplits) {
    const currency = s.currency || 'USD'
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + (num(s.total) ?? 0))
  }
  const money = [...byCurrency]
    .map(([currency, cents]) => ({ currency, cents }))
    .sort((a, b) => b.cents - a.cents)
  const primary = money[0]
  const primaryCount = primary
    ? rangedSplits.filter((s) => (s.currency || 'USD') === primary.currency).length
    : 0

  /* People helped */
  const helped = new Set<string>()
  for (const s of rangedSplits) {
    helped.add(s.owner_id)
    if (Array.isArray(s.participants)) s.participants.forEach((p) => helped.add(String(p)))
  }

  /* Time saved and items */
  let minutes = 0
  let estimatedSends = 0
  let itemsSplit = 0
  for (const e of sends) {
    const items = num(e.props?.items)
    const people = num(e.props?.people)
    if (items === null || people === null) estimatedSends++
    minutes += minutesSaved(items, people)
    itemsSplit += items ?? 0
  }

  /* Daily activity — the last 7 or 30 days */
  const chartDays = days ?? 30
  const start = now - (chartDays - 1) * DAY
  const daily = Array.from({ length: chartDays }, (_, i) => ({
    date: dayKey(start + i * DAY),
    scanned: 0,
    sent: 0,
  }))
  const indexOf = new Map(daily.map((d, i) => [d.date, i]))
  for (const e of events) {
    const index = indexOf.get(dayKey(Date.parse(e.created_at)))
    const day = index === undefined ? undefined : daily[index]
    if (!day) continue
    if (e.name === 'receipt_extracted') day.scanned++
    if (e.name === 'split_submitted') day.sent++
  }

  /* How people split */
  const modeCounts: Record<keyof typeof MODE_LABELS, number> = { items: 0, equal: 0, shares: 0, exact: 0 }
  let modesUnknown = 0
  for (const e of sends) {
    const mode = e.props?.mode
    if (typeof mode === 'string' && mode in modeCounts) modeCounts[mode as keyof typeof MODE_LABELS]++
    else modesUnknown++
  }
  const modes = (Object.keys(MODE_LABELS) as (keyof typeof MODE_LABELS)[]).map((key) => ({
    key,
    label: MODE_LABELS[key],
    count: modeCounts[key],
  }))

  const recorded = (field: string) => sends.filter((e) => e.props && field in e.props)
  const share = (field: string, value: string) =>
    ratio(recorded(field).filter((e) => e.props?.[field] === value).length, recorded(field).length)

  /* How often people use it */
  const senders = new Set(sends.map((e) => e.user_key))
  const activeWithin = (ms: number) =>
    new Set(
      events
        .filter((e) => isAccount(e.user_key) && Date.parse(e.created_at) >= now - ms)
        .map((e) => e.user_key),
    ).size
  const weeklyActive = activeWithin(7 * DAY)
  const monthlyActive = activeWithin(30 * DAY)

  const sendTimes = new Map<string, number[]>()
  for (const e of events) {
    if (e.name !== 'split_submitted' || !isAccount(e.user_key)) continue
    sendTimes.set(e.user_key, [...(sendTimes.get(e.user_key) ?? []), Date.parse(e.created_at)])
  }
  const gaps: number[] = []
  const buckets = { once: 0, twoToThree: 0, fourToNine: 0, tenPlus: 0 }
  for (const times of sendTimes.values()) {
    times.sort((a, b) => a - b)
    for (let i = 1; i < times.length; i++) gaps.push(((times[i] ?? 0) - (times[i - 1] ?? 0)) / DAY)
    const n = times.length
    if (n === 1) buckets.once++
    else if (n <= 3) buckets.twoToThree++
    else if (n <= 9) buckets.fourToNine++
    else buckets.tenPlus++
  }
  gaps.sort((a, b) => a - b)
  const middle = Math.floor(gaps.length / 2)
  const medianDaysBetweenSplits =
    gaps.length === 0
      ? null
      : gaps.length % 2 === 1
        ? (gaps[middle] ?? 0)
        : ((gaps[middle - 1] ?? 0) + (gaps[middle] ?? 0)) / 2

  const WEEKS = 8
  const weekly = Array.from({ length: WEEKS }, (_, i) => {
    const start = now - (WEEKS - i) * 7 * DAY
    const end = start + 7 * DAY
    const inWeek = events.filter((e) => {
      const at = Date.parse(e.created_at)
      return e.name === 'split_submitted' && at >= start && at < end
    })
    return {
      weekStart: dayKey(start),
      splits: inWeek.length,
      minutes: inWeek.reduce((a, e) => a + minutesSaved(num(e.props?.items), num(e.props?.people)), 0),
    }
  })

  return {
    range,
    days,
    people: {
      total: accounts + guests,
      accounts,
      guests,
      newAccounts: everyone.filter((u) => since === null || Date.parse(u.first) >= since).length,
      active7: everyone.filter((u) => Date.parse(u.last) >= now - 7 * DAY).length,
      returning: everyone.filter((u) => u.splits > 1).length,
    },
    receiptsScanned: scans.length,
    splitsSent: sends.length,
    splitsEdited: edits.length,
    scanToSend: scans.length > 0 ? Math.min(1, sends.length / scans.length) : null,
    money,
    averageReceipt:
      primary && primaryCount > 0
        ? { currency: primary.currency, cents: Math.round(primary.cents / primaryCount) }
        : null,
    peopleHelped: helped.size,
    itemsSplit,
    timeSaved: { minutes, estimatedSends, perSender: senders.size > 0 ? minutes / senders.size : null },
    frequency: {
      weeklyActive,
      monthlyActive,
      stickiness: ratio(weeklyActive, monthlyActive),
      splitsPerSender: senders.size > 0 ? sends.length / senders.size : null,
      medianDaysBetweenSplits,
      buckets,
    },
    weekly,
    daily,
    modes,
    modesUnknown,
    habits: {
      severalPayers: share('payers', 'several'),
      inGroup: share('group', 'group'),
      itemSplits: share('item_splits', 'yes'),
      withPhoto: ratio(rangedSplits.filter((s) => s.image_path).length, rangedSplits.length),
    },
    reader: {
      gemini: scans.filter((e) => e.props?.source === 'gemini').length,
      backup: scans.filter((e) => e.props?.source === 'ocrspace').length,
      failed: failures.length,
    },
    users: [...lifetime]
      .map(([key, u]) => ({ key, firstSeen: u.first, lastSeen: u.last, receipts: u.receipts, splits: u.splits }))
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
      .slice(0, 25),
  }
}
