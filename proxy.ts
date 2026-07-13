import { NextResponse, type NextRequest } from 'next/server'

// Does NOT import @supabase/ssr here — that package pulls in realtime-js → ws,
// which uses __dirname and crashes in Edge/Proxy Runtime.
// Full session verification happens in server components via createServerClient.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/') {
    return NextResponse.rewrite(new URL('/quotes/new', request.url))
  }

  if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEV_NO_AUTH !== 'false') {
    return NextResponse.next()
  }

  const isAuthPage = pathname === '/login' || pathname.startsWith('/login/')
  const isPublicPath = isAuthPage || pathname.startsWith('/api/')

  // Supabase writes sb-<project-ref>-auth-token when a session exists.
  // Cookie presence is enough to gate routing; server components re-verify.
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/\/\/([^.]+)\./)?.[1] ?? ''
  const hasSession =
    request.cookies.has(`sb-${projectRef}-auth-token`) ||
    request.cookies.has(`sb-${projectRef}-auth-token.0`)

  if (!hasSession && !isPublicPath) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
