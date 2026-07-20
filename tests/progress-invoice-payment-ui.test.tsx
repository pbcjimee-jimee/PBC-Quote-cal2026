import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { PaymentLedger } from '@/components/progress-invoices/payment-ledger'
import type { ProgressInvoicePaymentListItemDto } from '@/lib/progress-invoices/workspace-service'

const payments: ProgressInvoicePaymentListItemDto[] = [
  {
    id: '11111111-1111-4111-8111-111111111111', source: 'jobber',
    matchedManualPaymentId: '22222222-2222-4222-8222-222222222222', version: 3,
    currentRevision: {
      id: '33333333-3333-4333-8333-333333333333', revisionNumber: 2,
      receivedDate: '2026-07-20', observedAmount: '500.00', effectiveReceiptAmount: '500.00',
      paymentMethod: 'Card', reference: 'J-1', externalStatus: 'PAID', externalUpdatedAt: null,
      syncState: 'observed', status: 'active', sourceObservedAt: null, reason: null,
      createdAt: '2026-07-20T00:00:00Z',
    },
  },
  {
    id: '22222222-2222-4222-8222-222222222222', source: 'manual',
    matchedManualPaymentId: null, version: 2,
    currentRevision: {
      id: '44444444-4444-4444-8444-444444444444', revisionNumber: 2,
      receivedDate: '2026-07-20', observedAmount: '500.00', effectiveReceiptAmount: '0.00',
      paymentMethod: 'EFT', reference: 'M-1', externalStatus: null, externalUpdatedAt: null,
      syncState: 'manual', status: 'superseded', sourceObservedAt: null, reason: 'Matched',
      createdAt: '2026-07-20T00:00:00Z',
    },
  },
]

describe('PaymentLedger', () => {
  it('renders source/state badges and never gives Jobber mutation controls', () => {
    const markup = renderToStaticMarkup(createElement(PaymentLedger, {
      payments,
      seriesId: '55555555-5555-4555-8555-555555555555',
      expectedSeriesVersion: 4,
      readOnly: false,
    } as never))

    expect(markup).toContain('Matched')
    expect(markup).toContain('Superseded')
    const jobberRow = markup.match(/<tr[^>]*>[\s\S]*?Jobber[\s\S]*?<\/tr>/)?.[0] ?? ''
    expect(jobberRow).not.toMatch(/Replace|Void/)
    expect(markup).toContain('Undo Match')
  })

  it('renders only read-only ledger rows for a Void Series', () => {
    const markup = renderToStaticMarkup(createElement(PaymentLedger, {
      payments,
      seriesId: '55555555-5555-4555-8555-555555555555',
      expectedSeriesVersion: 4,
      readOnly: true,
    } as never))

    expect(markup).not.toMatch(/Replace|Void payment|Confirm Match|Undo Match/)
    expect(markup).not.toMatch(/Retention/i)
  })
})
