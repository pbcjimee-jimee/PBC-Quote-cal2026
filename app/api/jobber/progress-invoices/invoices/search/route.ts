import { NextRequest, NextResponse } from 'next/server'
import {
  classifyJobberInvoiceError,
  searchJobberInvoiceCandidates,
} from '@/lib/jobber/invoice-gateway'
import { requireAllowedUser } from '@/lib/security/require-allowed-user'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }
const MAX_TERM_LENGTH = 100

export async function GET(request: NextRequest) {
  const term = parseSearchTerm(request)
  if (term === null || !term || term.length > MAX_TERM_LENGTH) {
    return NextResponse.json(
      { ok: false, error: 'Invalid Jobber invoice search term' },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  const allowed = await requireAllowedUser()
  if (!allowed.ok) {
    const status = allowed.error === 'Authentication required' ? 401 : 403
    return NextResponse.json({ ok: false, error: allowed.error }, { status, headers: NO_STORE_HEADERS })
  }

  try {
    const data = await searchJobberInvoiceCandidates({ term })
    return NextResponse.json({ ok: true, data }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    const safe = classifyJobberInvoiceError(error)
    return NextResponse.json({
      ok: false,
      error: safe.message,
      code: safe.code,
    }, { status: safe.status, headers: NO_STORE_HEADERS })
  }
}

function parseSearchTerm(request: NextRequest): string | null {
  const rawQuery = request.nextUrl.search.startsWith('?')
    ? request.nextUrl.search.slice(1)
    : request.nextUrl.search
  const parts = rawQuery.split('&')
  if (parts.length !== 1) return null

  const separatorIndex = parts[0]!.indexOf('=')
  if (separatorIndex < 0 || parts[0]!.slice(0, separatorIndex) !== 'term') return null

  try {
    return decodeURIComponent(parts[0]!.slice(separatorIndex + 1).replace(/\+/g, ' ')).trim()
  } catch {
    return null
  }
}
