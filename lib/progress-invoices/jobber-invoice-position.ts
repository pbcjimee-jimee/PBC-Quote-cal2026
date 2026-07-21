import Decimal from 'decimal.js'

interface JobberInvoiceAmountInput {
  subtotal: string | null
  taxAmount: string | null
  total: string | null
  invoiceBalance: string | null
}

export interface JobberInvoicePosition {
  subtotalExGst: string | null
  derivedSubtotalDifferenceExGst: string | null
  netInvoiceExGst: string | null
  gst: string | null
  totalIncGst: string | null
  appliedAgainstInvoiceIncGst: string | null
  netLedgerReceiptsIncGst: string | null
  balanceIncGst: string | null
  balanceFromLedgerIncGst: string | null
  balanceVarianceIncGst: string | null
}

function decimal(value: string | null): Decimal | null {
  return value === null ? null : new Decimal(value)
}

function money(value: Decimal | null): string | null {
  return value === null ? null : value.toFixed(2)
}

export function calculateJobberInvoicePosition(
  amounts: JobberInvoiceAmountInput,
  jobberReceiptEffects?: readonly string[],
): JobberInvoicePosition {
  const grossSubtotal = decimal(amounts.subtotal)
  const gst = decimal(amounts.taxAmount)
  const total = decimal(amounts.total)
  const balance = decimal(amounts.invoiceBalance)
  const netInvoice = total !== null && gst !== null ? total.minus(gst) : null
  const subtotalAdjustment = netInvoice !== null && grossSubtotal !== null
    ? netInvoice.minus(grossSubtotal)
    : null
  const appliedAgainstInvoice = total !== null && balance !== null
    ? total.minus(balance)
    : null
  const collected = jobberReceiptEffects === undefined
    ? null
    : jobberReceiptEffects.reduce(
      (sum, receipt) => sum.plus(new Decimal(receipt)),
      new Decimal(0),
    )
  const balanceFromLedger = total !== null && collected !== null
    ? total.minus(collected)
    : null
  const balanceVariance = balance !== null && balanceFromLedger !== null
    ? balance.minus(balanceFromLedger)
    : null

  return {
    subtotalExGst: money(grossSubtotal),
    derivedSubtotalDifferenceExGst: money(subtotalAdjustment),
    netInvoiceExGst: money(netInvoice),
    gst: money(gst),
    totalIncGst: money(total),
    appliedAgainstInvoiceIncGst: money(appliedAgainstInvoice),
    netLedgerReceiptsIncGst: money(collected),
    balanceIncGst: money(balance),
    balanceFromLedgerIncGst: money(balanceFromLedger),
    balanceVarianceIncGst: money(balanceVariance),
  }
}
