import type { ProgressInvoiceClaimListItemDto } from '@/lib/progress-invoices/workspace-service'

function formatMoney(value: string): string {
  const [whole, cents] = value.split('.')
  const sign = whole?.startsWith('-') ? '-' : ''
  const digits = (whole ?? '0').replace('-', '')
  const groups: string[] = []
  for (let end = digits.length; end > 0; end -= 3) groups.unshift(digits.slice(Math.max(0, end - 3), end))
  return `${sign}$${groups.join(',')}.${cents ?? '00'}`
}

function formatDateOnly(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year!, month! - 1, day!, 12)))
}

function formatSydneyDate(value: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Sydney',
  }).format(new Date(value))
}

export function ClaimDetail({ claim }: { claim: ProgressInvoiceClaimListItemDto }) {
  const revision = claim.currentRevision
  const state = claim.status.replace(/^./, (letter) => letter.toUpperCase())
  return <article className="pbc-progress-claim-detail">
    <div className="pbc-progress-detail-heading">
      <div><p className="pbc-eyebrow">Tax Invoice</p><h1>{claim.taxInvoiceNumber}</h1></div>
      <span className={`pbc-badge pbc-badge--${claim.status}`}>{state}</span>
    </div>
    <section className="pbc-card pbc-card--pad" aria-labelledby="claim-detail-summary-heading">
      <h2 id="claim-detail-summary-heading">Progress Invoice details</h2>
      <dl className="pbc-progress-summary-grid">
        <div><dt>Created date</dt><dd>{formatSydneyDate(claim.createdAt)}</dd></div>
        <div><dt>Issue date</dt><dd>{revision ? formatDateOnly(revision.issueDate) : '—'}</dd></div>
        <div><dt>Due date</dt><dd>{revision ? formatDateOnly(revision.dueDate) : '—'}</dd></div>
        <div><dt>Claim price Inc GST</dt><dd>{revision ? formatMoney(revision.currentClaimIncGst) : '—'}</dd></div>
        <div><dt>Collected Inc GST</dt><dd>{claim.collectedIncGst === null ? '—' : formatMoney(claim.collectedIncGst)}</dd></div>
        <div><dt>Collected date</dt><dd>{claim.collectedDate ? formatDateOnly(claim.collectedDate) : '—'}</dd></div>
        <div><dt>Outstanding Inc GST</dt><dd>{claim.outstandingIncGst === null ? '—' : formatMoney(claim.outstandingIncGst)}</dd></div>
        <div><dt>Cumulative progress</dt><dd>{revision ? `${revision.cumulativePercentage}%` : '—'}</dd></div>
      </dl>
      {revision ? <dl className="pbc-progress-detail-dl">
        <div><dt>Description</dt><dd>{revision.description}</dd></div>
        <div><dt>Reference</dt><dd>{revision.reference || '—'}</dd></div>
        <div><dt>Revision</dt><dd>{revision.revisionNumber}</dd></div>
      </dl> : null}
      <p className="pbc-alert pbc-alert--warning">
        {state} Progress Invoices are read-only here. Issued edits and Void operations use the coherent Revision workflow.
      </p>
    </section>
  </article>
}
