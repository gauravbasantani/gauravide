/**
 * Supabase access — server only.
 *
 * The secret key never reaches the browser (SEC-1, DB-7). Every read and
 * write goes through an API route that has already checked ownership against
 * the session cookie (DB-4); RLS with no policy is the deny-all backstop
 * underneath that (DB-3).
 */
const URL_ = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY

export const dbConfigured = Boolean(URL_ && KEY)

type Json = Record<string, unknown>

async function request(path: string, init: RequestInit): Promise<Response> {
  if (!URL_ || !KEY) throw new Error('supabase not configured')
  return fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  })
}

export async function insert(table: string, row: Json): Promise<void> {
  const res = await request(table, {
    method: 'POST',
    body: JSON.stringify(row),
    headers: { prefer: 'return=minimal' },
  })
  if (!res.ok) throw new DbError(`insert ${table} ${res.status}`)
}

export async function selectAll<T>(table: string, limit = 500): Promise<T[]> {
  const params = new URLSearchParams({
    select: '*',
    order: 'created_at.desc',
    limit: String(limit),
  })
  const res = await request(`${table}?${params}`, { method: 'GET' })
  if (!res.ok) throw new DbError(`select all ${table} ${res.status}`)
  return (await res.json()) as T[]
}

export async function selectOwned<T>(table: string, ownerId: string, limit = 50): Promise<T[]> {
  const params = new URLSearchParams({
    select: '*',
    owner_id: `eq.${ownerId}`, // ownership enforced on every read (DB-4)
    order: 'created_at.desc',
    limit: String(limit),
  })
  const res = await request(`${table}?${params}`, { method: 'GET' })
  if (!res.ok) throw new DbError(`select ${table} ${res.status}`)
  return (await res.json()) as T[]
}

export async function selectOneOwned<T>(
  table: string,
  ownerId: string,
  id: string,
): Promise<T | null> {
  const params = new URLSearchParams({
    select: '*',
    owner_id: `eq.${ownerId}`,
    id: `eq.${id}`,
    limit: '1',
  })
  const res = await request(`${table}?${params}`, { method: 'GET' })
  if (!res.ok) throw new DbError(`select one ${table} ${res.status}`)
  const rows = (await res.json()) as T[]
  return rows[0] ?? null
}

export async function updateOwned(
  table: string,
  owner: string,
  id: string,
  patch: Json,
): Promise<boolean> {
  const params = new URLSearchParams({ id: `eq.${id}`, owner_id: `eq.${owner}` })
  const res = await request(`${table}?${params}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
    headers: { prefer: 'return=representation' },
  })
  if (!res.ok) throw new DbError(`update ${table} ${res.status}`)
  return ((await res.json()) as unknown[]).length === 1
}

export async function deleteOwned(table: string, owner: string, id: string): Promise<boolean> {
  const params = new URLSearchParams({ id: `eq.${id}`, owner_id: `eq.${owner}` })
  const res = await request(`${table}?${params}`, {
    method: 'DELETE',
    headers: { prefer: 'return=representation' },
  })
  if (!res.ok) throw new DbError(`delete ${table} ${res.status}`)
  return ((await res.json()) as unknown[]).length === 1
}

/** Distinguishes "the database is cold" from "the query was wrong" (DB-9). */
export class DbError extends Error {
  constructor(detail: string) {
    super(detail)
    this.name = 'DbError'
  }
}
