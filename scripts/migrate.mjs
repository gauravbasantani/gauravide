#!/usr/bin/env node
/**
 * Apply db/migrations/*.sql in order.
 *
 * Supabase's REST API cannot run DDL, so this connects to Postgres directly.
 * Needs SUPABASE_DB_URL (Supabase → Settings → Database → Connection string,
 * with [YOUR-PASSWORD] replaced) or SUPABASE_DB_PASSWORD.
 *
 * Migrations are never edited after they run. A new change is a new file.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Load .env.local without a dependency.
const env = {}
try {
  for (const line of readFileSync(join(root, '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
} catch {
  /* no .env.local — fall back to the real environment */
}

const get = (k) => process.env[k] || env[k]

function connectionString() {
  const direct = get('SUPABASE_DB_URL')
  if (direct) return direct

  // Pasting the whole connection string into the password field is an easy
  // mistake to make. Accept it rather than failing with "auth failed".
  const password = get('SUPABASE_DB_PASSWORD') ?? ''
  if (password.startsWith('postgresql://') || password.startsWith('postgres://')) {
    console.warn('note: SUPABASE_DB_PASSWORD holds a connection string — using it as the URL\n')
    return password
  }

  const url = get('SUPABASE_URL')
  if (!url || !password) return null

  // Direct connection. Deliberately NOT the pooler: pooler hostnames embed a
  // region we cannot know from the project URL, and guessing it produces a
  // confusing "password authentication failed" instead of a clear error.
  const ref = new URL(url).hostname.split('.')[0]
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`
}

const conn = connectionString()
if (!conn) {
  console.error(`
Cannot connect: no database credentials.

Add ONE of these to .env.local:

  SUPABASE_DB_URL=postgresql://...       (Supabase → Settings → Database →
                                          Connection string → URI, with
                                          [YOUR-PASSWORD] filled in)
  SUPABASE_DB_PASSWORD=...               (the password shown when you
                                          created the project)

Or paste db/migrations/*.sql into the Supabase SQL editor by hand — it is
one short file and does the same thing.
`)
  process.exit(1)
}

const dir = join(root, 'db/migrations')
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
if (files.length === 0) {
  console.log('no migrations to apply')
  process.exit(0)
}

for (const file of files) {
  process.stdout.write(`applying ${file} … `)
  try {
    execFileSync('psql', [conn, '-v', 'ON_ERROR_STOP=1', '-q', '-f', join(dir, file)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    console.log('ok')
  } catch (err) {
    console.log('FAILED')
    const detail = String(err.stderr ?? err.message)
    console.error(detail.slice(0, 600))
    if (/password authentication failed/i.test(detail)) {
      console.error(
        '\nThe password in the connection string is wrong. Supabase → Settings →\n' +
          'Database → Reset database password, then update SUPABASE_DB_URL.',
      )
    } else if (/could not translate host|Network is unreachable|no route to host/i.test(detail)) {
      console.error(
        '\nCannot reach the host. Direct connections are IPv6-only on Supabase;\n' +
          'use the Session pooler connection string instead (Settings → Database →\n' +
          'Connection string → Session pooler).',
      )
    }
    process.exit(1)
  }
}

console.log(`\n✓ ${files.length} migration(s) applied`)
