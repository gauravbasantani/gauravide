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
        <p>
          The one way anyone else sees it is a <strong>share link you create yourself</strong> —
          see below. There is no such link until you make one.
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
    q: 'What happens when I remove a split from my dashboard?',
    a: (
      <>
        <p>
          The receipt is gone for good: the items, the merchant, the date, everyone&rsquo;s names
          and amounts, and the photo, which is deleted from storage. It disappears from your
          dashboard and the link stops working, for you as much as anyone.
        </p>
        <p>
          What stays is one anonymous line in the usage totals — the amount, the currency, and how
          many items and people were involved. Nothing in it can rebuild the receipt. That line is
          the record of a receipt this app actually split, and one person tidying their own
          dashboard shouldn&rsquo;t rewrite how much work the app has done. The same is true if the
          expense is deleted in Splitwise.
        </p>
      </>
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
        tax is split in proportion to each person&rsquo;s items, and the app says so. Whatever your
        country calls it — VAT, GST, HST, ALV, MOMS, MWST, TVA, IVA — it is read as tax and never
        charged to someone as though it were an item they bought.
      </p>
    ),
  },
  {
    q: 'Can I split with someone who isn’t on Splitwise?',
    a: (
      <>
        <p>
          Yes, once you are signed in. In the add-person sheet, type their name and choose{' '}
          <strong>Add only to this split</strong> — the maths will be right and they appear
          everywhere in the breakdown. Splitwise itself only accepts an expense where everyone has
          an account, so the expense is sent for the people who do.
        </p>
        <p>
          To show that person their part, create a <strong>share link</strong> on the saved split
          and send it to them. It opens for anyone, with no account.
        </p>
      </>
    ),
  },
  {
    q: 'Can I show a split to someone without making them sign in?',
    a: (
      <>
        <p>
          Yes. Open the split under Your splits and press <strong>Create share link</strong>. That
          gives you a link showing the same page you see — the receipt photo, every item and who
          shared it, who paid, and who owes whom. Whoever opens it needs no account and cannot
          change anything.
        </p>
        <p>
          The link is a long random address: it cannot be guessed, and search engines are told not
          to index it. Anyone you send it to can pass it on, though, so treat it like the receipt
          itself. <strong>Turn off link</strong> stops it working for everyone straight away, and
          removing the split removes its link too.
        </p>
      </>
    ),
  },
  {
    q: 'How many receipts can I add? Is there a daily limit?',
    a: (
      <>
        <p>
          Splitwise doesn&rsquo;t publish a number. Their documentation says rate limits vary by
          endpoint, can change without notice, and are &ldquo;fairly lenient&rdquo;. If they ever
          do throttle a request, Gauravide tells you plainly, creates nothing, and keeps your split
          so you can press again in a minute.
        </p>
        <p>
          This app has its own limit — <strong>30 expenses an hour per account</strong> — to protect
          the shared free quotas. The send screen shows how many you&rsquo;ve sent this hour and in
          the last 24 hours, so you always know where you stand.
        </p>
        <p>
          Scanning has a separate, shared ceiling: the receipt reader runs on a free tier with a
          daily cap across everyone using Gauravide. When it runs out the app falls back to a
          simpler reader rather than stopping — it is less accurate, especially on a photo taken at
          an angle, and it says so on the review screen so you know to check every line. Typing a
          receipt in by hand always works and is never rate limited.
        </p>
      </>
    ),
  },
  {
    q: 'Does it work outside the United States?',
    a: (
      <>
        <p>
          Yes. Gauravide reads the currency off the receipt rather than assuming dollars, and the
          expense reaches Splitwise in that currency. It works out which one from what the receipt
          prints: a currency code, then a symbol only one currency uses — £, €, ₹ — and then the
          tax word, which names the country. GST and HST mean Canada, ALV Finland, MOMS Sweden, MVA
          Norway, MWST Switzerland, BTW the Netherlands, TVA France, IVA Spain or Italy, VAT Britain
          and much of Europe.
        </p>
        <p>
          Dates are read the way your country writes them, so 14/09 is 14 September, not an error.
          Decimal commas are understood: <strong>1.234,56</strong> and <strong>1,234.56</strong> are
          the same amount.
        </p>
        <p>
          A plain dollar sign is the one thing it cannot be certain about — Canada, Australia, New
          Zealand and Singapore all print one. So the currency sits on the review screen as a
          dropdown you can change in a tap, and it is worth a glance before you send: Splitwise
          cannot change an expense&rsquo;s currency afterwards.
        </p>
        <p>
          Currencies without cents — yen, won — are not supported yet; the app falls back to dollars
          rather than quietly showing you the wrong number.
        </p>
      </>
    ),
  },
  {
    q: 'If someone changes the expense in Splitwise, does this update?',
    a: (
      <p>
        Not by itself, on purpose. Open the split and press <strong>Check Splitwise</strong>: it
        compares the two copies and shows exactly what differs — total, name, date, group, who paid,
        who owes. Then you choose: take Splitwise&rsquo;s version, or push yours over theirs (which
        changes it for everyone in it). If it was deleted there, the page says so. Splitwise has no
        idea about items, so pulling updates the amounts and flags the item breakdown if it no
        longer adds up.
      </p>
    ),
  },
  {
    q: 'Is it secure?',
    a: (
      <p>
        Your Splitwise password never touches this app, the access token lives in an encrypted
        server-only cookie, every read and write is checked against your account, receipt photos
        sit in private storage with no public links, and uploads and input are validated on the
        server. The full account is on the <a href="/security">Security &amp; privacy</a> page,
        including how to report a problem.
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
