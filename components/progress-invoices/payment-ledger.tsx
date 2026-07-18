import type { ProgressInvoicePaymentListItemDto } from '@/lib/progress-invoices/workspace-service'

function formatMoney(value: string): string {
  const [whole, cents] = value.split('.')
  const sign = whole?.startsWith('-') ? '-' : ''
  const digits = (whole ?? '0').replace('-', '')
  return `${sign}$${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents ?? '00'}`
}

export function PaymentLedger({ payments }: { payments: readonly ProgressInvoicePaymentListItemDto[] }) {
  if (payments.length === 0) return <p className="pbc-progress-empty">No payments recorded.</p>

  return (
    <div className="pbc-progress-table-scroll" tabIndex={0} aria-label="Payment ledger table">
      <table className="pbc-progress-detail-table">
        <caption>Payment ledger</caption>
        <thead>
          <tr>
            <th scope="col">Source</th>
            <th scope="col">Received date</th>
            <th scope="col">Observed Inc GST</th>
            <th scope="col">Effective receipt Inc GST</th>
            <th scope="col">Status</th>
            <th scope="col">Method</th>
            <th scope="col">Reference</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => {
            const revision = payment.currentRevision
            return (
              <tr key={payment.id}>
                <th scope="row">{payment.source === 'jobber' ? 'Jobber' : 'Manual'}</th>
                <td>{revision?.receivedDate ?? 'Not available'}</td>
                <td>{revision ? formatMoney(revision.observedAmount) : 'Not available'}</td>
                <td>{revision ? formatMoney(revision.effectiveReceiptAmount) : 'Not available'}</td>
                <td>{revision?.status ?? 'Unavailable'}</td>
                <td>{revision?.paymentMethod ?? '—'}</td>
                <td>{revision?.reference ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
