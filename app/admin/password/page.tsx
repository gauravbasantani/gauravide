import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAdminRequest, PASSWORD_MIN } from '@/lib/adminAuth'
import { ChangePasswordForm } from './ChangePasswordForm'
import styles from '../login/login.module.css'

export const metadata = {
  title: 'Change admin password · Gauravide',
  robots: { index: false, follow: false },
}

export default async function AdminPasswordPage() {
  if (!(await isAdminRequest())) redirect('/admin/login')

  return (
    <div className={[styles.page, 'shell'].join(' ')}>
      <section className={styles.card} aria-labelledby="change-title">
        <span className={styles.lock} aria-hidden="true">
          🔑
        </span>
        <h1 id="change-title" className={styles.title}>
          Change your password
        </h1>
        <p className={styles.lead}>
          At least {PASSWORD_MIN} characters. Your current password is required, so a borrowed
          laptop isn’t enough to take the account over.
        </p>
        <ChangePasswordForm />
        <p className={styles.alt}>
          <Link href="/admin">Back to the dashboard</Link>
        </p>
      </section>
    </div>
  )
}
