import { describe, expect, it } from 'vitest'

import { calculateJobberInvoicePosition } from '@/lib/progress-invoices/jobber-invoice-position'

describe('Jobber invoice position', () => {
  it('reconciles the real Invoice 3023 GST-inclusive balance with stored Jobber receipts', () => {
    expect(calculateJobberInvoicePosition({
      subtotal: '25849.52',
      taxAmount: '2459.70',
      total: '27056.74',
      invoiceBalance: '3759.45',
    }, ['2617.67', '20679.62'])).toEqual({
      subtotalExGst: '25849.52',
      derivedSubtotalDifferenceExGst: '-1252.48',
      netInvoiceExGst: '24597.04',
      gst: '2459.70',
      totalIncGst: '27056.74',
      appliedAgainstInvoiceIncGst: '23297.29',
      netLedgerReceiptsIncGst: '23297.29',
      balanceIncGst: '3759.45',
      balanceFromLedgerIncGst: '3759.45',
      balanceVarianceIncGst: '0.00',
    })
  })

  it('keeps ledger receipts unknown when payment evidence was not supplied', () => {
    const position = calculateJobberInvoicePosition({
      subtotal: '100.00',
      taxAmount: '10.00',
      total: '110.00',
      invoiceBalance: '35.00',
    })

    expect(position.appliedAgainstInvoiceIncGst).toBe('75.00')
    expect(position.netLedgerReceiptsIncGst).toBeNull()
    expect(position.balanceFromLedgerIncGst).toBeNull()
    expect(position.balanceVarianceIncGst).toBeNull()
  })

  it('distinguishes explicit zero ledger evidence and nets reversals', () => {
    const zeroLedger = calculateJobberInvoicePosition({
      subtotal: '100.00', taxAmount: '10.00', total: '110.00', invoiceBalance: '35.00',
    }, [])
    const netReversal = calculateJobberInvoicePosition({
      subtotal: '100.00', taxAmount: '10.00', total: '110.00', invoiceBalance: '35.00',
    }, ['100.00', '-25.00'])

    expect(zeroLedger.netLedgerReceiptsIncGst).toBe('0.00')
    expect(zeroLedger.balanceVarianceIncGst).toBe('-75.00')
    expect(netReversal.netLedgerReceiptsIncGst).toBe('75.00')
    expect(netReversal.balanceVarianceIncGst).toBe('0.00')
  })

  it('supports a positive derived adjustment and a credit balance', () => {
    const position = calculateJobberInvoicePosition({
      subtotal: '100.00',
      taxAmount: '15.00',
      total: '165.00',
      invoiceBalance: '-10.00',
    })

    expect(position.derivedSubtotalDifferenceExGst).toBe('50.00')
    expect(position.netInvoiceExGst).toBe('150.00')
    expect(position.appliedAgainstInvoiceIncGst).toBe('175.00')
  })

  it('preserves unavailable source amounts and exposes a one-cent ledger variance', () => {
    expect(calculateJobberInvoicePosition({
      subtotal: null, taxAmount: null, total: null, invoiceBalance: null,
    })).toEqual({
      subtotalExGst: null,
      derivedSubtotalDifferenceExGst: null,
      netInvoiceExGst: null,
      gst: null,
      totalIncGst: null,
      appliedAgainstInvoiceIncGst: null,
      netLedgerReceiptsIncGst: null,
      balanceIncGst: null,
      balanceFromLedgerIncGst: null,
      balanceVarianceIncGst: null,
    })

    expect(calculateJobberInvoicePosition({
      subtotal: '100.00', taxAmount: '10.00', total: '110.00', invoiceBalance: '10.01',
    }, ['100.00']).balanceVarianceIncGst).toBe('0.01')
  })
})
