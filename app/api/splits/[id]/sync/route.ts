/**
 * Keep one saved split and its Splitwise expense in step (FR-48).
 *
 *   check — what does Splitwise have now, and how does it differ?
 *   pull  — take Splitwise's version (totals, shares, name, date, group)
 *   push  — send our saved version back over theirs
 *
 * Never automatic: changing a shared expense affects everyone in it, so the
 * user picks a direction after seeing both sides.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConfigured, selectOneOwned, updateOwned } from '@/lib/db'
import { NOT_REMOVED, type StoredSplit } from '@/lib/history'
import { formatMoney } from '@/lib/money'
import { getSession, ownerId } from '@/lib/session'
import { createExpense, getExpense, SplitwiseError } from '@/lib/splitwise'
import { applyRemote, differences, readRemote } from '@/lib/sync'
import { rateLimit } from '@/lib/ratelimit'

export const runtime = 'nodejs'

const SplitId = z.string().uuid()
const Body = z.object({ action: z.enum(['check', 'pull', 'push']) })

const json = (status: number, message: string) => NextResponse.json({ message }, { status })

/**
 * Gone from Splitwise means gone from the active list (FR-49).
 *
 * The saved copy is kept — it is the only record of what the receipt said —
 * but it moves to the archive, because an expense nobody can settle any more
 * does not belong among the live ones. Restoring it is a button away.
 */
async function markDeleted(owner: string, split: StoredSplit) {
  await updateOwned('splits', owner, split.id, {
    data: { ...split.data, deletedInSplitwise: true, syncedAt: new Date().toISOString() },
    archived_at: split.archived_at ?? new Date().toISOString(),
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!dbConfigured) return json(503, 'Your dashboard is unavailable.')

  const session = await getSession()
  const token = session.accessToken
  if (!token) return json(401, 'Sign in first.')
  const owner = ownerId(session)

  const limit = rateLimit(`sync:${owner}`, 60, 60 * 60)
  if (!limit.ok) return json(429, 'Checking a lot right now — try again in a few minutes.')

  const body = Body.safeParse(await req.json().catch(() => null))
  if (!body.success) return json(400, 'Choose check, pull or push.')

  const { id } = await params
  if (!SplitId.safeParse(id).success) return json(404, 'That saved split was not found.')

  let split: StoredSplit | null
  try {
    split = await selectOneOwned<StoredSplit>('splits', owner, id, NOT_REMOVED)
  } catch {
    return json(502, 'Couldn’t load that saved split. Try again.')
  }
  if (!split) return json(404, 'That saved split was not found.')

  const expenseId = Number(split.expense_ids[0])
  if (!expenseId) return json(400, 'This split has no Splitwise expense to compare with.')

  const money = (cents: number) => formatMoney(cents, split.data.currency || 'USD')

  try {
    const remote = readRemote(await getExpense(token, expenseId))

    if (remote.deleted) {
      await markDeleted(owner, split)
      return NextResponse.json({ status: 'deleted' })
    }

    const diffs = differences(split.data, remote, money)

    if (body.data.action === 'check') {
      if (diffs.length === 0) {
        await updateOwned('splits', owner, split.id, {
          data: { ...split.data, syncedAt: new Date().toISOString(), deletedInSplitwise: false },
        })
      }
      return NextResponse.json({
        status: diffs.length === 0 ? 'same' : 'different',
        differences: diffs,
        updatedAt: remote.updatedAt,
      })
    }

    if (body.data.action === 'pull') {
      await updateOwned('splits', owner, split.id, {
        data: { ...applyRemote(split.data, remote), deletedInSplitwise: false },
      })
      return NextResponse.json({ status: 'pulled', differences: diffs })
    }

    // push: our saved shares go back over theirs.
    const { owed, paid } = split.data
    if (!owed || !paid) {
      return json(
        400,
        'This split was saved before per-person amounts were stored. Use “Edit split” to send it again.',
      )
    }
    const participants = [...new Set([...Object.keys(owed), ...Object.keys(paid)])]
    await createExpense(token, {
      expenseId,
      costCents: split.data.totalCents,
      description: split.data.merchant?.trim() || 'Receipt',
      date: split.data.date,
      currency: split.data.currency || 'USD',
      groupId: split.data.groupId,
      shares: participants.map((userId) => ({
        userId: Number(userId),
        paidCents: paid[userId] ?? 0,
        owedCents: owed[userId] ?? 0,
      })),
    })
    await updateOwned('splits', owner, split.id, {
      data: { ...split.data, syncedAt: new Date().toISOString(), itemsStale: false, deletedInSplitwise: false },
    })
    return NextResponse.json({ status: 'pushed' })
  } catch (error) {
    if (error instanceof SplitwiseError && error.needsReauth) {
      return json(401, 'Your Splitwise connection expired. Sign in again, then retry.')
    }
    if (error instanceof SplitwiseError && error.rateLimited) {
      return json(429, 'Splitwise is busy right now. Wait a minute and try again — nothing changed.')
    }
    if (error instanceof SplitwiseError && error.refusal) {
      return json(422, `Splitwise didn’t accept it: ${error.refusal}`)
    }
    if (error instanceof SplitwiseError && error.status === 404) {
      await markDeleted(owner, split).catch(() => undefined)
      return NextResponse.json({ status: 'deleted' })
    }
    console.error('[sync] failed')
    return json(502, 'Couldn’t reach Splitwise. Try again in a moment.')
  }
}
