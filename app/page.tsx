import Link from 'next/link'
import { getSession } from '@/lib/session'
import { splitwiseConfigured } from '@/lib/splitwise'
import styles from './page.module.css'

/* Every number below comes from the real Costco receipt in tests/fixtures —
   figures the engine actually produces, not marketing invention. */
const PREVIEW_ROWS = [
  { name: 'KS Towel', price: '$20.79', flag: 'A', on: [0] },
  { name: 'Flashlight', price: '$26.99', flag: 'A', on: [0] },
  { name: 'Harvest Snaps', price: '$8.59', flag: 'E', on: [0, 1] },
  { name: 'Instant savings', price: '−$3.00', flag: 'E', on: [0, 1] },
  { name: 'Water, 40 pack', price: '$3.99', flag: 'E', on: [0, 1] },
]

const PEOPLE = [
  { initials: 'G', amount: '$58.57', colour: 'var(--person-1)' },
  { initials: 'A', amount: '$49.93', colour: 'var(--person-2)' },
]

const FEATURES = [
  {
    icon: '🏷️',
    title: 'Tax, charged to the right person',
    body: 'Receipts print a code beside each line marking its rate. Gauravide reads them, so whoever bought the taxed item pays its tax — not everyone equally.',
  },
  {
    icon: '🎯',
    title: 'Always adds up',
    body: 'Money is handled in whole cents and shares are distributed to the penny. If a split doesn’t reconcile against the receipt, it won’t be submitted.',
  },
  {
    icon: '🔒',
    title: 'Location data never leaves',
    body: 'Photos embed GPS. Yours is stripped in the browser before anything uploads, so nobody learns where you shop.',
  },
]

const STEPS = [
  { n: '01', title: 'Snap', body: 'Photograph the receipt, or upload an image or PDF.' },
  { n: '02', title: 'Check', body: 'Every line read back, editable. Uncertain ones flagged.' },
  { n: '03', title: 'Tap who', body: 'Assign by tapping faces. Totals move as you go.' },
  { n: '04', title: 'Done', body: 'One tap sends it to Splitwise, split exactly.' },
]

export default async function Home() {
  const session = await getSession()
  const signedIn = Boolean(session.accessToken)

  return (
    <div className="shell">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className={styles.hero}>
        <span className={styles.glow} aria-hidden="true" />
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowDot} aria-hidden="true" />
          Gaurav + divide
        </span>

        <h1 className={styles.title}>
          Split a receipt in <span className={styles.accent}>30 seconds</span>
        </h1>

        <p className={styles.tagline}>
          Snap a photo, tap who shared what, and the itemised expense lands in Splitwise — with
          tax split by who actually bought what.
        </p>

        <div className={styles.actions}>
          <Link href="/new" className={styles.ctaLink}>
            Split a receipt
          </Link>
          {!signedIn && splitwiseConfigured() ? (
            <a href="/api/auth/login?next=/new" className={styles.secondaryLink}>
              Sign in with Splitwise
            </a>
          ) : null}
        </div>

        {signedIn ? (
          <p className={styles.signed}>✓ Signed in — expenses push in one tap.</p>
        ) : null}

        <p className={styles.meta}>
          <span className={styles.metaItem}>Free, always</span>
          <span className={styles.metaItem}>No app to install</span>
          <span className={styles.metaItem}>Your password never leaves Splitwise</span>
        </p>
      </section>

      {/* ── Product preview ──────────────────────────────── */}
      <section className={styles.section} aria-labelledby="preview-title">
        <div className={styles.previewWrap}>
          <div className={styles.sectionHead} style={{ marginBottom: 0 }}>
            <h2 id="preview-title" className={styles.sectionTitle}>
              The bit that usually causes arguments
            </h2>
            <p className={styles.sectionBody}>
              This Costco receipt charges <strong>8.1%</strong> on the flashlight and{' '}
              <strong>1.8%</strong> on the water. Split tax evenly and you quietly overcharge
              whoever bought groceries.
            </p>
            <p className={styles.sectionBody}>
              Gauravide reads the code beside each line and charges tax to the right person — a
              70&thinsp;¢ swing on this receipt alone.
            </p>
          </div>

          <div className={styles.phone}>
            <div className={styles.phoneBar}>
              <span>Costco Wholesale</span>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>$108.50</span>
            </div>

            {PREVIEW_ROWS.map((row) => (
              <div key={row.name} className={styles.phoneRow}>
                <span className={styles.rowName}>{row.name}</span>
                <span className={styles.chip}>{row.flag}</span>
                <span
                  className={styles.rowPrice}
                  style={row.price.startsWith('−') ? { color: 'var(--text-muted)' } : undefined}
                >
                  {row.price}
                </span>
                <span className={styles.avatars} aria-hidden="true">
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

            <div className={styles.phoneTotals}>
              {PEOPLE.map((p) => (
                <span key={p.initials} className={styles.runner}>
                  <span style={{ color: 'var(--text-muted)' }}>{p.initials}</span>
                  <span className={styles.runnerAmt}>{p.amount}</span>
                </span>
              ))}
              <span style={{ marginLeft: 'auto', color: 'var(--success-text)', fontWeight: 600 }}>
                ✓ exact
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Steps ────────────────────────────────────────── */}
      <section className={styles.section} aria-labelledby="steps-title">
        <div className={styles.sectionHead}>
          <h2 id="steps-title" className={styles.sectionTitle}>
            Four taps, start to finish
          </h2>
          <p className={styles.sectionBody}>
            No menus, no settings, no dashboard to learn.
          </p>
        </div>
        <div className={styles.steps}>
          {STEPS.map((s) => (
            <div key={s.n} className={styles.step}>
              <span className={styles.stepNum}>{s.n}</span>
              <span className={styles.stepTitle}>{s.title}</span>
              <p className={styles.stepBody}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────── */}
      <section className={styles.section} aria-labelledby="features-title">
        <div className={styles.sectionHead}>
          <h2 id="features-title" className={styles.sectionTitle}>
            Built for money, not for demos
          </h2>
        </div>
        <div className={styles.features}>
          {FEATURES.map((f) => (
            <div key={f.title} className={styles.feature}>
              <span className={styles.featureIcon} aria-hidden="true">
                {f.icon}
              </span>
              <h3 className={styles.featureTitle}>{f.title}</h3>
              <p className={styles.featureBody}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Closing ──────────────────────────────────────── */}
      <section className={styles.closing}>
        <h2 className={styles.closingTitle}>Got a receipt on you?</h2>
        <p className={styles.closingBody}>
          Takes about thirty seconds, and you never have to do the arithmetic.
        </p>
        <Link href="/new" className={styles.ctaLink}>
          Split it now
        </Link>
      </section>
    </div>
  )
}
