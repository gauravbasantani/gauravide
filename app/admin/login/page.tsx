import Link from 'next/link'
import { redirect } from 'next/navigation'
import { adminSignInAvailable, isAdminRequest } from '@/lib/adminAuth'
import { AdminLoginForm } from './AdminLoginForm'
import styles from './login.module.css'

export const metadata = {
  title: 'Admin sign in · Gauravide',
  robots: { index: false, follow: false },
}

export default async function AdminLoginPage() {
  if (await isAdminRequest()) redirect('/admin')
  const available = await adminSignInAvailable()

  return (
    <div className={[styles.page, 'shell'].join(' ')}>
      <section className={styles.card} aria-labelledby="admin-login-title">
        <span className={styles.lock} aria-hidden="true">
          🔒
        </span>
        <h1 id="admin-login-title" className={styles.title}>
          Admin dashboard
        </h1>
        <p className={styles.lead}>
          Sign in to see how Gauravide is being used — people, receipts, money split and time
          saved. Only aggregate numbers, never anyone’s receipts.
        </p>

        {available ? (
          <>
            <AdminLoginForm />
            <p className={styles.alt}>
              <Link href="/admin/forgot">Forgot your password?</Link>
            </p>
          </>
        ) : (
          <div className={styles.notice} role="status">
            <strong>Admin sign-in isn’t switched on for this site yet.</strong>
          </div>
        )}
      </section>
    </div>
  )
}
