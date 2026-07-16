import { NextRequest, NextResponse } from 'next/server'

import {
  classifyJobberInvoiceError,
  listJobberInvoicesForJob,
} from '@/lib/jobber/invoice-gateway'
import { progressJobberExternalIdSchema } from '@/lib/progress-invoices/validators'
import { requireAllowedUser } from '@/lib/security/require-allowed-user'

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

function authorizationStatus(error: string): 401 | 403 {
  return error === 'Authentication required' ? 401 : 403
}

function decodePathId(value: string): string | null {
  try {
    const parsed = progressJobberExternalIdSchema.safeParse(decodeURIComponent(value))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  if ([...request.nextUrl.searchParams.keys()].length > 0) {
    return json({ ok: false, error: 'Invalid request' }, 400)
  }

  const { jobId: rawJobId } = await context.params
  const jobId = decodePathId(rawJobId)
  if (!jobId) return json({ ok: false, error: 'Invalid Jobber job ID' }, 400)

  const auth = await requireAllowedUser()
  if (!auth.ok) return json({ ok: false, error: auth.error }, authorizationStatus(auth.error))

  try {
    const result = await listJobberInvoicesForJob({ jobberJobId: jobId })
    return json({
      ok: true,
      data: {
        accountId: result.accountId,
        jobId,
        invoices: result.invoices.map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          rawStatus: invoice.rawStatus,
          normalizedStatus: invoice.normalizedStatus,
        })),
      },
    }, 200)
  } catch (error) {
    const safe = classifyJobberInvoiceError(error)
    return json({ ok: false, error: safe.message, code: safe.code }, safe.status)
  }
}
