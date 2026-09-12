/**
 * Splitwise API client — server only (ARCHITECTURE.md §3.3).
 *
 * OAuth 2.0. The 1.0a endpoints Splitwise also publishes are the older
 * three-legged flow and are not used.
 *
 * Requires an active Splitwise Pro subscription on the DEVELOPER's account to
 * register the app at all (requirements.md §4).
 */
// Splitwise keeps its OAuth 2.0 endpoints on www.splitwise.com. The REST API
// remains on secure.splitwise.com below. Using secure for OAuth returns a 404.
const AUTHORIZE_URL = 'https://www.splitwise.com/oauth/authorize'
const TOKEN_URL = 'https://www.splitwise.com/oauth/token'
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
  /** Splitwise refused the request and said why — safe to show the user. */
  get refusal(): string | null {
    return this.status === 422 ? this.message : null
  }
}

/**
 * Splitwise answers many failures with 200 OK and an `errors` object
 * ({ base: ["..."], shares: ["..."] }). Flatten it to one readable line.
 */
export function splitwiseErrorText(errors: unknown): string | null {
  const parts: string[] = []
  const walk = (value: unknown) => {
    if (typeof value === 'string') parts.push(value)
    else if (Array.isArray(value)) value.forEach(walk)
    else if (value && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk(errors)
  const text = parts.join(' ').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, 200) : null
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

function splitName(name: string): { first: string; last: string } {
  const [first = 'Someone', ...rest] = name.trim().split(/\s+/)
  return { first, last: rest.join(' ') }
}

/** Add a real Splitwise friend, or invite them if the email is new. */
export async function createFriend(
  token: string,
  input: { name: string; email: string },
): Promise<SplitwiseUser> {
  const { first, last } = splitName(input.name)
  const body = await call<{ friend?: SplitwiseUser }>(token, 'create_friend', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      user_email: input.email,
      user_first_name: first,
      user_last_name: last,
    }),
  })
  if (!body.friend) throw new SplitwiseError(502, 'create_friend returned no friend')
  return body.friend
}

export async function createGroup(
  token: string,
  input: { name: string; memberIds: number[] },
): Promise<SplitwiseGroup> {
  const form = new URLSearchParams({ name: input.name, group_type: 'other' })
  input.memberIds.forEach((id, index) => form.set('users__' + index + '__user_id', String(id)))
  const body = await call<{ group?: SplitwiseGroup }>(token, 'create_group', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  })
  if (!body.group) throw new SplitwiseError(502, 'create_group returned no group')
  return body.group
}

/** Adds people one by one so a partial failure can be reported honestly. */
export async function addUsersToGroup(
  token: string,
  groupId: number,
  memberIds: number[],
): Promise<void> {
  for (const userId of memberIds) {
    const body = await call<{ success?: boolean; errors?: unknown }>(token, 'add_user_to_group', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ group_id: String(groupId), user_id: String(userId) }),
    })
    if (!body.success) {
      const reason = splitwiseErrorText(body.errors)
      throw new SplitwiseError(reason ? 422 : 502, reason ?? 'add_user_to_group was not accepted')
    }
  }
}

/** Deletes an expense for every person who can see it in Splitwise. */
export async function deleteExpense(token: string, expenseId: number): Promise<void> {
  const body = await call<{ success?: boolean; errors?: unknown }>(
    token,
    'delete_expense/' + expenseId,
    { method: 'POST' },
  )
  if (!body.success) {
    const reason = splitwiseErrorText(body.errors)
    throw new SplitwiseError(reason ? 422 : 502, reason ?? 'delete_expense was not accepted')
  }
}

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
    /**
     * Present = update that expense in place (`update_expense`). Supplying
     * users replaces every share on it, which is exactly what an edit means.
     */
    expenseId?: number
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
    input.expenseId ? 'update_expense/' + input.expenseId : 'create_expense',
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    },
  )

  // 200 OK is not success: an `errors` object means nothing was created.
  const refusal = splitwiseErrorText(body.errors)
  if (refusal) throw new SplitwiseError(422, refusal)
  const created = body.expenses?.[0]
  if (!created) throw new SplitwiseError(502, `create_expense returned no expense`)
  return { id: created.id }
}

/**
 * Where Splitwise sends the user back. Must match the registered app exactly —
 * a trailing slash or the wrong scheme fails with an opaque error.
 */
export function callbackUrl(requestUrl: string): string {
  return `${appBaseUrl(requestUrl)}/api/auth/callback`
}

/**
 * APP_URL is the registered public URL in production. In local development,
 * however, the app may be running on a test port (for example 3210), so use
 * the actual request origin instead of redirecting OAuth back to stale :3000.
 */
export function appBaseUrl(requestUrl: string): string {
  const request = new URL(requestUrl)
  const configured = process.env.APP_URL?.trim()
  if (!configured) return request.origin

  let app: URL
  try {
    app = new URL(configured)
  } catch {
    return request.origin
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
  if (localHosts.has(app.hostname) && localHosts.has(request.hostname)) return request.origin
  return app.origin
}

export const displayName = (u: SplitwiseUser): string =>
  [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || 'Someone'
