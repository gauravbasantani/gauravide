/**
 * Per-session rate limiting (SEC-12, SEC-20).
 *
 * In-memory and therefore per-instance: enough to stop one person burning a
 * shared free-tier quota, which is the actual threat here (GAP-12). A
 * distributed limiter would need a store, and the plan has no store to spare.
 */
type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export type RateLimit = { ok: true } | { ok: false; retryAfterSeconds: number }

export function rateLimit(key: string, limit: number, windowSeconds: number): RateLimit {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 })
    return { ok: true }
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) }
  }
  bucket.count += 1
  return { ok: true }
}

/** Keeps the map from growing without bound in a long-lived instance. */
export function sweep(now = Date.now()): void {
  for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k)
}
