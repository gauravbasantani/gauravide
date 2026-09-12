import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConfigured, deleteOwned, selectOneOwned, updateOwned } from '@/lib/db'
import type { StoredSplit } from '@/lib/history'
import { getSession, ownerId } from '@/lib/session'
import { deleteExpense, SplitwiseError } from '@/lib/splitwise'

export const runtime = 'nodejs'

const Patch = z.object({ action: z.enum(['archive', 'restore']) })
const Remove = z.object({ deleteFromSplitwise: z.boolean().default(false) })

async function currentSplit(id: string) {
  const session = await getSession()
  if (!session.accessToken) return { session, split: null }
  const split = await selectOneOwned<StoredSplit>('splits', ownerId(session), id)
  return { session, split }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!dbConfigured) return NextResponse.json({ message: 'Your dashboard is unavailable.' }, { status: 503 })
  const body = Patch.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ message: 'Choose archive or restore.' }, { status: 400 })
  const { id } = await params
  try {
    const { session, split } = await currentSplit(id)
    if (!session.accessToken) return NextResponse.json({ message: 'Sign in first.' }, { status: 401 })
    if (!split) return NextResponse.json({ message: 'That saved split was not found.' }, { status: 404 })
    const changed = await updateOwned('splits', ownerId(session), id, {
      archived_at: body.data.action === 'archive' ? new Date().toISOString() : null,
    })
    return NextResponse.json({ ok: changed })
  } catch {
    return NextResponse.json({ message: 'Couldn’t update this saved split. Try again.' }, { status: 502 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!dbConfigured) return NextResponse.json({ message: 'Your dashboard is unavailable.' }, { status: 503 })
  const body = Remove.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ message: 'Choose how to remove this split.' }, { status: 400 })
  const { id } = await params
  try {
    const { session, split } = await currentSplit(id)
    if (!session.accessToken) return NextResponse.json({ message: 'Sign in first.' }, { status: 401 })
    if (!split) return NextResponse.json({ message: 'That saved split was not found.' }, { status: 404 })

    if (body.data.deleteFromSplitwise) {
      // Do the irreversible shared action first. If it fails, retain the
      // dashboard record so the user still has a way to retry or inspect it.
      for (const expenseId of split.expense_ids) {
        await deleteExpense(session.accessToken, Number(expenseId))
      }
    }
    const removed = await deleteOwned('splits', ownerId(session), id)
    return NextResponse.json({ ok: removed })
  } catch (error) {
    const message =
      error instanceof SplitwiseError && error.needsReauth
        ? 'Your Splitwise connection expired. Sign in again, then retry.'
        : body.data.deleteFromSplitwise
          ? 'Couldn’t finish deleting this shared Splitwise expense. Your dashboard copy is still here; check Splitwise before trying again because a multi-expense split may have been partly deleted.'
          : 'Couldn’t remove this saved split from your dashboard. Try again.'
    return NextResponse.json({ message }, { status: 502 })
  }
}
