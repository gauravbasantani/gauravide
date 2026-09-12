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
          <strong>1. Snap.</strong> Take a photo of the receipt, or upload an image or PDF.
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
          <strong>4. Done.</strong> One tap creates the expense in Splitwise.
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
          Your Splitwise access token is held in an encrypted, browser-only cookie. It is never
          stored in a database and never sent to the browser in readable form.{' '}
          <strong>Your Splitwise password never touches this app</strong> — signing in happens on
          Splitwise&rsquo;s own site.
        </p>
        <p>
          Any usage statistics collected are anonymous and never include what you bought.
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
