import { NextRequest, NextResponse } from 'next/server'

import {
  classifyJobberInvoiceError,
  fetchJobberInvoiceObservation,
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
    const observation = await fetchJobberInvoiceObservation({
      jobberInvoiceId: invoiceId,
      ...(selectedJobberJobId === undefined ? {} : { selectedJobberJobId }),
      ...(selectedJobberPropertyId === undefined ? {} : { selectedJobberPropertyId }),
    })
    return json({
      ok: true,
      data: {
        accountId: observation.accountId,
        invoiceId: observation.invoiceId,
        invoiceNumber: observation.invoiceNumber,
        rawStatus: observation.rawStatus,
        normalizedStatus: observation.normalizedStatus,
        jobberWebUri: observation.jobberWebUri,
        amounts: observation.amounts === null ? null : {
          subtotal: observation.amounts.subtotal,
          taxAmount: observation.amounts.taxAmount,
          total: observation.amounts.total,
          invoiceBalance: observation.amounts.invoiceBalance,
          paymentsTotal: observation.amounts.paymentsTotal,
        },
        issuedDate: observation.issuedDate,
        dueDate: observation.dueDate,
        receivedDate: observation.receivedDate,
        client: observation.client === null ? null : {
          name: observation.client.name,
          companyName: observation.client.companyName,
          emails: [...observation.client.emails],
          phones: observation.client.phones.map((phone) => ({ ...phone })),
        },
        billingAddress: observation.billingAddress === null
          ? null
          : { ...observation.billingAddress },
        jobs: observation.jobs.map(({ id }) => ({ id })),
        properties: observation.properties.map((property) => ({
          id: property.id,
          address: property.address === null ? null : { ...property.address },
        })),
        selectedJobberJobId: observation.selectedJobberJobId,
        selectedJobberPropertyId: observation.selectedJobberPropertyId,
        warnings: observation.warnings.map(({ code }) => ({ code })),
      },
    }, 200)
  } catch (error) {
    const safe = classifyJobberInvoiceError(error)
    return json({ ok: false, error: safe.message, code: safe.code }, safe.status)
  }
}
