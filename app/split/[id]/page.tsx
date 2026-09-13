import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { dbConfigured, selectOneOwned } from '@/lib/db'
import { getSession, ownerId } from '@/lib/session'
import { NOT_REMOVED, type StoredSplit } from '@/lib/history'
import { SplitView } from '@/components/split/SplitView'
import { EditSplitButton } from './EditSplitButton'
import { ShareButton } from './ShareButton'
import { SplitActions } from './SplitActions'
import { SyncPanel } from './SyncPanel'
import styles from '@/components/split/split.module.css'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function SplitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.accessToken) redirect('/')
  if (!dbConfigured) notFound()

  const { id } = await params
  if (!UUID.test(id)) notFound()
  let split: StoredSplit | null = null
  try {
    split = await selectOneOwned<StoredSplit>('splits', ownerId(session), id, NOT_REMOVED)
  } catch {
    notFound()
  }
  if (!split) notFound()

  return (
    <SplitView
      split={split}
      viewerId={split.owner_id}
      imageSrc={split.image_path ? `/api/splits/${split.id}/image` : null}
      topBar={
        <div className={styles.topBar}>
          <Link href="/" className={styles.back} aria-label="Back to your splits">
            <span aria-hidden="true">←</span>
            <span className={styles.backText}>Your splits</span>
          </Link>
          <div className={styles.topActions}>
            {/* Sharing leads: it is the thing people come back to this page to
                do, and it used to be four screens down. */}
            <ShareButton splitId={split.id} token={split.data.shareToken ?? null} />
            <EditSplitButton split={split} />
            {split.expense_ids[0] ? (
              <a
                className={styles.open}
                href={'https://secure.splitwise.com/expenses/' + split.expense_ids[0]}
                target="_blank"
                rel="noreferrer"
              >
                {/* The space belongs to the hidden half, so the narrow-screen
                    label is "Splitwise ↗" with no stray gap in front. */}
                <span className={styles.openText}>Open in&nbsp;</span>Splitwise ↗
              </a>
            ) : null}
          </div>
        </div>
      }
    >
      <SyncPanel
        splitId={split.id}
        syncedAt={split.data.syncedAt ?? null}
        deletedInSplitwise={split.data.deletedInSplitwise ?? false}
      />

      <SplitActions
        splitId={split.id}
        archived={Boolean(split.archived_at)}
        hasSplitwiseExpense={split.expense_ids.length > 0}
      />
    </SplitView>
  )
}
