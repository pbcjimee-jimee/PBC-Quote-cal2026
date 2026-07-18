import Link from 'next/link'

import type { ActionResult } from '@/lib/actions/types'
import type {
  ProgressInvoiceHistoryPageDto,
  ProgressInvoiceSeriesWorkspaceDto,
} from '@/lib/progress-invoices/workspace-service'
import { ClaimTimeline } from './claim-timeline'
import { HistoryPanel } from './history-panel'
import { PaymentLedger } from './payment-ledger'

function formatMoney(value: string): string {
  const [whole, cents] = value.split('.')
  const sign = whole?.startsWith('-') ? '-' : ''
  const digits = (whole ?? '0').replace('-', '')
  return `${sign}$${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents ?? '00'}`
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Sydney',
  }).format(new Date(value))
}

function statusLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

export function ProgressInvoiceSeriesDetailView({
  workspace,
  historyResult,
}: {
  workspace: ProgressInvoiceSeriesWorkspaceDto
  historyResult: ActionResult<ProgressInvoiceHistoryPageDto>
}) {
  const { series, summary, importedJobberObservation: observation } = workspace

  return (
    <div className="pbc-progress-series-detail">
      <div className="pbc-progress-detail-heading">
        <div>
          <p className="pbc-eyebrow">Progress Invoice series</p>
          <h1>{series.acceptedNumberingBase ?? series.recipientName}</h1>
          <p>{series.recipientCompany || series.recipientName} · {series.siteName}</p>
        </div>
        <span className="pbc-badge">{statusLabel(series.status)}</span>
      </div>

      <section className="pbc-card pbc-card--pad" aria-labelledby="progress-summary-heading">
        <h2 id="progress-summary-heading">Summary</h2>
        <dl className="pbc-progress-summary-grid">
          {[
            ['Adjusted contract Ex GST', summary.adjustedExGst],
            ['Adjusted GST', summary.adjustedGst],
            ['Adjusted contract Inc GST', summary.adjustedIncGst],
            ['Claimed Inc GST', summary.claimedIncGst],
            ['Received Inc GST', summary.receivedIncGst],
            ['Outstanding Inc GST', summary.outstandingIncGst],
            ['Credit balance Inc GST', summary.creditBalanceIncGst],
            ['Unclaimed Inc GST', summary.unclaimedIncGst],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{formatMoney(value!)}</dd>
            </div>
          ))}
          <div><dt>Cumulative progress</dt><dd>{summary.cumulativePercentage}%</dd></div>
        </dl>
      </section>

      <section className="pbc-card pbc-card--pad" aria-labelledby="progress-jobber-heading">
        <h2 id="progress-jobber-heading">Jobber invoice observation</h2>
        {observation ? (
          <>
            <p className="pbc-progress-imported-copy">Imported on {formatDateTime(observation.fetchedAt)}</p>
            <dl className="pbc-progress-detail-dl">
              <div><dt>Invoice number</dt><dd>{observation.observedInvoiceNumber}</dd></div>
              <div><dt>Status</dt><dd>{statusLabel(observation.normalizedStatus)}</dd></div>
              <div><dt>Invoice subtotal Ex GST</dt><dd>{observation.invoiceSubtotal ? formatMoney(observation.invoiceSubtotal) : '—'}</dd></div>
              <div><dt>Invoice tax GST</dt><dd>{observation.invoiceTax ? formatMoney(observation.invoiceTax) : '—'}</dd></div>
              <div><dt>Invoice total Inc GST</dt><dd>{observation.invoiceTotal ? formatMoney(observation.invoiceTotal) : '—'}</dd></div>
              <div><dt>Invoice balance Inc GST</dt><dd>{observation.invoiceBalance ? formatMoney(observation.invoiceBalance) : '—'}</dd></div>
            </dl>
          </>
        ) : <p className="pbc-progress-empty">No Jobber invoice was imported for this series.</p>}
      </section>

      <section className="pbc-card pbc-card--pad" aria-labelledby="progress-recipient-heading">
        <h2 id="progress-recipient-heading">Recipient and site</h2>
        <div className="pbc-progress-detail-columns">
          <dl className="pbc-progress-detail-dl">
            <div><dt>Recipient</dt><dd>{series.recipientName}</dd></div>
            <div><dt>Company</dt><dd>{series.recipientCompany || '—'}</dd></div>
            <div><dt>Billing address</dt><dd>{series.recipientAddress}</dd></div>
            <div><dt>Email</dt><dd>{series.recipientEmail || '—'}</dd></div>
            <div><dt>Phone</dt><dd>{series.recipientPhone || '—'}</dd></div>
            <div><dt>Recipient ABN</dt><dd>{series.recipientAbn || '—'}</dd></div>
          </dl>
          <dl className="pbc-progress-detail-dl">
            <div><dt>Site</dt><dd>{series.siteName}</dd></div>
            <div><dt>Site address</dt><dd>{series.siteAddress}</dd></div>
            <div><dt>Reference</dt><dd>{series.reference || '—'}</dd></div>
            <div><dt>Description</dt><dd>{series.defaultDescription}</dd></div>
          </dl>
        </div>
      </section>

      <section className="pbc-card pbc-card--pad" aria-labelledby="progress-adjustments-heading">
        <h2 id="progress-adjustments-heading">Adjustments</h2>
        {workspace.adjustments.length === 0 ? <p className="pbc-progress-empty">No adjustments.</p> : (
          <div className="pbc-progress-table-scroll" tabIndex={0} aria-label="Adjustments table">
            <table className="pbc-progress-detail-table">
              <caption>Variation and Credit adjustments</caption>
              <thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Description</th><th scope="col">Amount Ex GST</th><th scope="col">Status</th></tr></thead>
              <tbody>{workspace.adjustments.map((adjustment) => (
                <tr key={adjustment.id}><td>{adjustment.effectiveDate}</td><td>{statusLabel(adjustment.type)}</td><th scope="row">{adjustment.description}</th><td>{formatMoney(adjustment.amountExGst)}</td><td>{statusLabel(adjustment.status)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="pbc-card pbc-card--pad" aria-labelledby="progress-claims-heading">
        <h2 id="progress-claims-heading">Claims</h2>
        <ClaimTimeline claims={workspace.claims} />
      </section>

      <section className="pbc-card pbc-card--pad" aria-labelledby="progress-payments-heading">
        <h2 id="progress-payments-heading">Payments</h2>
        <PaymentLedger payments={workspace.payments} />
      </section>

      <section className="pbc-card pbc-card--pad" aria-labelledby="progress-documents-heading">
        <h2 id="progress-documents-heading">Documents</h2>
        {workspace.readyDocuments.length === 0 ? <p className="pbc-progress-empty">No ready documents.</p> : (
          <div className="pbc-progress-table-scroll" tabIndex={0} aria-label="Ready document metadata table">
            <table className="pbc-progress-detail-table">
              <caption>Ready document metadata</caption>
              <thead><tr><th scope="col">Format</th><th scope="col">Scope</th><th scope="col">Version</th><th scope="col">Generated</th><th scope="col">Set</th></tr></thead>
              <tbody>{workspace.readyDocuments.map((document) => (
                <tr key={document.id}><th scope="row">{document.format.toUpperCase()}</th><td>{statusLabel(document.scope)}</td><td>{document.rendererVersion}</td><td>{formatDateTime(document.generatedAt)}</td><td>{document.isCurrent ? 'Current' : 'Historical'}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section id="progress-invoice-history" className="pbc-card pbc-card--pad" aria-labelledby="progress-history-heading">
        <h2 id="progress-history-heading">History</h2>
        <HistoryPanel seriesId={series.id} result={historyResult} />
      </section>

      <Link className="pbc-btn pbc-btn--secondary pbc-progress-detail-back" href="/progress-invoices">
        Back to Progress Invoices
      </Link>
    </div>
  )
}
