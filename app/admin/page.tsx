import type { CSSProperties } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { dbConfigured, selectAll } from '@/lib/db'
import { opaqueUserId } from '@/lib/admin'
import { isAdminRequest } from '@/lib/adminAuth'
import { computeMetrics, TIME_MODEL, type EventRow, type Metrics, type Range, type SplitRow } from '@/lib/metrics'
import { formatMoney } from '@/lib/money'
import { adminEmail, emailConfigured, maskEmail } from '@/lib/email'
import { TestEmailButton } from './TestEmailButton'
import styles from './admin.module.css'

export const metadata = { title: 'Admin · Gauravide', robots: { index: false, follow: false } }

type Feedback = {
  id: string
  category: string
  message: string
  contact: string | null
  created_at: string
}

const ROW_LIMIT = 20_000

const RANGES: { value: Range; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
]

// Narrow columns only. The admin page has no code path to item names, people's
// names, or per-person amounts (SEC-27).
const SPLIT_COLUMNS = [
  'owner_id',
  'created_at',
  'archived_at',
  'image_path',
  'currency:data->>currency',
  'total:data->>totalCents',
  'mode:data->>mode',
  'group_id:data->>groupId',
  'item_count:data->>itemCount',
  'people_count:data->>peopleCount',
  'payer_count:data->>payerCount',
  'participants:data->participants',
  'removed_at:data->>removedAt',
  'had_photo:data->>hadPhoto',
].join(',')

const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const pct = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`)
const count = (value: number) => value.toLocaleString('en-US')

function duration(minutes: number): string {
  if (minutes < 90) return `${Math.round(minutes)} min`
  const hours = minutes / 60
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours).toLocaleString('en-US')} hours`
}

/** "13 hours", "4 days", "3 weeks". */
function gapLabel(days: number | null): string {
  if (days === null) return '—'
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24))
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  }
  if (days < 14) {
    const whole = Math.round(days)
    return `${whole} ${whole === 1 ? 'day' : 'days'}`
  }
  return `${Math.round(days / 7)} weeks`
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string }>
}) {
  if (!(await isAdminRequest())) redirect('/admin/login')

  const requested = (await searchParams)?.range
  const range: Range = requested === '7d' || requested === 'all' ? requested : '30d'

  if (!dbConfigured) {
    return (
      <div className={[styles.page, 'shell'].join(' ')}>
        <p className={styles.warning}>The database isn’t configured on this deployment.</p>
      </div>
    )
  }

  let splits: SplitRow[] = []
  let events: EventRow[] = []
  let feedback: Feedback[] = []
  try {
    ;[splits, events, feedback] = await Promise.all([
      selectAll<SplitRow>('splits', ROW_LIMIT, SPLIT_COLUMNS),
      selectAll<EventRow>('events', ROW_LIMIT, 'user_key,name,created_at,props'),
      selectAll<Feedback>('feedback', 50, 'id,category,message,contact,created_at'),
    ])
  } catch {
    return (
      <div className={[styles.page, 'shell'].join(' ')}>
        <p className={styles.warning}>Admin data is temporarily unavailable. Try again in a moment.</p>
      </div>
    )
  }

  const m = computeMetrics({ splits, events, range, now: Date.now() })
  const truncated = splits.length >= ROW_LIMIT || events.length >= ROW_LIMIT
  const users = await Promise.all(m.users.map(async (u) => ({ ...u, id: await opaqueUserId(u.key) })))
  const rangeLabel = RANGES.find((r) => r.value === range)?.label.toLowerCase() ?? ''
  const primaryMoney = m.money[0]

  return (
    <div className={[styles.page, 'shell'].join(' ')}>
      <header className={styles.top}>
        <div>
          <span className={styles.kicker}>🔒 Admin · only you can see this</span>
          <h1 className={styles.title}>How Gauravide is doing</h1>
          <p className={styles.sub}>
            Everything below is {rangeLabel}, counted across everyone. Aggregate numbers only —
            never what anyone bought or who owes whom.
          </p>
        </div>
        <div className={styles.controls}>
          <nav className={styles.tabs} aria-label="Time range">
            {RANGES.map((r) => (
              <Link
                key={r.value}
                href={`/admin?range=${r.value}`}
                aria-current={r.value === range ? 'page' : undefined}
              >
                {r.label}
              </Link>
            ))}
          </nav>
          <Link href="/admin/password" className={styles.ghost}>
            Change password
          </Link>
          <form action="/api/admin/logout" method="post">
            <button type="submit" className={styles.signOut}>
              Sign out of admin
            </button>
          </form>
        </div>
      </header>

      {truncated ? (
        <p className={styles.warning} role="status">
          Reading the most recent {count(ROW_LIMIT)} rows — totals are lower bounds.
        </p>
      ) : null}

      {/* ── The one number that matters ─────────────────────────── */}
      <section className={styles.impact} aria-labelledby="impact-title">
        <span id="impact-title" className={styles.impactKicker}>
          Time you’ve saved people
        </span>
        <strong className={styles.impactValue} data-kpi="time">
          ≈ {duration(m.timeSaved.minutes)}
        </strong>
        <p className={styles.impactText}>
          {m.splitsSent === 0
            ? 'No splits sent in this period yet. Share the link — this number grows with every receipt.'
            : `Across ${count(m.splitsSent)} ${m.splitsSent === 1 ? 'receipt' : 'receipts'} sent to Splitwise, involving ${count(m.peopleHelped)} ${m.peopleHelped === 1 ? 'person' : 'people'} — about ${Math.round(m.timeSaved.minutes / m.splitsSent)} minutes each that nobody spent on arithmetic.`}
        </p>
        {m.timeSaved.perSender !== null ? (
          <p className={styles.impactPer}>
            That’s ≈ {duration(m.timeSaved.perSender)} saved per person who sent a split
            {m.frequency.medianDaysBetweenSplits !== null
              ? `, and people come back to split again about every ${gapLabel(m.frequency.medianDaysBetweenSplits)}`
              : ''}
            .
          </p>
        ) : null}
        <p className={styles.impactNote}>
          Estimate: by hand ≈ {TIME_MODEL.manualBaseMin} min + {TIME_MODEL.perItemMin * 60} s per item +{' '}
          {TIME_MODEL.perPersonMin * 60} s per person; in Gauravide ≈ {TIME_MODEL.appMin} min.
          {m.timeSaved.estimatedSends > 0
            ? ` ${m.timeSaved.estimatedSends} earlier ${m.timeSaved.estimatedSends === 1 ? 'split assumes' : 'splits assume'} ${TIME_MODEL.defaultItems} items and ${TIME_MODEL.defaultPeople} people.`
            : ''}
        </p>
      </section>

      {/* ── 1. People ───────────────────────────────────────────── */}
      <Group
        id="people"
        eyebrow="Who"
        title="People"
        hint="How many are using it, and whether they come back for a second receipt."
      >
        <div className={styles.kpis}>
          <Kpi
            id="people"
            label="People who used it"
            value={count(m.people.total)}
            note={`${count(m.people.accounts)} signed in · ${count(m.people.guests)} signed-out browsers`}
          />
          <Kpi id="new" label="New accounts" value={count(m.people.newAccounts)} note={rangeLabel} />
          <Kpi
            id="weekly-active"
            label="Active this week"
            value={count(m.frequency.weeklyActive)}
            note={`${count(m.frequency.monthlyActive)} active this month`}
          />
          <Kpi
            id="returning"
            label="Came back"
            value={count(m.people.returning)}
            note="sent more than one split"
          />
        </div>

        <section className={styles.panel} aria-labelledby="frequency-title">
          <div className={styles.panelHead}>
            <h3 id="frequency-title">How often they come back</h3>
            <span>Signed-in accounts</span>
          </div>
          <div className={styles.panelBody}>
            <dl className={styles.stats}>
              <div>
                <dt>Come back each week</dt>
                <dd>{pct(m.frequency.stickiness)}</dd>
                <small>weekly ÷ monthly active</small>
              </div>
              <div>
                <dt>Splits per person</dt>
                <dd>
                  {m.frequency.splitsPerSender === null ? '—' : m.frequency.splitsPerSender.toFixed(1)}
                </dd>
                <small>{rangeLabel}</small>
              </div>
              <div>
                <dt>Typical gap between splits</dt>
                <dd>{gapLabel(m.frequency.medianDaysBetweenSplits)}</dd>
                <small>median, per person</small>
              </div>
              <div data-kpi="time-per-person">
                <dt>Time saved per person</dt>
                <dd>{m.timeSaved.perSender === null ? '—' : duration(m.timeSaved.perSender)}</dd>
                <small>{rangeLabel}</small>
              </div>
            </dl>
            <h4 className={styles.subhead}>How many times each account has split</h4>
            <HBars
              rows={[
                { label: 'Once', value: m.frequency.buckets.once },
                { label: '2–3 times', value: m.frequency.buckets.twoToThree },
                { label: '4–9 times', value: m.frequency.buckets.fourToNine },
                { label: '10+ times', value: m.frequency.buckets.tenPlus },
              ]}
            />
          </div>
        </section>
      </Group>

      {/* ── 2. Receipts and money ───────────────────────────────── */}
      <Group
        id="receipts"
        eyebrow="What"
        title="Receipts and money"
        hint="What actually went through the app, and what it was worth."
      >
        <div className={styles.kpis}>
          <Kpi
            id="scanned"
            label="Receipts scanned"
            value={count(m.receiptsScanned)}
            note={`${pct(m.scanToSend)} of scans reached Splitwise`}
          />
          <Kpi
            id="sent"
            label="Splits sent to Splitwise"
            value={count(m.splitsSent)}
            note={`${count(m.splitsEdited)} edited afterwards`}
          />
          <Kpi
            id="money"
            label="Money split"
            value={primaryMoney ? formatMoney(primaryMoney.cents, primaryMoney.currency) : formatMoney(0)}
            note={
              m.money.length > 1
                ? m.money
                    .slice(1)
                    .map((x) => formatMoney(x.cents, x.currency))
                    .join(' · ')
                : m.averageReceipt
                  ? `about ${formatMoney(m.averageReceipt.cents, m.averageReceipt.currency)} per receipt`
                  : 'in saved splits'
            }
          />
          <Kpi
            id="helped"
            label="People in their splits"
            value={count(m.peopleHelped)}
            note={`${count(m.itemsSplit)} items split`}
          />
        </div>

        {m.removedByUsers > 0 ? (
          <p className={styles.groupNote} data-kpi="removed">
            Includes {count(m.removedByUsers)}{' '}
            {m.removedByUsers === 1 ? 'receipt that its owner' : 'receipts whose owners'} later removed
            from their own dashboard, or deleted in Splitwise. The receipt contents are gone; the
            usage still happened, so it is still counted here.
          </p>
        ) : null}

        <section className={styles.panel} aria-labelledby="activity-title">
          <div className={styles.panelHead}>
            <h3 id="activity-title">Day by day</h3>
            <span>Last {m.daily.length} days · UTC</span>
          </div>
          <div className={styles.panelBody}>
            <ActivityChart daily={m.daily} />
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="weekly-title">
          <div className={styles.panelHead}>
            <h3 id="weekly-title">Time saved each week</h3>
            <span>Last 8 weeks · minutes</span>
          </div>
          <div className={styles.panelBody}>
            <WeeklyChart weekly={m.weekly} />
          </div>
        </section>
      </Group>

      {/* ── 3. Quality ──────────────────────────────────────────── */}
      <Group
        id="quality"
        eyebrow="How well"
        title="Quality"
        hint="Which parts people reach for, and whether the reader is doing its job."
      >
        <div className={styles.columns}>
          <section className={styles.panel} aria-labelledby="modes-title">
            <div className={styles.panelHead}>
              <h3 id="modes-title">How people split</h3>
              <span>{count(m.splitsSent)} splits sent</span>
            </div>
            <div className={styles.panelBody}>
              <HBars rows={m.modes.map((mode) => ({ label: mode.label, value: mode.count }))} />
              {m.modesUnknown > 0 ? (
                <p className={styles.footnote}>{m.modesUnknown} earlier splits didn’t record a mode.</p>
              ) : null}
              <dl className={styles.stats}>
                <div>
                  <dt>Several people paid</dt>
                  <dd>{pct(m.habits.severalPayers)}</dd>
                </div>
                <div>
                  <dt>Added to a group</dt>
                  <dd>{pct(m.habits.inGroup)}</dd>
                </div>
                <div>
                  <dt>Uneven item split</dt>
                  <dd>{pct(m.habits.itemSplits)}</dd>
                </div>
                <div>
                  <dt>Kept the photo</dt>
                  <dd>{pct(m.habits.withPhoto)}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="reader-title">
            <div className={styles.panelHead}>
              <h3 id="reader-title">Receipt reader</h3>
              <span>{count(m.reader.gemini + m.reader.backup + m.reader.failed)} attempts</span>
            </div>
            <div className={styles.panelBody}>
              <ReaderRows reader={m.reader} />
              <p className={styles.footnote}>
                The backup reader returns rough text, so those people check every line. Failures
                fall back to typing it in — never a dead end.
              </p>
            </div>
          </section>
        </div>
      </Group>

      {/* ── 4. Details ──────────────────────────────────────────── */}
      <Group
        id="details"
        eyebrow="Detail"
        title="Accounts and feedback"
        hint="One row per signed-in account, under a private label — counts and dates only."
      >
        <section className={styles.panel} aria-labelledby="accounts-title">
          <div className={styles.panelHead}>
            <h3 id="accounts-title">Accounts</h3>
            <span>Most recent 25</span>
          </div>
          {users.length === 0 ? (
            <p className={styles.empty}>No signed-in activity yet.</p>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col">First seen</th>
                    <th scope="col">Last seen</th>
                    <th scope="col" className={styles.numCol}>
                      Receipts scanned
                    </th>
                    <th scope="col" className={styles.numCol}>
                      Splits sent
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <code>{u.id}</code>
                      </td>
                      <td>{dateFormat.format(new Date(u.firstSeen))}</td>
                      <td>{dateFormat.format(new Date(u.lastSeen))}</td>
                      <td className={styles.numCol}>{count(u.receipts)}</td>
                      <td className={styles.numCol}>{count(u.splits)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="feedback-title">
          <div className={styles.panelHead}>
            <h3 id="feedback-title">Feedback inbox</h3>
            <span>{feedback.length} latest · sent to you on purpose</span>
          </div>
          {/* Every message is saved here whatever happens to email. This line
              only says whether one also lands in an inbox — so a silent inbox
              is never mistaken for silence from users. */}
          <p className={emailConfigured() ? styles.empty : styles.emailOff}>
            {emailConfigured()
              ? `Email alerts are on — each new message is also sent to ${maskEmail(adminEmail())}.`
              : 'Email alerts are off, so new feedback only appears here. Set RESEND_API_KEY (and ADMIN_EMAIL) to be emailed each time.'}
          </p>
          <TestEmailButton />
          <div className={styles.feedback}>
            {feedback.length === 0 ? <p className={styles.empty}>No feedback yet.</p> : null}
            {feedback.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.category}</strong>
                  <span>{dateFormat.format(new Date(item.created_at))}</span>
                </div>
                <p>{item.message}</p>
                {item.contact ? <small>Reply address: {item.contact}</small> : null}
              </article>
            ))}
          </div>
        </section>
      </Group>
    </div>
  )
}

/** A labelled band of the page, so the numbers are read in groups, not as a wall. */
function Group({
  id,
  eyebrow,
  title,
  hint,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <section className={styles.group} aria-labelledby={`${id}-group`}>
      <header className={styles.groupHead}>
        <span className={styles.groupEyebrow}>{eyebrow}</span>
        <h2 id={`${id}-group`} className={styles.groupTitle}>
          {title}
        </h2>
        <p className={styles.groupHint}>{hint}</p>
      </header>
      {children}
    </section>
  )
}

function Kpi({ id, label, value, note }: { id: string; label: string; value: string; note: string }) {
  return (
    <div className={styles.kpi} data-kpi={id}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  )
}

/** Round up to 1, 2 or 5 × 10ⁿ so gridlines land on readable numbers. */
function niceMax(value: number): number {
  const exponent = 10 ** Math.floor(Math.log10(Math.max(1, value)))
  const fraction = value / exponent
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * exponent
}

/**
 * Two series on one axis (both are counts), thin paired bars, a legend, and a
 * table view for anyone who can't use the chart. Hover shows the day's numbers.
 */
function ActivityChart({ daily }: { daily: Metrics['daily'] }) {
  const top = niceMax(Math.max(1, ...daily.flatMap((d) => [d.scanned, d.sent])))
  const gridValues = top >= 2 ? [top, top / 2, 0] : [top, 0]
  const labelEvery = daily.length > 10 ? 7 : 1
  const height = (value: number) => (value > 0 ? `max(3px, ${(value / top) * 100}%)` : '0')
  const label = (date: string) => dayFormat.format(new Date(date + 'T00:00:00Z'))
  const totals = daily.reduce((a, d) => ({ scanned: a.scanned + d.scanned, sent: a.sent + d.sent }), {
    scanned: 0,
    sent: 0,
  })

  return (
    <figure className={styles.chart}>
      <div className={styles.legend}>
        <span>
          <i className={[styles.swatch, styles.scanned].join(' ')} aria-hidden="true" />
          Receipts scanned <b>{totals.scanned}</b>
        </span>
        <span>
          <i className={[styles.swatch, styles.sent].join(' ')} aria-hidden="true" />
          Sent to Splitwise <b>{totals.sent}</b>
        </span>
      </div>
      <div className={styles.plot} aria-hidden="true">
        <div className={styles.gridLines}>
          {gridValues.map((v) => (
            <span key={v}>
              <em>{v}</em>
            </span>
          ))}
        </div>
        <div className={styles.bars} style={{ ['--days' as string]: daily.length } as CSSProperties}>
          {daily.map((d, i) => (
            <div key={d.date} className={styles.day}>
              <span className={[styles.bar, styles.scanned].join(' ')} style={{ height: height(d.scanned) }} />
              <span className={[styles.bar, styles.sent].join(' ')} style={{ height: height(d.sent) }} />
              <span className={styles.tip}>
                {label(d.date)} · {d.scanned} scanned · {d.sent} sent
              </span>
              {/* Regular ticks stop short of the end so they never collide with the last date. */}
              {(i % labelEvery === 0 && i < daily.length - 3) || i === daily.length - 1 ? (
                <span className={styles.tick}>{label(d.date)}</span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <details className={styles.tableView}>
        <summary>Show as a table</summary>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col" className={styles.numCol}>
                  Receipts scanned
                </th>
                <th scope="col" className={styles.numCol}>
                  Sent to Splitwise
                </th>
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.date}>
                  <td>{label(d.date)}</td>
                  <td className={styles.numCol}>{d.scanned}</td>
                  <td className={styles.numCol}>{d.sent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}

/** One series (minutes saved), so one hue and no legend; hover and a table for exact values. */
function WeeklyChart({ weekly }: { weekly: Metrics['weekly'] }) {
  const top = niceMax(Math.max(1, ...weekly.map((w) => w.minutes)))
  const gridValues = top >= 2 ? [top, top / 2, 0] : [top, 0]
  const label = (date: string) => dayFormat.format(new Date(date + 'T00:00:00Z'))
  const height = (value: number) => (value > 0 ? `max(3px, ${(value / top) * 100}%)` : '0')

  return (
    <figure className={styles.chart}>
      <div className={styles.plot} aria-hidden="true">
        <div className={styles.gridLines}>
          {gridValues.map((v) => (
            <span key={v}>
              <em>{Number.isInteger(v) ? v : v.toFixed(1)}</em>
            </span>
          ))}
        </div>
        <div className={styles.bars} style={{ ['--days' as string]: weekly.length } as CSSProperties}>
          {weekly.map((w, i) => (
            <div key={w.weekStart} className={[styles.day, styles.week].join(' ')}>
              <span className={[styles.bar, styles.saved].join(' ')} style={{ height: height(w.minutes) }} />
              <span className={styles.tip}>
                Week of {label(w.weekStart)} · {w.splits} {w.splits === 1 ? 'split' : 'splits'} ·{' '}
                {duration(w.minutes)} saved
              </span>
              {i % 2 === 1 || weekly.length <= 4 ? <span className={styles.tick}>{label(w.weekStart)}</span> : null}
            </div>
          ))}
        </div>
      </div>
      <details className={styles.tableView}>
        <summary>Show weeks as a table</summary>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Week of</th>
                <th scope="col" className={styles.numCol}>
                  Splits
                </th>
                <th scope="col" className={styles.numCol}>
                  Time saved
                </th>
              </tr>
            </thead>
            <tbody>
              {[...weekly].reverse().map((w) => (
                <tr key={w.weekStart}>
                  <td>{label(w.weekStart)}</td>
                  <td className={styles.numCol}>{w.splits}</td>
                  <td className={styles.numCol}>{duration(w.minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}

/** One series: a single hue, direct labels, no legend needed. */
function HBars({ rows }: { rows: { label: string; value: number }[] }) {
  const total = rows.reduce((a, r) => a + r.value, 0)
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className={styles.hbars}>
      {rows.map((row) => (
        <li key={row.label}>
          <span className={styles.hLabel}>{row.label}</span>
          <span className={styles.hTrack} aria-hidden="true">
            <span className={styles.hFill} style={{ width: row.value ? `max(4px, ${(row.value / max) * 100}%)` : 0 }} />
          </span>
          <span className={styles.hValue}>
            {row.value} <small>{total ? pct(row.value / total) : '—'}</small>
          </span>
        </li>
      ))}
    </ul>
  )
}

function ReaderRows({ reader }: { reader: Metrics['reader'] }) {
  const total = reader.gemini + reader.backup + reader.failed
  const rows = [
    { key: 'good', icon: '✓', label: 'Read automatically', value: reader.gemini },
    { key: 'warn', icon: '!', label: 'Backup reader — lines checked by hand', value: reader.backup },
    { key: 'bad', icon: '✕', label: 'Couldn’t read — typed in instead', value: reader.failed },
  ] as const
  return (
    <ul className={styles.reader}>
      {rows.map((row) => (
        <li key={row.key} data-tone={row.key}>
          <span className={styles.readerIcon} aria-hidden="true">
            {row.icon}
          </span>
          <span className={styles.hLabel}>{row.label}</span>
          <span className={styles.hValue}>
            {row.value} <small>{total ? pct(row.value / total) : '—'}</small>
          </span>
        </li>
      ))}
    </ul>
  )
}
