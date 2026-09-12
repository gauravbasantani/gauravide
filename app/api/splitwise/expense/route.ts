import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, ownerId } from '@/lib/session'
import { createExpense, SplitwiseError } from '@/lib/splitwise'
import { computeSplit, maxRoundingDrift, settleRounding, type Item } from '@/lib/split'
import { rateLimit } from '@/lib/ratelimit'
import { dbConfigured, insert } from '@/lib/db'

export const runtime = 'nodejs'

const Body = z.object({
  merchant: z.string().max(120).nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  currency: z.string().length(3).default('USD'),
  groupId: z.number().int().min(0), // 0 = non-group expense (FR-19a)
  groupName: z.string().min(1).max(120).default('No group'),
  payerId: z.number().int(),
  totalCents: z.number().int().positive(),
  taxCents: z.number().int().default(0),
  tipCents: z.number().int().default(0),
  feeCents: z.number().int().default(0),
  taxLines: z.array(z.object({ flag: z.string().max(3), cents: z.number().int() })).default([]),
  items: z.array(
    z.object({
      name: z.string().max(120),
      cents: z.number().int(),
      taxFlag: z.string().max(3).optional(),
      people: z.array(z.number().int()),
    }),
  ),
  people: z.array(z.object({ id: z.number().int(), name: z.string().min(1).max(120) })).min(1),
  /** Guards against a double-tap creating two expenses (FR-22). */
  idempotencyKey: z.string().uuid(),
})

const recent = new Map<string, { id: number; at: number }>()

export async function POST(req: Request) {
  const session = await getSession()
  if (!session.accessToken) {
    return NextResponse.json(
      { error: 'signed_out', message: 'Sign in with Splitwise first.' },
      { status: 401 },
    )
  }

  const limit = rateLimit(`expense:${ownerId(session)}`, 30, 3600)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Slow down a moment — try again shortly.' },
      { status: 429 },
    )
  }

  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid', message: 'Something about that split looked wrong.' },
      { status: 400 },
    )
  }
  const input = parsed.data

  // Idempotency: the same key within 5 minutes returns the same expense
  // rather than creating a second one.
  const seen = recent.get(input.idempotencyKey)
  if (seen && Date.now() - seen.at < 5 * 60_000) {
    return NextResponse.json({ id: seen.id, deduplicated: true })
  }

  // The client's totals are a preview. The authoritative shares are computed
  // here, from raw assignments (ARCHITECTURE.md A5).
  const people = [...new Set(input.items.flatMap((i) => i.people))]
  if (people.length === 0) {
    return NextResponse.json(
      { error: 'nobody_assigned', message: 'Nobody is assigned to anything yet.' },
      { status: 400 },
    )
  }

  const items: Item[] = input.items.map((item, i) => ({
    id: String(i),
    name: item.name,
    cents: item.cents,
    ...(item.taxFlag ? { taxFlag: item.taxFlag } : {}),
    people: item.people.map(String),
  }))

  const result = computeSplit({
    items,
    people: people.map(String),
    taxLines: input.taxLines,
    taxCents: input.taxCents,
    tipCents: input.tipCents,
    feeCents: input.feeCents,
    totalCents: input.totalCents,
  })

  if (result.unassignedItemIds.length > 0) {
    return NextResponse.json(
      { error: 'unassigned', message: 'Some items still need someone.' },
      { status: 400 },
    )
  }

  // Hard block — and it MUST come before settleRounding (ACC-3 check 3).
  //
  // settleRounding makes the shares sum to the total by construction, so any
  // check after it is dead code. Checking afterwards is what let a receipt
  // whose items did not match its printed total push the entire difference
  // onto the payer, while the UI said "matches receipt".
  const drift = Math.abs(input.totalCents - result.computedTotal)
  if (drift > maxRoundingDrift(people.length)) {
    console.error(`[expense] reconciliation failed: drift ${drift} cents`)
    return NextResponse.json(
      {
        error: 'reconciliation_failed',
        message:
          'The items don’t add up to the total on the receipt. We won’t submit something wrong — go back and check the amounts.',
      },
      { status: 422 },
    )
  }

  // Only genuine rounding remains; give the odd cent to the payer (FR-18).
  const shares = settleRounding(result.shares, input.totalCents, String(input.payerId))

  const description = [input.merchant?.trim() || 'Receipt'].join('')

  try {
    const { id } = await createExpense(session.accessToken, {
      costCents: input.totalCents,
      description,
      date: input.date,
      currency: input.currency,
      groupId: input.groupId,
      shares: people.map((userId) => ({
        userId,
        paidCents: userId === input.payerId ? input.totalCents : 0,
        owedCents: shares[String(userId)] ?? 0,
      })),
    })

    recent.set(input.idempotencyKey, { id, at: Date.now() })
    let historySaved = false
    if (dbConfigured) {
      try {
        await insert('splits', {
          owner_id: ownerId(session),
          data: {
            merchant: input.merchant,
            date: input.date,
            currency: input.currency,
            totalCents: input.totalCents,
            taxCents: input.taxCents,
            tipCents: input.tipCents,
            feeCents: input.feeCents,
            items: input.items,
            people: input.people,
            payerId: input.payerId,
            groupId: input.groupId,
            groupName: input.groupName,
            status: 'in_splitwise',
          },
          expense_ids: [String(id)],
        })
        await insert('events', {
          user_key: ownerId(session),
          name: 'split_submitted',
          props: { source: 'splitwise', group: input.groupId === 0 ? 'none' : 'group' },
        })
        historySaved = true
      } catch {
        // The Splitwise expense has already been created. Do not turn a history
        // outage into a misleading submission failure.
        console.error('[expense] history save failed')
      }
    }
    return NextResponse.json({ id, historySaved })
  } catch (err) {
    if (err instanceof SplitwiseError && err.needsReauth) {
      return NextResponse.json(
        { error: 'reauth', message: 'You’ve been signed out of Splitwise. Sign in again — your split is still here.' },
        { status: 401 },
      )
    }
    const detail = err instanceof SplitwiseError ? `${err.status}` : 'unknown'
    console.error(`[expense] create failed: ${detail}`)
    return NextResponse.json(
      {
        error: 'splitwise_failed',
        message: 'Couldn’t reach Splitwise. Your split is still here — try again.',
      },
      { status: 502 },
    )
  }
}
