import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { ProgressInvoiceSeriesDetailView } from '@/components/progress-invoices/series-detail'
import type { ProgressInvoiceSeriesWorkspaceDto } from '@/lib/progress-invoices/workspace-service'

import { workspaceFixture } from './support/progress-invoice-workspace-fixture'

describe('Adjustment register', () => {
  it('offers Draft lifecycle and Approved correction without Retention', () => {
    const workspace: ProgressInvoiceSeriesWorkspaceDto = {
      ...workspaceFixture,
      adjustments: [
        { id: '11111111-1111-4111-8111-111111111111', type: 'credit', status: 'draft', effectiveDate: '2026-07-20', displayOrder: 1, description: 'Allowance', amountExGst: '10.10', gstRate: '0.10', reason: null, version: 1 },
        { id: '22222222-2222-4222-8222-222222222222', type: 'variation', status: 'approved', effectiveDate: '2026-07-20', displayOrder: 2, description: 'Extra work', amountExGst: '20.20', gstRate: '0.10', reason: null, version: 2 },
      ],
    }
    const markup = renderToStaticMarkup(createElement(ProgressInvoiceSeriesDetailView, {
      workspace,
      historyResult: { ok: true, data: { events: [], nextCursor: null } },
    }))

    for (const control of ['Add adjustment', 'Edit', 'Reject', 'Approve', 'Correct']) {
      expect(markup).toContain(control)
    }
    expect(markup).toContain('Fixed GST 10%')
    expect(markup).not.toMatch(/Retention/i)
  })
})
