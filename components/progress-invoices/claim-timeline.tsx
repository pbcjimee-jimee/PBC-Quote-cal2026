import type { ProgressInvoiceClaimListItemDto } from '@/lib/progress-invoices/workspace-service'

function formatMoney(value: string): string {
  const [whole, cents] = value.split('.')
  const sign = whole?.startsWith('-') ? '-' : ''
  const digits = (whole ?? '0').replace('-', '')
  return `${sign}$${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents ?? '00'}`
}

export function ClaimTimeline({ claims }: { claims: readonly ProgressInvoiceClaimListItemDto[] }) {
  if (claims.length === 0) return <p className="pbc-progress-empty">No claims issued.</p>

  return (
    <div className="pbc-progress-table-scroll" tabIndex={0} aria-label="Claim timeline table">
      <table className="pbc-progress-detail-table">
        <caption>Claim timeline</caption>
        <thead>
          <tr>
            <th scope="col">Tax Invoice</th>
            <th scope="col">Status</th>
            <th scope="col">Issue date</th>
            <th scope="col">Due date</th>
            <th scope="col">Current claim Ex GST</th>
            <th scope="col">GST</th>
            <th scope="col">Current claim Inc GST</th>
            <th scope="col">Progress</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((claim) => {
            const revision = claim.currentRevision
            return (
              <tr key={claim.id}>
                <th scope="row">{claim.taxInvoiceNumber}</th>
                <td>{claim.status}</td>
                <td>{revision?.issueDate ?? 'Not issued'}</td>
                <td>{revision?.dueDate ?? 'Not set'}</td>
                <td>{revision ? formatMoney(revision.currentClaimExGst) : 'Not available'}</td>
                <td>{revision ? formatMoney(revision.currentClaimGst) : 'Not available'}</td>
                <td>{revision ? formatMoney(revision.currentClaimIncGst) : 'Not available'}</td>
                <td>{revision ? `${revision.cumulativePercentage}%` : 'Not available'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
