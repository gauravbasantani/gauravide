/**
 * A saved split, read-only, for anyone holding the link (FR-53).
 *
 * No sign-in, no session, nothing to tap. The link itself is the permission,
 * so the page is never indexed and the owner can revoke it at any time — after
 * which this is an ordinary 404.
 */
import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { dbConfigured } from '@/lib/db'
import { splitByShareToken } from '@/lib/share'
import { SplitView } from '@/components/split/SplitView'
import styles from '@/components/split/split.module.css'

/** A shared receipt is private to whoever has the link — never to a crawler. */
export const metadata: Metadata = {
  title: 'Shared receipt · Gauravide',
  robots: { index: false, follow: false, nocache: true },
}

export default async function SharedSplitPage({ params }: { params: Promise<{ token: string }> }) {
  if (!dbConfigured) notFound()
  const { token } = await params
  let split = null
  try {
    split = await splitByShareToken(token)
  } catch {
    notFound()
  }
  if (!split || split.data.removedAt) notFound()

  return (
    <SplitView
      split={split}
      viewerId={null}
      imageSrc={split.image_path ? `/api/s/${token}/image` : null}
      topBar={
        <div className={styles.sharedBanner}>
          <div>
            <strong>Shared with you</strong>
            <p>
              A read-only copy of this receipt: what was bought, who shared what, and who owes
              whom. Nothing here can be changed, and you don’t need an account to read it.
            </p>
          </div>
          <Link href="/new" className={styles.sharedCta}>
            Split your own receipt
          </Link>
        </div>
      }
    >
      <p className={styles.sharedFooter}>
        Split by <strong>Gauravide</strong> — scan a receipt, tap who shares what, send it to
        Splitwise. <Link href="/">See how it works</Link>
      </p>
    </SplitView>
  )
}
