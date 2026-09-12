import { NextResponse } from 'next/server'
import { clearSession } from '@/lib/session'
import { appBaseUrl } from '@/lib/splitwise'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  await clearSession()
  return NextResponse.redirect(`${appBaseUrl(req.url)}/`, { status: 303 })
}
