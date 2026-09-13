import type { Metadata } from 'next'
import { CONTACT_EMAIL } from '@/components/ui/Footer'
import styles from '../prose.module.css'

export const metadata: Metadata = {
  title: 'Security & privacy · Gauravide',
  description: 'What Gauravide stores, who can see it, and how it is protected.',
}

export default function Security() {
  return (
    <div className={['shell', styles.page].join(' ')}>
      <h1>Security &amp; privacy</h1>
      <p className={styles.lead}>
        This app touches two sensitive things: your receipts and your Splitwise account. Here is
        exactly what happens to both, in plain terms.
      </p>

      <div className={styles.card}>
        <h2>Your Splitwise account</h2>
        <p>
          <strong>Your Splitwise password never touches this app.</strong> Signing in happens on
          Splitwise’s own site; the app only ever receives an access token.
        </p>
        <p>
          That token is kept in a cookie that is <strong>encrypted</strong> (AES-GCM), readable
          only by the server, never by JavaScript, and never written to the database or sent back
          to the browser. It expires after 24 hours. Signing out deletes it.
        </p>
        <p>
          Nothing is created, changed or deleted in Splitwise unless you press the button that says
          so. Deleting a shared expense always asks first, because it affects everyone in it.
        </p>
      </div>

      <div className={styles.card}>
        <h2>Your receipts</h2>
        <p>
          Photos are <strong>stripped of location data in your browser</strong>, before upload, and
          again on the server for JPEGs — so GPS never survives even if the browser step fails.
        </p>
        <p>
          The image is sent to <strong>Google Gemini</strong> to read the items. That is the only
          place receipt contents leave this app. The raw text it returns is discarded.
        </p>
        <p>
          If you are signed in, your split and its photo are saved under your Splitwise account
          only: a <strong>private</strong> storage bucket with no public URLs, an ownership check on
          every single read and write, and row-level security in the database that denies everything
          by default. Signed out, nothing is stored.
        </p>
        <p>
          <strong>When you remove a split</strong>, the receipt is destroyed: items, merchant, date,
          names and per-person amounts are overwritten and the photo is deleted from storage. One
          anonymous line stays in the usage totals — amount, currency, and how many items and people
          — which cannot rebuild the receipt and is not linked to anything you can be identified by.
          That is the app&rsquo;s own record of work done, and it is the only thing kept.
        </p>
      </div>

      <div className={styles.card}>
        <h2>How the app itself is protected</h2>
        <ul>
          <li>
            <strong>Every request is checked.</strong> Reads and writes filter on both the record id
            and your account id, so one person’s link cannot reach another person’s split.
          </li>
          <li>
            <strong>Secrets stay on the server.</strong> The database service key and the Splitwise
            client secret are never sent to the browser.
          </li>
          <li>
            <strong>Uploads are verified.</strong> File type is checked by reading the bytes, not
            trusting the name, and size is capped.
          </li>
          <li>
            <strong>Input is validated</strong> on the server before anything is sent to Splitwise,
            and the split is recalculated there — the browser’s totals are only a preview.
          </li>
          <li>
            <strong>Rate limits</strong> on reading receipts, creating expenses, and signing in to
            the admin area, so the free quotas can’t be burned by one visitor.
          </li>
          <li>
            <strong>Browser protections:</strong> a content security policy, HSTS, no framing, no
            MIME sniffing, and a strict referrer policy.
          </li>
          <li>
            <strong>Admin access</strong> is a username and a salted, hashed password (scrypt), an
            encrypted session that expires in 8 hours, lockout after repeated failures, and a
            one-time reset link by email. Admin sees counts only — never receipts, names or amounts.
          </li>
        </ul>
      </div>

      <div className={styles.callout}>
        <h2>What this app does not do</h2>
        <p>
          No ads, no trackers, no analytics company, no selling anything to anyone. Usage numbers
          are counts kept in this app’s own database, under a keyed pseudonym.
        </p>
        <p>
          It is not a bank and stores no card details. It never asks for a password belonging to
          another service.
        </p>
      </div>

      <div className={styles.card}>
        <h2>Found a problem?</h2>
        <p>
          Please report it privately first: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          You’ll get a reply. Machine-readable details are at{' '}
          <a href="/.well-known/security.txt">/.well-known/security.txt</a>.
        </p>
      </div>

      <p className={styles.disclaimer}>
        One person runs this app, honestly, for free. If something here stops being true, this page
        changes with it.
      </p>
    </div>
  )
}
