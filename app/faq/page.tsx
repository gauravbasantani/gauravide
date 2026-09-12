import type { Metadata } from 'next'
import styles from '../prose.module.css'

export const metadata: Metadata = { title: 'FAQ · Gauravide' }

const QA: { q: string; a: React.ReactNode }[] = [
  {
    q: 'Do I need Splitwise Pro?',
    a: (
      <>
        <p>
          <strong>You don&rsquo;t.</strong> Splitwise requires the <em>developer</em> of an app to
          hold a Pro subscription before the app can use their API at all. That cost sits with
          whoever runs Gauravide, not with you.
        </p>
        <p>You do need a normal (free) Splitwise account to sign in.</p>
      </>
    ),
  },
  {
    q: 'Why does Splitwise show broad account permissions when I connect?',
    a: (
      <p>
        Splitwise uses one account-level OAuth approval for third-party apps rather than separate
        permission switches. Gauravide uses that connection to read your profile, friends, and
        groups, then create the expense you explicitly submit. It has no feature or API route for
        changing your settings or inviting people.
      </p>
    ),
  },
  {
    q: 'Is my receipt stored? Who can see it?',
    a: (
      <>
        <p>
          The photo is stripped of location data in your browser, then sent to Google Gemini to
          read the items. That is the only place receipt contents leave this app.
        </p>
        <p>
          If you are signed in, the photo is also kept privately with that saved split so you can
          look at it later. It is stored in a private bucket, served only to your own account after
          a check on every request, and deleted when you remove the split from your dashboard.
          Signed out, nothing is stored anywhere.
        </p>
      </>
    ),
  },
  {
    q: 'Can I take the photo on a laptop or iPad?',
    a: (
      <p>
        Yes. &ldquo;Take a photo&rdquo; opens your camera in the app, you press the shutter, and
        the shot goes straight into the split. On a phone it opens the normal camera instead, which
        takes a sharper picture. If a device has no camera, the button is not shown — it would open
        a file picker, which is not what &ldquo;take a photo&rdquo; means.
      </p>
    ),
  },
  {
    q: 'Can I change a split after sending it?',
    a: (
      <p>
        Yes. Open it under Your splits and choose <strong>Edit split</strong>: items, people, who
        paid and the group are all editable, and saving updates the same Splitwise expense for
        everyone rather than creating a second one. You can also archive it, remove just your copy,
        or delete it from Splitwise for everyone — that last one always asks first.
      </p>
    ),
  },
  {
    q: 'What can the person who runs Gauravide see?',
    a: (
      <p>
        Counts, not contents. The admin dashboard shows how many people used it, how many receipts
        were scanned and sent, money split as a total per currency, and how often people come back.
        It cannot show receipt images, item names, merchants, who owes whom, or anyone&rsquo;s
        individual amounts, and accounts appear under a keyed pseudonym rather than a name or
        email. It is behind a password.
      </p>
    ),
  },
  {
    q: 'How is tax split — why didn’t everyone pay the same tax?',
    a: (
      <p>
        Most receipts print a code beside each line marking its tax rate. Gauravide reads those and
        charges tax to whoever took the taxed items. If you bought only tax-exempt groceries you pay
        none of the 8% charged on someone else&rsquo;s household goods. If the receipt has no codes,
        tax is split in proportion to each person&rsquo;s items, and the app says so.
      </p>
    ),
  },
  {
    q: 'Can I split with someone who isn’t on Splitwise?',
    a: (
      <p>
        You can add them by name and the maths will be right, but the expense can only be pushed to
        Splitwise if everyone in it has a Splitwise account. For anyone else, copy the summary at
        the end of the flow.
      </p>
    ),
  },
  {
    q: 'Can I connect my Walmart or Amazon account?',
    a: (
      <p>
        <strong>No</strong>, and not because we haven&rsquo;t got to it. Neither company offers a
        public API for your own order history — the developer APIs they publish are for marketplace
        sellers and affiliates. Photographing the receipt is the honest route.
      </p>
    ),
  },
  {
    q: 'What if the scan reads a price wrong?',
    a: (
      <p>
        Fix it — every line is editable, and lines the scan was unsure about are highlighted so your
        eye goes straight to them. If the items don&rsquo;t add up to the printed total, the app
        says so and points at the gap. It will never quietly adjust a price to make the numbers
        balance.
      </p>
    ),
  },
  {
    q: 'Do the splits always add up?',
    a: (
      <p>
        Yes, exactly. All money is handled in whole cents, and shares are distributed so they sum to
        the total to the penny — any leftover cent goes to whoever paid. The app refuses to submit
        an expense that doesn&rsquo;t reconcile.
      </p>
    ),
  },
  {
    q: 'Is it free? Will it stay free?',
    a: (
      <p>
        Free, and it has to stay that way: Splitwise&rsquo;s API terms forbid using it in connection
        with any fee-based service. So there will never be a subscription or ads.
      </p>
    ),
  },
]

export default function Faq() {
  return (
    <div className={['shell', styles.page].join(' ')}>
      <h1>Questions</h1>
      <div className={styles.qa}>
        {QA.map((item) => (
          <div key={item.q} className={styles.card}>
            <h2>{item.q}</h2>
            {item.a}
          </div>
        ))}
      </div>
      <p className={styles.disclaimer}>
        Still stuck? <a href="/contact">Tell us</a> — bugs and suggestions both welcome.
      </p>
    </div>
  )
}
