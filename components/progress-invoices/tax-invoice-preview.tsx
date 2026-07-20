import type { ProgressClaimCalculation } from '@/lib/progress-invoices/types'

function money(value: string): string {
  const [whole = '0', cents = '00'] = value.split('.')
  const sign = whole.startsWith('-') ? '-' : ''
  const digits = whole.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}$${digits}.${cents}`
}

export function TaxInvoicePreview({ calculation, taxInvoiceNumber }: { calculation: ProgressClaimCalculation; taxInvoiceNumber: string | null }) {
  const rows = [
    ['Adjusted Contract Ex GST', calculation.adjustedContractExGst],
    ['Adjusted Contract GST', calculation.adjustedContractGst],
    ['Adjusted Contract Inc GST', calculation.adjustedContractIncGst],
    ['Previous Claims Ex GST', calculation.previousClaimsExGst],
    ['Previous Claims GST', calculation.previousClaimsGst],
    ['Previous Claims Inc GST', calculation.previousClaimsIncGst],
    ['This Claim Ex GST', calculation.currentClaimExGst],
    ['This Claim GST', calculation.currentClaimGst],
    ['This Claim Inc GST', calculation.currentClaimIncGst],
    ['Cumulative Inc GST', calculation.cumulativeTargetIncGst],
    ['Remaining Ex GST', calculation.remainingExGst],
    ['Remaining GST', calculation.remainingGst],
    ['Remaining Inc GST', calculation.remainingIncGst],
  ] as const
  return (
    <section className="pbc-card pbc-card--pad" aria-labelledby="claim-preview-heading">
      <div className="pbc-progress-claim-preview-heading">
        <h2 id="claim-preview-heading">Tax Invoice preview</h2>
        <strong className="pbc-progress-draft-mark">DRAFT</strong>
      </div>
      <p>{taxInvoiceNumber ?? 'Number reserved when the Draft is created'}</p>
      <dl className="pbc-progress-detail-list">
        {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}
        <div><dt>Cumulative Progress</dt><dd>{calculation.cumulativePercentage}%</dd></div>
      </dl>
    </section>
  )
}
