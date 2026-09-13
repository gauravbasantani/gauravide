import Link from 'next/link'
import { getSession } from '@/lib/session'
import { splitwiseConfigured } from '@/lib/splitwise'
import { dbConfigured, selectOwned } from '@/lib/db'
import { ownerId } from '@/lib/session'
import { NOT_REMOVED, type StoredSplit } from '@/lib/history'
import { Dashboard } from '@/components/dashboard/Dashboard'
import styles from './page.module.css'

/* Every number below comes from the real Costco receipt in tests/fixtures.
   These are figures the engine actually produces, not marketing invention. */
const PREVIEW_ROWS = [
  { name: 'KS Towel', price: '$20.79', flag: 'A', on: [0] },
  { name: 'Flashlight', price: '$26.99', flag: 'A', on: [0] },
  { name: 'Harvest Snaps', price: '$8.59', flag: 'E', on: [0, 1] },
  { name: 'Instant savings', price: '−$3.00', flag: 'E', on: [0, 1] },
  { name: 'Water, 40 pack', price: '$3.99', flag: 'E', on: [0, 1] },
]

const PEOPLE = [
  { initials: 'G', name: 'Gaurav', amount: '$58.57', colour: 'var(--person-1)' },
  { initials: 'A', name: 'Alex', amount: '$49.93', colour: 'var(--person-2)' },
]

const STEPS = [
  {
    n: '1',
    title: 'Add the receipt',
    body: 'Take a photo, upload a photo or PDF from Walmart, Safeway or anywhere else, or type the items in.',
  },
  { n: '2', title: 'Check it', body: 'Every line is read back for you to fix. Unclear ones are flagged.' },
  { n: '3', title: 'Split it', body: 'Tap who had what. Or split equally, by shares, or by exact amounts.' },
  {
    n: '4',
    title: 'Connect and send',
    body: 'Sign in to Splitwise, pick who paid, and one tap adds the expense, right to the cent.',
  },
]

const CASES = [
  {
    icon: '🧾',
    title: 'By item',
    body: 'Tap faces on each line. Shared starters split between whoever had them.',
  },
  {
    icon: '🍅',
    title: 'Four bags of tomatoes',
    body: 'Break a quantity line into units. Two bags for A and B, one each for C and D.',
  },
  {
    icon: '＝',
    title: 'Equally, by shares, or exact',
    body: 'The same choices Splitwise gives you, for when listing every item is not worth it.',
  },
  {
    icon: '👥',
    title: 'Two people paid',
    body: 'Card for most, cash for the rest? Enter what each person put in and the balances come out right.',
  },
  {
    icon: '🤝',
    title: 'A friend’s receipt',
    body: 'Log a bill someone else paid, even one you weren’t part of.',
  },
  {
    icon: '🏷️',
    title: 'Tax to the right person',
    body: 'Receipt tax codes are read, so whoever bought the taxed item pays its tax.',
  },
]

const TRUST = [
  {
    title: 'Free, no Pro needed',
    body: 'You need a normal free Splitwise account. The Pro subscription their API requires is the developer’s problem, not yours.',
  },
  { title: 'Always adds up', body: 'Whole cents only. If it doesn’t match the receipt, it isn’t sent.' },
  { title: 'Location stripped', body: 'Photo GPS is removed before upload, so nobody learns where you shop.' },
  { title: 'Private history', body: 'Your saved splits and receipt photos are visible to your Splitwise account only.' },
]

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ auth_error?: string | string[] }>
}) {
  const session = await getSession()
  const signedIn = Boolean(session.accessToken)
  const authError = (await searchParams)?.auth_error
  const authErrorCode = Array.isArray(authError) ? authError[0] : authError

  if (signedIn) {
    let splits: StoredSplit[] = []
    let unavailable = false
    if (dbConfigured) {
      try {
        splits = await selectOwned<StoredSplit>('splits', ownerId(session), 50, NOT_REMOVED)
      } catch {
        unavailable = true
      }
    }
    return <Dashboard splits={splits} unavailable={unavailable} />
  }

  return (
    <div className={styles.home}>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className={[styles.hero, 'shell'].join(' ')}>
        <span className={styles.rays} aria-hidden="true" />
        <span className="aurora" aria-hidden="true" />
        <span className={[styles.pill, 'rise'].join(' ')}>
          <span className={styles.pillDot} aria-hidden="true" />
          Works with your Splitwise account
        </span>

        <h1 className={[styles.title, 'rise', 'rise-1'].join(' ')}>
          Split any receipt
          <br />
          in <span className={styles.accent}>30 seconds</span>
        </h1>

        <p className={[styles.tagline, 'rise', 'rise-2'].join(' ')}>
          No spreadsheet. No calculator. Add a photo or PDF of any receipt from Walmart, Safeway,
          a restaurant, anywhere, or type it in yourself. Tap who had what. It lands in Splitwise as
          an exact expense, item by item, tax and all.
        </p>

        <div className={[styles.actions, 'rise', 'rise-3'].join(' ')}>
          <Link href="/new" className={styles.ctaLink}>
            Split a receipt →
          </Link>
          {splitwiseConfigured() ? (
            <a href="/api/auth/login?next=/new" className={styles.secondaryLink}>
              Sign in with Splitwise
            </a>
          ) : null}
        </div>

        {authErrorCode ? (
          <div className={styles.authNotice} role="alert">
            <strong>Splitwise couldn’t connect.</strong>
            <span>
              {authErrorCode === 'not_configured'
                ? 'Sign-in is not configured on this deployment yet.'
                : authErrorCode === 'declined'
                  ? 'No changes were made. You can try again whenever you’re ready.'
                  : 'The connection expired or was declined. Your receipt work is still safe on this device.'}
            </span>
            {splitwiseConfigured() ? (
              <a href="/api/auth/login?next=/new" className={styles.authRetry}>
                Try Splitwise again
              </a>
            ) : null}
          </div>
        ) : null}

        <p className={styles.meta}>
          <span>Free, no Splitwise Pro needed</span>
          <span aria-hidden="true">·</span>
          <span>No app to install</span>
          <span aria-hidden="true">·</span>
          <span>No spreadsheet</span>
          <span aria-hidden="true">·</span>
          <span>Your password never leaves Splitwise</span>
        </p>

        {/* ── Product mockup ─────────────────────────────── */}
        <div className={[styles.mockup, 'rise', 'rise-4'].join(' ')} role="img" aria-label="Example: a Costco receipt split between Gaurav and Alex, tax matched to each item">
          <div className={styles.window}>
            <div className={styles.windowBar} aria-hidden="true">
              <span />
              <span />
              <span />
              <em>Costco Wholesale · $108.50</em>
            </div>
            <div className={styles.windowBody}>
              <div className={styles.lines}>
                {PREVIEW_ROWS.map((row) => (
                  <div key={row.name} className={styles.line}>
                    <span className={styles.lineName}>{row.name}</span>
                    <span className={styles.chip}>Tax {row.flag}</span>
                    <span
                      className={[styles.linePrice, row.price.startsWith('−') ? styles.discount : '']
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {row.price}
                    </span>
                    <span className={styles.avatars}>
                      {PEOPLE.map((p, i) => (
                        <span
                          key={p.initials}
                          className={[styles.av, row.on.includes(i) ? '' : styles.avOff]
                            .filter(Boolean)
                            .join(' ')}
                          style={row.on.includes(i) ? { background: p.colour } : undefined}
                        >
                          {p.initials}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
              <div className={styles.settle}>
                <span className={styles.settleLabel}>How it settles</span>
                {PEOPLE.map((p, i) => (
                  <div key={p.name} className={styles.settleRow}>
                    <span className={styles.av} style={{ background: p.colour }}>
                      {p.initials}
                    </span>
                    <span className={styles.settleName}>
                      {p.name}
                      <small>{i === 0 ? 'paid $108.50' : 'share'}</small>
                    </span>
                    <span className={styles.settleAmount}>{p.amount}</span>
                  </div>
                ))}
                <div className={styles.settleFoot}>
                  <span>Alex owes Gaurav</span>
                  <strong>$49.93</strong>
                </div>
                <span className={styles.exact}>✓ Matches receipt to the cent</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* A wave carries the eye from the hero into the steps. */}
      <svg className={styles.wave} viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M0 64c120-34 240-51 360-38s240 56 360 62 240-26 360-49 240-30 360-21v102H0Z"
          fill="var(--surface)"
        />
      </svg>

      {/* ── How it works ──────────────────────────────────── */}
      <section className={[styles.section, styles.onSurface, 'shell'].join(' ')} aria-labelledby="steps-title">
        <div className={styles.sectionHead}>
          <span className={styles.kicker}>How it works</span>
          <h2 id="steps-title" className={styles.sectionTitle}>
            Four steps, start to finish
          </h2>
        </div>
        <ol className={styles.steps}>
          {STEPS.map((s) => (
            <li key={s.n} className={[styles.step, 'lift'].join(' ')}>
              <span className={styles.stepNum} aria-hidden="true">
                {s.n}
              </span>
              <h3 className={styles.stepTitle}>{s.title}</h3>
              <p className={styles.stepBody}>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Real-life cases ───────────────────────────────── */}
      <section className={[styles.section, 'shell'].join(' ')} aria-labelledby="cases-title">
        <div className={styles.sectionHead}>
          <span className={styles.kicker}>Built for real bills</span>
          <h2 id="cases-title" className={styles.sectionTitle}>
            Every way a receipt actually gets split
          </h2>
          <p className={styles.sectionBody}>
            Dinner, groceries, a fuel stop on a road trip. The messy ones are the point.
          </p>
        </div>
        <div className={styles.cases}>
          {CASES.map((c) => (
            <article key={c.title} className={[styles.case, 'lift'].join(' ')}>
              <span className={styles.caseIcon} aria-hidden="true">
                {c.icon}
              </span>
              <h3 className={styles.caseTitle}>{c.title}</h3>
              <p className={styles.caseBody}>{c.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Trust ─────────────────────────────────────────── */}
      <section className={[styles.section, 'shell'].join(' ')} aria-label="Accuracy and privacy">
        <div className={styles.trust}>
          {TRUST.map((t) => (
            <div key={t.title} className={styles.trustItem}>
              <strong>✓ {t.title}</strong>
              <span>{t.body}</span>
            </div>
          ))}
        </div>
        {splitwiseConfigured() ? (
          <p className={styles.permissionNote}>
            Splitwise may show a broad account access notice, because its API has one approval
            instead of separate permission switches. Gauravide only acts when you tap: loading your
            friends and groups, adding the expense you confirm, and, if you ask for it, inviting a
            person, creating or updating a group, or deleting an expense.
          </p>
        ) : null}
      </section>

      {/* ── Closing ──────────────────────────────────────── */}
      <section className="shell">
        <div className={styles.closing}>
          <span className={styles.rays} aria-hidden="true" />
          <h2 className={styles.closingTitle}>Got a receipt on you?</h2>
          <p className={styles.closingBody}>
            Takes about thirty seconds, and you never do the arithmetic.
          </p>
          <Link href="/new" className={styles.ctaLink}>
            Split it now →
          </Link>
        </div>
      </section>
    </div>
  )
}
