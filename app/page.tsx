import Link from 'next/link'
import { getSession } from '@/lib/session'
import { splitwiseConfigured } from '@/lib/splitwise'
import { Footer } from '@/components/ui/Footer'
import styles from './page.module.css'

export default async function Home() {
  const session = await getSession()
  const signedIn = Boolean(session.accessToken)
  return (
    <div className="shell">
      <div className={styles.hero}>
        <h1 className="t-title">Gauravide</h1>
        <p className={styles.tagline}>
          Split a receipt in 30 seconds. Snap a photo, tap who shares what, and it lands in
          Splitwise.
        </p>
        <p className={styles.privacy}>Your splits are saved to your account, private to you.</p>
      </div>

      <div className={styles.actions}>
        <Link href="/new" className={styles.ctaLink}>
          ⊕ Split a receipt
        </Link>
        {!signedIn && splitwiseConfigured() ? (
          <a href="/api/auth/login?next=/new" className={styles.secondaryLink}>
            Sign in with Splitwise
          </a>
        ) : null}
        {signedIn ? (
          <form action="/api/auth/logout" method="post">
            <button type="submit" className={styles.secondaryLink}>
              Sign out
            </button>
          </form>
        ) : null}
      </div>

      {signedIn ? (
        <p className={styles.signed}>✓ Signed in to Splitwise — expenses push in one tap.</p>
      ) : null}

      <Footer />
    </div>
  )
}
