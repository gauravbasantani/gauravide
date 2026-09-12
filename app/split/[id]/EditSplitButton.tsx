'use client'

import { useRouter } from 'next/navigation'
import { saveDraft } from '@/lib/draft'
import { draftFromSplit, type StoredSplit } from '@/lib/history'
import { clearDraftImage } from '@/lib/imageStore'
import styles from './split.module.css'

/** Reopen a saved split in the flow; saving updates the same Splitwise expense (FR-39). */
export function EditSplitButton({ split }: { split: StoredSplit }) {
  const router = useRouter()
  return (
    <button
      type="button"
      className={styles.edit}
      onClick={() => {
        void clearDraftImage()
        saveDraft(draftFromSplit(split, () => crypto.randomUUID()))
        router.push('/new?edit=1')
      }}
    >
      ✎ Edit split
    </button>
  )
}
