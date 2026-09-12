import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConfigured, deleteOwned, selectOneOwned, updateOwned } from '@/lib/db'
import type { StoredSplit } from '@/lib/history'
import { getSession, ownerId } from '@/lib/session'
import { deleteExpense, SplitwiseError } from '@/lib/splitwise'

export const runtime = 'nodejs'

const SplitId = z.string().uuid()
const Patch = z.object({ action: z.enum(['archive', 'restore']) })
const Remove = z.object({ deleteFromSplitwise: z.boolean().default(false) })

const json = (status: number, message: string) => NextResponse.json({ message }, { status })

/** Signed in, a well-formed id, and a row this person owns — or a clear refusal. */
async function ownedSplit(params: Promise<{ id: string }>) {
  const session = await getSession()
  const token = session.accessToken
  if (!token) return { error: json(401, 'Sign in first.') } as const
  const { id } = await params
  // A malformed id is simply "not found" — never a database error (review finding 10).
  if (!SplitId.safeParse(id).success) return { error: json(404, 'That saved split was not found.') } as const
  const split = await selectOneOwned<StoredSplit>('splits', ownerId(session), id)
  if (!split) return { error: json(404, 'That saved split was not found.') } as const
  return { session, token, split } as const
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!dbConfigured) return json(503, 'Your dashboard is unavailable.')
  const body = Patch.safeParse(await req.json().catch(() => null))
  if (!body.success) return json(400, 'Choose archive or restore.')
  try {
    const found = await ownedSplit(params)
    if ('error' in found) return found.error
    const changed = await updateOwned('splits', ownerId(found.session), found.split.id, {
      archived_at: body.data.action === 'archive' ? new Date().toISOString() : null,
    })
    return NextResponse.json({ ok: changed })
  } catch {
    return json(502, 'Couldn’t update this saved split. Try again.')
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!dbConfigured) return json(503, 'Your dashboard is unavailable.')
  const body = Remove.safeParse(await req.json().catch(() => null))
  if (!body.success) return json(400, 'Choose how to remove this split.')
  try {
    const found = await ownedSplit(params)
    if ('error' in found) return found.error
    const { session, token, split } = found

    if (body.data.deleteFromSplitwise) {
      // Do the irreversible shared action first. If it fails, keep the
      // dashboard record so the user still has a way to retry or inspect it.
      for (const expenseId of split.expense_ids) {
        try {
          await deleteExpense(token, Number(expenseId))
        } catch (error) {
          if (error instanceof SplitwiseError && error.needsReauth) throw error
          return json(
            502,
            error instanceof SplitwiseError && error.refusal
              ? `Splitwise didn’t delete it: ${error.refusal} If it was already deleted in Splitwise, use “Remove dashboard copy” instead.`
              : 'Couldn’t delete this expense in Splitwise. If someone already deleted it there, use “Remove dashboard copy” instead.',
          )
        }
      }
    }
    const removed = await deleteOwned('splits', ownerId(session), split.id)
    return NextResponse.json({ ok: removed })
  } catch (error) {
    return json(
      502,
      error instanceof SplitwiseError && error.needsReauth
        ? 'Your Splitwise connection expired. Sign in again, then retry.'
        : 'Couldn’t remove this saved split from your dashboard. Try again.',
    )
  }
}
