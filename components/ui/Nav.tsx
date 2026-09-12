import Link from 'next/link'
import Image from 'next/image'
import { getSession } from '@/lib/session'
import { hasAdminSession, isAdminRequest } from '@/lib/adminAuth'
import { splitwiseConfigured } from '@/lib/splitwise'
import styles from './Nav.module.css'

export async function Nav() {
  const session = await getSession()
  const signedIn = Boolean(session.accessToken)
  const showAdmin = await isAdminRequest()
  // Two different sessions can exist at once. Name the admin one, so the
  // navbar's Splitwise "Sign in" never reads as a contradiction next to the
  // admin dashboard's "Sign out of admin".
  const adminSession = await hasAdminSession()

  return (
    <header className={styles.nav}>
      <nav className={styles.inner} aria-label="Main">
        <Link href="/" className={styles.brand}>
          <Image
            className={styles.mark}
            src="/gauravide-mark.png"
            alt=""
            width={34}
            height={34}
            priority
          />
          <span className={styles.wordmark}>
            Gaurav<span className={styles.wordmarkAccent}>ide</span>
          </span>
        </Link>

        <span className={styles.spacer} />

        <Link href="/new" className={[styles.link, styles.hideSmall].join(' ')}>
          New receipt
        </Link>
        {signedIn ? (
          <Link href="/" className={[styles.link, styles.hideSmall].join(' ')}>
            Your splits
          </Link>
        ) : null}
        {/* The badge below already links to /admin during an admin session. */}
        {showAdmin && !adminSession ? (
          <Link href="/admin" className={[styles.link, styles.hideSmall].join(' ')}>
            Admin
          </Link>
        ) : null}
        <Link href="/faq" className={[styles.link, styles.hideSmall].join(' ')}>
          FAQ
        </Link>

        {adminSession ? (
          <Link href="/admin" className={styles.adminBadge}>
            <span aria-hidden="true">🔒</span>
            Admin
          </Link>
        ) : null}

        {signedIn ? (
          <>
            <span className={styles.account}>
              <span className={styles.avatar} aria-hidden="true">
                ✓
              </span>
              Splitwise
            </span>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className={styles.signOut}>
                Sign out
              </button>
            </form>
          </>
        ) : splitwiseConfigured() ? (
          <a href="/api/auth/login?next=/new" className={styles.signIn}>
            Sign in
          </a>
        ) : null}
      </nav>
    </header>
  )
}
