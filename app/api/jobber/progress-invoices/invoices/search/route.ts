import { NextRequest, NextResponse } from 'next/server'
import { searchJobberInvoiceCandidates } from '@/lib/jobber/invoice-gateway'
import { requireAllowedUser } from '@/lib/security/require-allowed-user'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }
const MAX_TERM_LENGTH = 100

export async function GET(request: NextRequest) {
  const term = request.nextUrl.searchParams.get('term')?.trim() ?? ''
  if (!term || term.length > MAX_TERM_LENGTH) {
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
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to search Jobber invoices',
    }, { status: 502, headers: NO_STORE_HEADERS })
  }
}
