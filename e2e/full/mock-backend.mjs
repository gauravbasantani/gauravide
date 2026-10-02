/**
 * A local stand-in for the two services the server talks to, so the full
 * end-to-end suite exercises every REAL route and server page — including
 * the signed-in dashboard and split page, which the browser-mocked suite
 * cannot reach.
 *
 *   /rest/v1/*          Supabase PostgREST (splits, events, feedback)
 *   /storage/v1/*       Supabase Storage (private receipts bucket)
 *   /api/v3.0/*         Splitwise
 *   /__reset /__state   test control
 *
 * No dependencies. State lives in memory and is reset before every test.
 */
import http from 'node:http'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.MOCK_PORT ?? 4545)

/**
 * Who the stand-in Splitwise says you are, and who your friends are.
 *
 * Overridable so a screenshot run can use neutral sample names instead of
 * anyone's real ones. The defaults are what the test suite asserts against,
 * so leaving MOCK_IDENTITIES unset changes nothing.
 */
const IDENTITIES = process.env.MOCK_IDENTITIES
  ? JSON.parse(process.env.MOCK_IDENTITIES)
  : {
      me: { id: 101, first_name: 'Gaurav', last_name: 'Basantani', email: 'g@example.com' },
      friends: [
        { id: 202, first_name: 'Mayur', last_name: 'Sabankar', email: 'm@example.com' },
        { id: 303, first_name: 'Maya', last_name: 'Patel', email: 'maya@example.com' },
      ],
    }

const ME = IDENTITIES.me
const FRIENDS = IDENTITIES.friends

let state
function reset() {
  state = {
    tables: { splits: [], events: [], feedback: [] },
    buckets: new Set(),
    objects: new Map(),
    groups: [
      { id: 900, name: 'Trip', updated_at: '2026-09-01T00:00:00Z', members: [ME, FRIENDS[0]] },
    ],
    expenses: new Map(),
    calls: [],
    emails: [],
    nextExpenseId: 5000,
    nextGroupId: 7000,
    // Rows are stamped relative to now, not from a fixed date. A hardcoded
    // clock silently ages: once it drifted past seven days the dashboard's
    // "active this week" counted none of them, and a passing suite began
    // failing on a date rather than a change. Start a few hours ago so every
    // fabricated row lands inside every window the metrics look at.
    clock: Date.now() - 3 * 60 * 60 * 1000,
  }
}
reset()

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })

function send(res, status, body, headers = {}) {
  const isBuffer = Buffer.isBuffer(body)
  res.writeHead(status, {
    'content-type': isBuffer ? headers['content-type'] ?? 'application/octet-stream' : 'application/json',
    ...headers,
  })
  res.end(isBuffer ? body : body === undefined ? '' : JSON.stringify(body))
}

/* ─────────────────────────── PostgREST ─────────────────────────── */

function field(row, key) {
  // data->x returns JSON as-is; data->>x returns text.
  if (key.startsWith('data->') && !key.startsWith('data->>')) return row.data?.[key.slice(6)] ?? null
  if (key.startsWith('data->>')) {
    const value = row.data?.[key.slice(7)]
    return value === undefined || value === null ? null : String(value)
  }
  // Plain columns come back as their JSON value (props stays an object), like PostgREST.
  const value = row[key]
  return value === undefined ? null : value
}

function matches(row, params) {
  for (const [key, value] of params) {
    if (['select', 'order', 'limit'].includes(key)) continue
    const actual = field(row, key)
    if (value === 'is.null') {
      if (actual !== null) return false
      continue
    }
    if (!value.startsWith('eq.')) continue
    if (actual === null || String(actual) !== value.slice(3)) return false
  }
  return true
}

function project(row, select) {
  if (!select || select === '*') return row
  return Object.fromEntries(
    select.split(',').map((part) => {
      const [alias, source] = part.includes(':') ? part.split(':') : [part, part]
      return [alias, field(row, source)]
    }),
  )
}

async function postgrest(req, res, url) {
  const table = url.pathname.replace('/rest/v1/', '')
  const rows = state.tables[table]
  if (!rows) return send(res, 404, { message: 'no table' })
  if (!req.headers.authorization || !req.headers.apikey) return send(res, 401, { message: 'no key' })
  const params = [...url.searchParams]
  const returning = String(req.headers.prefer ?? '').includes('return=representation')

  if (req.method === 'GET') {
    let found = rows.filter((row) => matches(row, params))
    const order = url.searchParams.get('order')
    if (order === 'created_at.desc') found = found.sort((a, b) => b.created_at.localeCompare(a.created_at))
    const limit = Number(url.searchParams.get('limit') ?? found.length)
    return send(res, 200, found.slice(0, limit).map((row) => project(row, url.searchParams.get('select'))))
  }

  if (req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}')
    const inserted = (Array.isArray(body) ? body : [body]).map((row) => ({
      id: table === 'events' ? rows.length + 1 : randomUUID(),
      created_at: new Date((state.clock += 1000)).toISOString(),
      ...(table === 'splits' ? { archived_at: null, image_path: null } : {}),
      ...row,
    }))
    rows.push(...inserted)
    return returning ? send(res, 201, inserted) : send(res, 201)
  }

  if (req.method === 'PATCH') {
    const patch = JSON.parse((await readBody(req)).toString() || '{}')
    const updated = rows.filter((row) => matches(row, params))
    updated.forEach((row) => Object.assign(row, patch))
    return returning ? send(res, 200, updated) : send(res, 204)
  }

  if (req.method === 'DELETE') {
    const removed = rows.filter((row) => matches(row, params))
    state.tables[table] = rows.filter((row) => !removed.includes(row))
    return returning ? send(res, 200, removed) : send(res, 204)
  }
  return send(res, 405, {})
}

/* ─────────────────────────── Storage ─────────────────────────── */

async function storage(req, res, url) {
  if (!req.headers.authorization) return send(res, 401, { message: 'no key' })
  if (url.pathname === '/storage/v1/bucket' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString())
    if (body.public !== false) return send(res, 400, { message: 'test expects a private bucket' })
    state.buckets.add(body.id)
    return send(res, 200, { name: body.id })
  }
  const match = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)(?:\/(.*))?$/)
  if (!match) return send(res, 404, { message: 'not found' })
  const [, bucket, path] = match
  if (!state.buckets.has(bucket)) {
    // Mirrors the real service, so the app's create-on-first-use path runs.
    return send(res, 400, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' })
  }
  if (req.method === 'POST' && path) {
    state.objects.set(`${bucket}/${path}`, {
      bytes: await readBody(req),
      type: req.headers['content-type'] ?? 'application/octet-stream',
    })
    return send(res, 200, { Key: `${bucket}/${path}` })
  }
  if (req.method === 'GET' && path) {
    const object = state.objects.get(`${bucket}/${path}`)
    return object ? send(res, 200, object.bytes, { 'content-type': object.type }) : send(res, 404, { message: 'Object not found' })
  }
  if (req.method === 'DELETE' && !path) {
    const { prefixes = [] } = JSON.parse((await readBody(req)).toString())
    prefixes.forEach((p) => state.objects.delete(`${bucket}/${p}`))
    return send(res, 200, prefixes.map((name) => ({ name })))
  }
  return send(res, 405, {})
}

/* ─────────────────────────── Splitwise ─────────────────────────── */

function sharesFrom(form) {
  const users = []
  for (let i = 0; form.has(`users__${i}__user_id`); i++) {
    users.push({
      user_id: Number(form.get(`users__${i}__user_id`)),
      paid_share: form.get(`users__${i}__paid_share`),
      owed_share: form.get(`users__${i}__owed_share`),
    })
  }
  return users
}

function validExpense(form) {
  const cents = (s) => Math.round(Number(s) * 100)
  const users = sharesFrom(form)
  const cost = cents(form.get('cost'))
  const paid = users.reduce((a, u) => a + cents(u.paid_share), 0)
  const owed = users.reduce((a, u) => a + cents(u.owed_share), 0)
  if (paid !== cost || owed !== cost) return `shares do not add up (paid ${paid}, owed ${owed}, cost ${cost})`
  if (!users.some((u) => u.user_id === ME.id) && Number(form.get('group_id')) === 0) {
    return 'You must be involved in a non-group expense'
  }
  return null
}

async function splitwise(req, res, url) {
  if (req.headers.authorization !== 'Bearer test-token') return send(res, 401, { error: 'Invalid API Request: you are not logged in' })
  const route = url.pathname.replace('/api/v3.0/', '')
  const form = req.method === 'POST' ? new URLSearchParams((await readBody(req)).toString()) : new URLSearchParams()
  state.calls.push({ route, form: Object.fromEntries(form) })

  if (route === 'get_current_user') return send(res, 200, { user: ME })
  if (route === 'get_friends') return send(res, 200, { friends: FRIENDS })
  if (route === 'get_groups') return send(res, 200, { groups: [{ id: 0, name: 'Non-group expenses', members: [] }, ...state.groups] })

  if (route === 'create_friend') {
    const friend = { id: 404, first_name: form.get('user_first_name'), last_name: form.get('user_last_name'), email: form.get('user_email') }
    return send(res, 200, { friend })
  }
  if (route === 'create_group') {
    const ids = [...form.keys()].filter((k) => /^users__\d+__user_id$/.test(k)).map((k) => Number(form.get(k)))
    const everyone = [ME, ...FRIENDS]
    const members = [ME, ...everyone.filter((u) => ids.includes(u.id) && u.id !== ME.id)]
    const group = { id: state.nextGroupId++, name: form.get('name'), updated_at: new Date().toISOString(), members }
    state.groups.push(group)
    return send(res, 200, { group })
  }
  if (route === 'add_user_to_group') {
    const group = state.groups.find((g) => g.id === Number(form.get('group_id')))
    const user = FRIENDS.find((f) => f.id === Number(form.get('user_id')))
    if (!group || !user) return send(res, 200, { success: false, errors: { base: ['Unknown group or user'] } })
    if (!group.members.some((m) => m.id === user.id)) group.members.push(user)
    return send(res, 200, { success: true, user })
  }
  if (route === 'create_expense' || route.startsWith('update_expense/')) {
    const problem = validExpense(form)
    // Splitwise reports refusals with 200 OK and an errors object.
    if (problem) return send(res, 200, { expenses: [], errors: { base: [problem] } })
    const id = route === 'create_expense' ? state.nextExpenseId++ : Number(route.split('/')[1])
    if (route !== 'create_expense' && !state.expenses.has(id)) {
      return send(res, 200, { expenses: [], errors: { base: ['Expense not found'] } })
    }
    state.expenses.set(id, {
      id,
      cost: form.get('cost'),
      description: form.get('description'),
      group_id: Number(form.get('group_id')),
      currency_code: form.get('currency_code'),
      date: form.get('date'),
      users: sharesFrom(form),
      deleted: false,
      updates: (state.expenses.get(id)?.updates ?? -1) + 1,
    })
    return send(res, 200, { expenses: [{ id }], errors: {} })
  }
  if (route.startsWith('get_expense/')) {
    const expense = state.expenses.get(Number(route.split('/')[1]))
    if (!expense) return send(res, 404, { errors: { base: ['Expense not found'] } })
    return send(res, 200, {
      expense: {
        id: expense.id,
        cost: expense.cost,
        description: expense.description,
        date: expense.date,
        group_id: expense.group_id,
        currency_code: expense.currency_code,
        updated_at: new Date().toISOString(),
        deleted_at: expense.deleted ? new Date().toISOString() : null,
        users: expense.users.map((u) => ({
          user_id: u.user_id,
          paid_share: u.paid_share,
          owed_share: u.owed_share,
        })),
      },
    })
  }
  if (route.startsWith('delete_expense/')) {
    const expense = state.expenses.get(Number(route.split('/')[1]))
    if (!expense || expense.deleted) return send(res, 200, { success: false, errors: { base: ['Expense not found'] } })
    expense.deleted = true
    return send(res, 200, { success: true })
  }
  return send(res, 404, { error: 'unknown route ' + route })
}

/* ─────────────────────────── Server ─────────────────────────── */

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
      if (url.pathname === '/__health') return send(res, 200, { ok: true })
      if (url.pathname === '/__reset') {
        reset()
        return send(res, 200, { ok: true })
      }
      // Change an expense the way another Splitwise client would, so sync has
      // something real to find.
      if (url.pathname === '/__edit-expense' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)).toString() || '{}')
        const expense = state.expenses.get(Number(body.id))
        if (!expense) return send(res, 404, { message: 'no expense' })
        Object.assign(expense, body.patch ?? {})
        return send(res, 200, expense)
      }
      if (url.pathname === '/__state') {
        return send(res, 200, {
          splits: state.tables.splits,
          events: state.tables.events,
          buckets: [...state.buckets],
          objects: [...state.objects.keys()],
          expenses: [...state.expenses.values()],
          groups: state.groups,
          emails: state.emails,
          calls: state.calls.map((c) => c.route),
        })
      }
      // Stand-in for Resend, so the reset-email flow can be tested end to end.
      if (url.pathname === '/emails' && req.method === 'POST') {
        if (!String(req.headers.authorization ?? '').startsWith('Bearer ')) {
          return send(res, 401, { message: 'no key' })
        }
        const body = JSON.parse((await readBody(req)).toString() || '{}')
        state.emails.push({ to: body.to, subject: body.subject, text: body.text })
        return send(res, 200, { id: 'email_' + state.emails.length })
      }
      if (url.pathname.startsWith('/rest/v1/')) return await postgrest(req, res, url)
      if (url.pathname.startsWith('/storage/v1/')) return await storage(req, res, url)
      if (url.pathname.startsWith('/api/v3.0/')) return await splitwise(req, res, url)
      return send(res, 404, { message: 'unknown path' })
    } catch (error) {
      console.error('[mock]', error)
      send(res, 500, { message: String(error) })
    }
  })
  .listen(PORT, '127.0.0.1', () => console.log(`[mock] listening on ${PORT}`))
