/**
 * Splitwise API client — server only (ARCHITECTURE.md §3.3).
 *
 * OAuth 2.0. The 1.0a endpoints Splitwise also publishes are the older
 * three-legged flow and are not used.
 *
 * Requires an active Splitwise Pro subscription on the DEVELOPER's account to
 * register the app at all (requirements.md §4).
 */
const AUTHORIZE_URL = 'https://secure.splitwise.com/oauth/authorize'
const TOKEN_URL = 'https://secure.splitwise.com/oauth/token'
const API = 'https://secure.splitwise.com/api/v3.0'

export type SplitwiseUser = {
  id: number
  first_name: string | null
  last_name: string | null
  email?: string | null
  picture?: { medium?: string | null } | null
}

export type SplitwiseGroup = {
  id: number
  name: string
  members: SplitwiseUser[]
  updated_at?: string
  invite_link?: string
}

export class SplitwiseError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(detail)
    this.name = 'SplitwiseError'
  }
  /** 401 means the user revoked access or the token expired (GAP-5). */
  get needsReauth(): boolean {
    return this.status === 401
  }
}

function credentials(): { id: string; secret: string } {
  const id = process.env.SPLITWISE_CLIENT_ID
  const secret = process.env.SPLITWISE_CLIENT_SECRET
  if (!id || !secret) throw new Error('Splitwise credentials are not configured')
  return { id, secret }
}

export const splitwiseConfigured = (): boolean =>
  Boolean(process.env.SPLITWISE_CLIENT_ID && process.env.SPLITWISE_CLIENT_SECRET)

/** Step 1: where we send the user to log in and approve. */
export function authorizeUrl(state: string, redirectUri: string): string {
  const { id } = credentials()
  const params = new URLSearchParams({
    client_id: id,
    response_type: 'code',
    redirect_uri: redirectUri,
    state, // CSRF defence, verified on the way back (SEC-4)
  })
  return `${AUTHORIZE_URL}?${params}`
}

/** Step 2: swap the approval code for an access token. Server-side only. */
export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const { id, secret } = credentials()
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })
  if (!res.ok) throw new SplitwiseError(res.status, `token exchange failed (${res.status})`)

  const body = (await res.json()) as { access_token?: string }
  if (!body.access_token) throw new SplitwiseError(502, 'no access token in response')
  return body.access_token
}

async function call<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new SplitwiseError(res.status, text.slice(0, 300) || `HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

export const getCurrentUser = (token: string) =>
  call<{ user: SplitwiseUser }>(token, 'get_current_user').then((r) => r.user)

export const getGroups = (token: string) =>
  call<{ groups: SplitwiseGroup[] }>(token, 'get_groups').then((r) => r.groups)

export const getFriends = (token: string) =>
  call<{ friends: SplitwiseUser[] }>(token, 'get_friends').then((r) => r.friends)

export type ExpenseShare = { userId: number; paidCents: number; owedCents: number }

/**
 * Create one expense.
 *
 * Splitwise rejects an expense whose shares do not sum to the cost, which is
 * why lib/money allocate() guarantees exact sums (FR-18).
 * `groupId: 0` creates a non-group expense (FR-19a).
 */
export async function createExpense(
  token: string,
  input: {
    costCents: number
    description: string
    date?: string | null
    currency?: string
    groupId: number
    shares: ExpenseShare[]
  },
): Promise<{ id: number }> {
  const sumPaid = input.shares.reduce((a, s) => a + s.paidCents, 0)
  const sumOwed = input.shares.reduce((a, s) => a + s.owedCents, 0)
  if (sumPaid !== input.costCents || sumOwed !== input.costCents) {
    // Refuse locally rather than submit something wrong (ACC-3 check 3).
    throw new SplitwiseError(
      400,
      `shares do not sum to the cost: paid=${sumPaid} owed=${sumOwed} cost=${input.costCents}`,
    )
  }

  const form = new URLSearchParams({
    cost: (input.costCents / 100).toFixed(2),
    description: input.description,
    group_id: String(input.groupId),
    currency_code: input.currency ?? 'USD',
  })
  if (input.date) form.set('date', input.date)

  input.shares.forEach((share, i) => {
    form.set(`users__${i}__user_id`, String(share.userId))
    form.set(`users__${i}__paid_share`, (share.paidCents / 100).toFixed(2))
    form.set(`users__${i}__owed_share`, (share.owedCents / 100).toFixed(2))
  })

  const body = await call<{ expenses?: { id: number }[]; errors?: unknown }>(
    token,
    'create_expense',
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    },
  )

  const created = body.expenses?.[0]
  if (!created) throw new SplitwiseError(502, `create_expense returned no expense`)
  return { id: created.id }
}

/**
 * Where Splitwise sends the user back. Must match the registered app exactly —
 * a trailing slash or the wrong scheme fails with an opaque error.
 */
export function callbackUrl(requestUrl: string): string {
  const base = process.env.APP_URL ?? new URL(requestUrl).origin
  return `${base.replace(/\/$/, '')}/api/auth/callback`
}

export const displayName = (u: SplitwiseUser): string =>
  [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || 'Someone'
