import { NextResponse } from 'next/server'
import { endAdminSession } from '@/lib/adminAuth'
import { appBaseUrl } from '@/lib/splitwise'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  await endAdminSession()
  return NextResponse.redirect(`${appBaseUrl(req.url)}/admin/login`, { status: 303 })
}
