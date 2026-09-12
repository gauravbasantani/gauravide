import Link from 'next/link'
import { adminSignInAvailable } from '@/lib/adminAuth'
import { adminEmail, emailConfigured, maskEmail } from '@/lib/email'
import { ForgotForm } from './ForgotForm'
import styles from '../login/login.module.css'

export const metadata = {
  title: 'Reset admin password · Gauravide',
  robots: { index: false, follow: false },
}

export default async function AdminForgotPage() {
  const available = await adminSignInAvailable()
  const canEmail = emailConfigured()

  return (
    <div className={[styles.page, 'shell'].join(' ')}>
      <section className={styles.card} aria-labelledby="forgot-title">
        <span className={styles.lock} aria-hidden="true">
          ✉️
        </span>
        <h1 id="forgot-title" className={styles.title}>
          Reset your password
        </h1>

        {available && canEmail ? (
          <>
            <p className={styles.lead}>
              We’ll email a one-time link to <strong>{maskEmail(adminEmail())}</strong>. It works
              once and expires in 30 minutes. Your current password keeps working until you use it.
            </p>
            <ForgotForm />
          </>
        ) : (
          <>
            <p className={styles.lead}>
              Email isn’t set up on this deployment, so reset it from your own machine — it takes a
              minute and needs no new service.
            </p>
            <ol className={styles.steps}>
              <li>
                Run <code>npm run admin:password</code> and type a new password (it stays hidden).
              </li>
              <li>
                Copy the line it prints into Vercel as <code>ADMIN_PASSWORD_HASH</code> (Project →
                Settings → Environment Variables → Production).
              </li>
              <li>Redeploy, then sign in with the new password.</li>
            </ol>
            <p className={styles.hint}>
              To switch on emailed reset links instead: add <code>RESEND_API_KEY</code> (free at
              resend.com) and redeploy. Links then go to {maskEmail(adminEmail())}.
            </p>
          </>
        )}

        <p className={styles.alt}>
          <Link href="/admin/login">Back to sign in</Link>
        </p>
      </section>
    </div>
  )
}
