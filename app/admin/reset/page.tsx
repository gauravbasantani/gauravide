import Link from 'next/link'
import { PASSWORD_MIN } from '@/lib/adminAuth'
import { ResetForm } from './ResetForm'
import styles from '../login/login.module.css'

export const metadata = {
  title: 'Choose a new admin password · Gauravide',
  robots: { index: false, follow: false },
}

export default async function AdminResetPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }>
}) {
  const token = (await searchParams)?.token ?? ''

  return (
    <div className={[styles.page, 'shell'].join(' ')}>
      <section className={styles.card} aria-labelledby="reset-title">
        <span className={styles.lock} aria-hidden="true">
          🔑
        </span>
        <h1 id="reset-title" className={styles.title}>
          Choose a new password
        </h1>
        {token ? (
          <>
            <p className={styles.lead}>
              At least {PASSWORD_MIN} characters. You’ll be signed in straight away, and this link
              stops working.
            </p>
            <ResetForm token={token} />
          </>
        ) : (
          <>
            <p className={styles.lead}>
              This page needs the link from your reset email. Ask for a new one if you don’t have it.
            </p>
            <p className={styles.alt}>
              <Link href="/admin/forgot">Send a reset link</Link>
            </p>
          </>
        )}
      </section>
    </div>
  )
}
