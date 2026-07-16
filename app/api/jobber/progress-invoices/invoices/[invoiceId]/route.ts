import { NextRequest, NextResponse } from 'next/server'

import {
  classifyJobberInvoiceError,
  fetchJobberInvoiceSelectionPreview,
} from '@/lib/jobber/invoice-gateway'
import { progressJobberExternalIdSchema } from '@/lib/progress-invoices/validators'
import { requireAllowedUser } from '@/lib/security/require-allowed-user'

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }
const SELECTOR_KEYS = new Set(['selectedJobberJobId', 'selectedJobberPropertyId'])

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

function authorizationStatus(error: string): 401 | 403 {
  return error === 'Authentication required' ? 401 : 403
}

function decodeExternalId(value: string): string | null {
  try {
    const parsed = progressJobberExternalIdSchema.safeParse(decodeURIComponent(value))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function optionalSelector(request: NextRequest, key: string): string | null | undefined {
  const values = request.nextUrl.searchParams.getAll(key)
  if (values.length === 0) return undefined
  if (values.length !== 1) return null
  return decodeExternalId(values[0] ?? '')
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ invoiceId: string }> },
): Promise<NextResponse> {
  const unknownKey = [...request.nextUrl.searchParams.keys()].some((key) => !SELECTOR_KEYS.has(key))
  const { invoiceId: rawInvoiceId } = await context.params
  const invoiceId = decodeExternalId(rawInvoiceId)
  const selectedJobberJobId = optionalSelector(request, 'selectedJobberJobId')
  const selectedJobberPropertyId = optionalSelector(request, 'selectedJobberPropertyId')
  if (unknownKey || !invoiceId || selectedJobberJobId === null || selectedJobberPropertyId === null) {
    return json({ ok: false, error: 'Invalid request' }, 400)
  }

  const auth = await requireAllowedUser()
  if (!auth.ok) return json({ ok: false, error: auth.error }, authorizationStatus(auth.error))

  try {
    const preview = await fetchJobberInvoiceSelectionPreview({
      jobberInvoiceId: invoiceId,
      ...(selectedJobberJobId === undefined ? {} : { selectedJobberJobId }),
      ...(selectedJobberPropertyId === undefined ? {} : { selectedJobberPropertyId }),
    })
    return json({
      ok: true,
      data: {
        invoiceId: preview.invoiceId,
        invoiceNumber: preview.invoiceNumber,
        rawStatus: preview.rawStatus,
        normalizedStatus: preview.normalizedStatus,
        jobberWebUri: preview.jobberWebUri,
        amounts: preview.amounts,
        issuedDate: preview.issuedDate,
        dueDate: preview.dueDate,
        receivedDate: preview.receivedDate,
        client: preview.client === null ? null : {
          name: preview.client.name,
          companyName: preview.client.companyName,
          emails: [...preview.client.defaultEmails],
          phones: preview.client.phones.map((phone) => ({ ...phone })),
        },
        billingAddress: preview.billingAddress,
        jobs: preview.jobs.map(({ id }) => ({ id })),
        properties: preview.properties.map(({ id, address }) => ({ id, address })),
        selectedJobberJobId: preview.selectedJobberJobId,
        selectedJobberPropertyId: preview.selectedJobberPropertyId,
        selectionRequired: {
          job: preview.jobSelectionRequired,
          property: preview.propertySelectionRequired,
        },
      },
    }, 200)
  } catch (error) {
    const safe = classifyJobberInvoiceError(error)
    return json({ ok: false, error: safe.message, code: safe.code }, safe.status)
  }
}
