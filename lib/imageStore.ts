/**
 * The receipt photo for the split in progress, kept in IndexedDB (UX-17).
 *
 * localStorage cannot hold an image, and the photo has to survive a refresh
 * and the round trip through Splitwise sign-in. Every call is wrapped: private
 * browsing can block IndexedDB, and losing a photo must never block a split.
 */
const DB = 'gauravide'
const STORE = 'draft-image'
const KEY = 'current'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  try {
    const db = await open()
    return await new Promise<T | null>((resolve) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function saveDraftImage(blob: Blob): Promise<void> {
  await run('readwrite', (store) => store.put(blob, KEY))
}

export async function loadDraftImage(): Promise<Blob | null> {
  const value = await run('readonly', (store) => store.get(KEY))
  return value instanceof Blob ? value : null
}

export async function clearDraftImage(): Promise<void> {
  await run('readwrite', (store) => store.delete(KEY))
}
