import Link from 'next/link'
import { getSession } from '@/lib/session'
import { isAdmin } from '@/lib/admin'
import { ownerId } from '@/lib/session'
import { splitwiseConfigured } from '@/lib/splitwise'
import styles from './Nav.module.css'

export async function Nav() {
  const session = await getSession()
  const signedIn = Boolean(session.accessToken)

  return (
    <header className={styles.nav}>
      <nav className={styles.inner} aria-label="Main">
        <Link href="/" className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            G
          </span>
          Gauravide
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
        {signedIn && isAdmin(ownerId(session)) ? (
          <Link href="/admin" className={[styles.link, styles.hideSmall].join(' ')}>
            Admin
          </Link>
        ) : null}
        <Link href="/faq" className={[styles.link, styles.hideSmall].join(' ')}>
          FAQ
        </Link>

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
