import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSameOriginGet } from '@/lib/security/request-origin'

export async function GET(request: NextRequest) {
  if (!isSameOriginGet(request)) {
    return NextResponse.redirect(new URL('/login/signout', request.url))
  }
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url))
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ ok: false, error: 'Invalid request origin' }, { status: 403 })
  }

  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url), 303)
}
