import { NextResponse } from 'next/server'
import { clearSession } from '@/lib/session'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  await clearSession()
  const base = process.env.APP_URL ?? new URL(req.url).origin
  return NextResponse.redirect(`${base}/`, { status: 303 })
}
