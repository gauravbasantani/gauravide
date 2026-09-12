import Link from 'next/link'
import { getSession } from '@/lib/session'
import { splitwiseConfigured } from '@/lib/splitwise'
import styles from './page.module.css'

/* The sample is the real Costco receipt from tests/fixtures — the numbers on
   the landing page are ones the engine actually produces. */
const SAMPLE = [
  { initials: 'G', name: 'Gaurav', amount: '$58.57', colour: 'var(--person-1)' },
  { initials: 'A', name: 'Alex', amount: '$49.93', colour: 'var(--person-2)' },
]

const STEPS = [
  { n: 1, title: 'Snap', body: 'Photograph the receipt, or upload a PDF.' },
  { n: 2, title: 'Check', body: 'Every line is read out and editable. Nothing is guessed.' },
  { n: 3, title: 'Tap who', body: 'Assign items by tapping faces. Totals update as you go.' },
  { n: 4, title: 'Done', body: 'One tap sends it to Splitwise, split to the cent.' },
]

export default async function Home() {
  const session = await getSession()
  const signedIn = Boolean(session.accessToken)

  return (
    <div className="shell">
      <section className={styles.hero}>
        <span className={styles.eyebrow}>Gaurav + divide</span>
        <h1 className={styles.title}>
          Split a receipt in <span className={styles.accent}>30 seconds</span>.
        </h1>
        <p className={styles.tagline}>
          Snap a photo, tap who shares what, and it lands in Splitwise — with tax and tip split
          by who actually bought what.
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

        <p className={styles.privacy}>
          Photos are stripped of location data before they leave your device.
        </p>
      </section>

      <section className={styles.steps} aria-label="How it works">
        {STEPS.map((s) => (
          <div key={s.n} className={styles.step}>
            <span className={styles.stepNum} aria-hidden="true">
              {s.n}
            </span>
            <span className={styles.stepTitle}>{s.title}</span>
            <p className={styles.stepBody}>{s.body}</p>
          </div>
        ))}
      </section>

      <section className={styles.sample}>
        <div className={styles.sampleCard}>
          <div className={styles.sampleHead}>
            <div>
              <div style={{ fontWeight: 600 }}>Costco Wholesale</div>
              <div className="t-caption">4 Sep · 8 items</div>
            </div>
            <span className={styles.sampleTotal}>$108.50</span>
          </div>

          <div className={styles.sampleRow}>
            <span className={styles.sampleName}>Flashlight</span>
            <span className={styles.chip}>Tax A</span>
            <span className={styles.sampleAmount}>$26.99</span>
          </div>
          <div className={styles.sampleRow}>
            <span className={styles.sampleName}>Water, 40 pack</span>
            <span className={styles.chip}>Tax E</span>
            <span className={styles.sampleAmount}>$3.99</span>
          </div>
          <div className={styles.sampleRow}>
            <span className={styles.sampleName}>Instant savings</span>
            <span className={styles.sampleAmount} style={{ color: 'var(--text-muted)' }}>
              −$3.00
            </span>
          </div>

          {SAMPLE.map((p) => (
            <div key={p.name} className={styles.sampleRow}>
              <span className={styles.dot} style={{ background: p.colour }} aria-hidden="true">
                {p.initials}
              </span>
              <span className={styles.sampleName}>{p.name}</span>
              <span className={styles.sampleAmount}>{p.amount}</span>
            </div>
          ))}
        </div>

        <div className={styles.sampleNote}>
          <h2>Tax split by who bought what</h2>
          <p>
            That Costco receipt charges 8.1% on the flashlight and 1.8% on the water. Most
            splitters spread tax evenly and quietly overcharge whoever bought groceries.
          </p>
          <p>
            Gauravide reads the tax code printed beside each line and charges it to the right
            person — a 70&thinsp;¢ difference on this receipt alone.
          </p>
          <span className={styles.check}>✓ Every split reconciles to the cent</span>
        </div>
      </section>
    </div>
  )
}
