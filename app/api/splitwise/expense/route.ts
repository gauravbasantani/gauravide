import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, ownerId } from '@/lib/session'
import { createExpense, SplitwiseError } from '@/lib/splitwise'
import { computeSplit, settleRounding, type Item } from '@/lib/split'
import { rateLimit } from '@/lib/ratelimit'

export const runtime = 'nodejs'

const Body = z.object({
  merchant: z.string().max(120).nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  currency: z.string().length(3).default('USD'),
  groupId: z.number().int().min(0), // 0 = non-group expense (FR-19a)
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

  const shares = settleRounding(result.shares, input.totalCents, String(input.payerId))
  const sum = Object.values(shares).reduce((a, b) => a + b, 0)

  // Hard block. If this fails it is our bug, not the user's (ACC-3 check 3).
  if (sum !== input.totalCents) {
    console.error(`[expense] reconciliation failed: ${sum} !== ${input.totalCents}`)
    return NextResponse.json(
      {
        error: 'reconciliation_failed',
        message: 'The numbers don’t add up. We won’t submit something wrong.',
      },
      { status: 422 },
    )
  }

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
    return NextResponse.json({ id })
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
