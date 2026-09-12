import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, ownerId } from '@/lib/session'
import { createExpense, SplitwiseError } from '@/lib/splitwise'
import { planSplit, type Item } from '@/lib/split'
import { rateLimit } from '@/lib/ratelimit'
import {
  dbConfigured,
  findOwnedByDataField,
  insert,
  insertReturning,
  selectOneOwned,
  updateOwned,
} from '@/lib/db'
import type { StoredSplit } from '@/lib/history'

export const runtime = 'nodejs'

const UserId = z.number().int().positive()
const Cents = z.number().int().min(-100_000_000).max(100_000_000)
const IdKey = z.string().regex(/^\d{1,12}$/)

const Body = z.object({
  merchant: z.string().max(120).nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
  groupId: z.number().int().min(0), // 0 = non-group expense (FR-19a)
  groupName: z.string().min(1).max(120).default('No group'),
  totalCents: z.number().int().positive().max(100_000_000),
  taxCents: Cents.default(0),
  tipCents: Cents.default(0),
  feeCents: Cents.default(0),
  taxLines: z.array(z.object({ flag: z.string().max(3), cents: Cents })).max(10).default([]),
  mode: z.enum(['items', 'equal', 'shares', 'exact']).default('items'),
  included: z.array(UserId).max(50).optional(),
  weights: z.record(IdKey, z.number().int().min(0).max(99)).default({}),
  exact: z.record(IdKey, Cents).default({}),
  payers: z.array(z.object({ personId: UserId, cents: Cents })).max(50).optional(),
  /** Older clients sent one payer who paid everything. */
  payerId: UserId.optional(),
  items: z
    .array(
      z.object({
        name: z.string().max(160),
        cents: Cents,
        taxFlag: z.string().max(3).optional(),
        people: z.array(UserId).max(50),
        /** An uneven split of this one line (FR-32). */
        split: z
          .object({ kind: z.enum(['shares', 'exact']), values: z.record(IdKey, Cents) })
          .optional(),
      }),
    )
    .max(400),
  people: z.array(z.object({ id: UserId, name: z.string().min(1).max(120) })).min(1).max(50),
  /** Guards against a double tap, a refresh, or a retry creating two expenses (FR-22). */
  idempotencyKey: z.string().uuid(),
  /** Present when editing a saved split: update its Splitwise expense in place (FR-39). */
  edit: z.object({ splitId: z.string().uuid() }).optional(),
})

// Fast path for a double tap on the same instance. The database lookup below
// is what holds across serverless instances.
const recent = new Map<string, { id: number; splitId: string | null; at: number }>()
const RECENT_MS = 5 * 60_000

const fail = (status: number, error: string, message: string) =>
  NextResponse.json({ error, message }, { status })

export async function POST(req: Request) {
  const session = await getSession()
  if (!session.accessToken) return fail(401, 'signed_out', 'Sign in with Splitwise first.')
  const owner = ownerId(session)

  const limit = rateLimit(`expense:${owner}`, 30, 3600)
  if (!limit.ok) return fail(429, 'rate_limited', 'Slow down a moment — try again shortly.')

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return fail(400, 'invalid', 'Something about that split looked wrong.')
  const input = parsed.data

  // Editing: the saved split must be this person's, and must have an expense.
  let editing: StoredSplit | null = null
  if (input.edit) {
    if (!dbConfigured) {
      return fail(503, 'history_unavailable', 'Editing needs your saved splits, which are unavailable right now.')
    }
    try {
      editing = await selectOneOwned<StoredSplit>('splits', owner, input.edit.splitId)
    } catch {
      return fail(502, 'history_unavailable', 'Couldn’t load that saved split. Try again.')
    }
    if (!editing || !Number(editing.expense_ids[0])) {
      return fail(404, 'not_found', 'That saved split was not found.')
    }
  }

  // Idempotency: the same key returns the same expense, never a second one.
  // An edit updates in place, so repeating it is harmless and skips this.
  const memoKey = `${owner}:${input.idempotencyKey}`
  if (!editing) {
    const now = Date.now()
    for (const [key, entry] of recent) if (now - entry.at > RECENT_MS) recent.delete(key)
    const seen = recent.get(memoKey)
    if (seen) {
      return NextResponse.json({ id: seen.id, splitId: seen.splitId, deduplicated: true, historySaved: true })
    }
    if (dbConfigured) {
      try {
        const existing = await findOwnedByDataField<StoredSplit>(
          'splits',
          owner,
          'idempotencyKey',
          input.idempotencyKey,
        )
        const existingId = Number(existing?.expense_ids[0])
        if (existing && existingId) {
          return NextResponse.json({
            id: existingId,
            splitId: existing.id,
            deduplicated: true,
            historySaved: true,
          })
        }
      } catch {
        // History outage: fall through. The in-memory guard still covers a double tap.
        console.error('[expense] idempotency lookup failed')
      }
    }
  }

  // Every id the split mentions must be one of its people — a stale payer or
  // a removed person must never reach Splitwise (review finding 2).
  const peopleIds = [...new Set(input.people.map((p) => String(p.id)))]
  const known = new Set(peopleIds)
  const mentioned = [
    ...input.items.flatMap((item) => item.people),
    ...(input.included ?? []),
    ...(input.payers ?? []).map((p) => p.personId),
  ].map(String)
  if (mentioned.some((id) => !known.has(id))) {
    return fail(400, 'unknown_person', 'Someone in this split is no longer in it. Go back and check.')
  }

  const payers = input.payers
    ? input.payers.map((p) => ({ personId: String(p.personId), cents: p.cents }))
    : input.payerId
      ? [{ personId: String(input.payerId), cents: input.totalCents }]
      : []

  // The client's totals are a preview. The authoritative shares are computed
  // here, from raw assignments (ARCHITECTURE.md A5).
  const items: Item[] = input.items.map((item, i) => ({
    id: String(i),
    name: item.name,
    cents: item.cents,
    ...(item.taxFlag ? { taxFlag: item.taxFlag } : {}),
    people: item.people.map(String),
    ...(item.split ? { split: item.split } : {}),
  }))

  const plan = planSplit({
    mode: input.mode,
    items,
    people: peopleIds,
    ...(input.included ? { included: input.included.map(String) } : {}),
    weights: input.weights,
    exact: input.exact,
    taxLines: input.taxLines,
    taxCents: input.taxCents,
    tipCents: input.tipCents,
    feeCents: input.feeCents,
    totalCents: input.totalCents,
    payers,
  })

  if (!plan.ok) {
    if (plan.problem === 'items_mismatch') {
      // Hard block (ACC-3 check 3). Reconciliation is judged before rounding.
      console.error(`[expense] reconciliation failed: drift ${Math.abs(plan.gap ?? 0)} cents`)
      return fail(
        422,
        'reconciliation_failed',
        'The items don’t add up to the total on the receipt. We won’t submit something wrong — go back and check the amounts.',
      )
    }
    const messages: Record<string, string> = {
      unassigned: 'Some items still need someone.',
      no_total: 'The total needs to be more than zero.',
      negative_share:
        'Someone ends up owing less than nothing. Give them the item a discount belongs to, or share that discount.',
      item_exact_mismatch: 'One item’s exact amounts don’t add up to its price.',
      no_people: 'Add at least one person.',
      nobody_included: 'Choose at least one person to split with.',
      no_shares: 'Give at least one person a share.',
      exact_mismatch: 'The exact amounts don’t add up to the total.',
      no_payer: 'Choose who paid.',
      payer_not_in_split: 'Whoever paid needs to be in the split.',
      payers_mismatch: 'What people paid doesn’t add up to the total.',
    }
    return fail(400, plan.problem, messages[plan.problem] ?? 'Something about that split looked wrong.')
  }

  const description = input.merchant?.trim() || 'Receipt'
  const primaryPayer = Number([...payers].sort((a, b) => b.cents - a.cents)[0]?.personId ?? 0)

  try {
    const { id } = await createExpense(session.accessToken, {
      costCents: input.totalCents,
      description,
      date: input.date,
      currency: input.currency,
      groupId: input.groupId,
      shares: plan.participants.map((userId) => ({
        userId: Number(userId),
        paidCents: plan.paid[userId] ?? 0,
        owedCents: plan.owed[userId] ?? 0,
      })),
      ...(editing ? { expenseId: Number(editing.expense_ids[0]) } : {}),
    })

    const data = {
      merchant: input.merchant,
      date: input.date,
      currency: input.currency,
      totalCents: input.totalCents,
      taxCents: input.taxCents,
      tipCents: input.tipCents,
      feeCents: input.feeCents,
      items: input.items,
      people: input.people.filter((p) => plan.participants.includes(String(p.id))),
      payerId: primaryPayer,
      groupId: input.groupId,
      groupName: input.groupName,
      status: 'in_splitwise',
      mode: input.mode,
      owed: plan.owed,
      paid: plan.paid,
      idempotencyKey: input.idempotencyKey,
      // Everything needed to reopen it exactly for an edit (FR-39).
      taxLines: input.taxLines,
      included: input.included ?? null,
      weights: input.weights,
      exact: input.exact,
      // Counts and ids only, for the admin dashboard's aggregates (MET-19).
      itemCount: input.items.length,
      peopleCount: plan.participants.length,
      payerCount: payers.length,
      participants: plan.participants,
    }

    let splitId: string | null = editing?.id ?? null
    if (!editing) recent.set(memoKey, { id, splitId: null, at: Date.now() })
    let historySaved = false
    if (dbConfigured) {
      try {
        if (editing) {
          await updateOwned('splits', owner, editing.id, { data })
        } else {
          const row = await insertReturning<{ id: string }>('splits', {
            owner_id: owner,
            data,
            expense_ids: [String(id)],
          })
          splitId = row.id
          recent.set(memoKey, { id, splitId, at: Date.now() })
        }
        await insert('events', {
          user_key: owner,
          name: editing ? 'split_edited' : 'split_submitted',
          props: {
            source: 'splitwise',
            group: input.groupId === 0 ? 'none' : 'group',
            mode: input.mode,
            payers: payers.length > 1 ? 'several' : 'one',
            item_splits: input.items.some((item) => item.split) ? 'yes' : 'no',
            items: input.items.length,
            people: plan.participants.length,
          },
        })
        historySaved = true
      } catch {
        // The Splitwise expense already exists. Do not turn a history outage
        // into a misleading submission failure.
        console.error('[expense] history save failed')
      }
    }
    return NextResponse.json({ id, splitId, historySaved, edited: Boolean(editing) })
  } catch (err) {
    if (err instanceof SplitwiseError && err.needsReauth) {
      return fail(
        401,
        'reauth',
        'You’ve been signed out of Splitwise. Sign in again — your split is still here.',
      )
    }
    if (err instanceof SplitwiseError && err.rateLimited) {
      // Splitwise publishes no numbers; all we can do is say so honestly.
      return fail(
        429,
        'splitwise_rate_limited',
        'Splitwise is limiting how fast expenses can be added right now. Wait a minute and press again — your split is still here, and nothing was created.',
      )
    }
    if (err instanceof SplitwiseError && err.refusal) {
      return fail(422, 'splitwise_refused', `Splitwise didn’t accept it: ${err.refusal}`)
    }
    const detail = err instanceof SplitwiseError ? `${err.status}` : 'unknown'
    console.error(`[expense] ${editing ? 'update' : 'create'} failed: ${detail}`)
    return fail(502, 'splitwise_failed', 'Couldn’t reach Splitwise. Your split is still here — try again.')
  }
}
