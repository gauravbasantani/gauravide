import type { Metadata } from 'next'
import styles from '../prose.module.css'

export const metadata: Metadata = { title: 'About · Gauravide' }

export default function About() {
  return (
    <div className={['shell', styles.page].join(' ')}>
      <h1>About Gauravide</h1>
      <p className={styles.lead}>
        Photograph a receipt, tap who shared what, and the itemised expense lands in Splitwise —
        split to the cent.
      </p>

      <div className={styles.card}>
        <h2>How it works</h2>
        <p>
          <strong>1. Snap.</strong> Photograph the receipt — in the app on a laptop or iPad, with
          the normal camera on a phone — or upload an image or PDF.
        </p>
        <p>
          <strong>2. Check.</strong> Every line is read back to you, editable. Anything the scan
          was unsure about is highlighted. Nothing is ever silently corrected.
        </p>
        <p>
          <strong>3. Tap who.</strong> Assign items by tapping faces. Per-person totals update on
          every tap — there is no Calculate button.
        </p>
        <p>
          <strong>4. Done.</strong> Choose who paid — one person or several — and one tap creates
          the expense in Splitwise. It is saved under Your splits, with the photo, and can be
          edited or deleted later.
        </p>
      </div>

      <div className={styles.card}>
        <h2>Tax, done properly</h2>
        <p>
          Most receipts print a letter beside each line marking which tax rate applies. A Costco
          receipt might charge 8.1% on household goods and 1.8% on food.
        </p>
        <p>
          Gauravide reads those codes and charges tax to the people who actually incurred it.
          Splitting tax evenly quietly overcharges whoever bought the groceries.
        </p>
      </div>

      <div className={styles.callout}>
        <h2>Your data</h2>
        <p>
          <strong>Photos are stripped of location data before they leave your device.</strong>{' '}
          Receipt photos embed GPS coordinates; those are removed in your browser, before anything
          is uploaded.
        </p>
        <p>
          Receipt images are sent to <strong>Google Gemini</strong> to read the items — that is
          the only place receipt contents leave this app. If that is unavailable, a backup reader
          is used, and you can always type items in by hand.
        </p>
        <p>
          When you are signed in, your split and its receipt photo are saved to{' '}
          <strong>your account only</strong>: private storage, an ownership check on every read,
          and both deleted together when you remove the split. Signed out, nothing is kept.
        </p>
        <p>
          Your Splitwise access token is held in an encrypted, browser-only cookie. It is never
          stored in a database and never sent to the browser in readable form.{' '}
          <strong>Your Splitwise password never touches this app</strong> — signing in happens on
          Splitwise&rsquo;s own site.
        </p>
        <p>
          Usage statistics are counts only — receipts scanned, splits sent, money split as a
          total, how often people return. They never include what you bought, who you split with,
          or what anyone owes, and accounts appear under a keyed pseudonym, never a name or email.
        </p>
      </div>

      <div className={styles.card}>
        <h2>Why &ldquo;Gauravide&rdquo;?</h2>
        <p>
          It is <strong>Gaurav + divide</strong>. A person made this, not a company.
        </p>
      </div>

      <p className={styles.disclaimer}>
        Gauravide is not affiliated with, endorsed by, or sponsored by Splitwise. Splitwise is a
        trademark of its owner. This app is free and is not a fee-based service.
      </p>
    </div>
  )
}
