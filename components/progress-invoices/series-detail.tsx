import Link from 'next/link'

import type { ActionResult } from '@/lib/actions/types'
import type {
  ProgressInvoiceHistoryPageDto,
  ProgressInvoiceSeriesWorkspaceDto,
} from '@/lib/progress-invoices/workspace-service'
import { calculateJobberInvoicePosition } from '@/lib/progress-invoices/jobber-invoice-position'
import { ClaimTimeline } from './claim-timeline'
import { AdjustmentRegister } from './adjustment-register'
import { HistoryPanel } from './history-panel'
import { PaymentLedger } from './payment-ledger'
import { SeriesEditForm } from './series-edit-form'
import { SeriesVoidDialog } from './series-void-dialog'

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
  const { capabilities } = workspace
  const hasIssuedClaims = workspace.claims.some(
    (claim) => claim.status === 'issued' || claim.originalIssuedAt !== null,
  )
  const hasDraftClaims = workspace.claims.some((claim) => claim.status === 'draft')
  const hasFinalClaim = workspace.claims.some((claim) => claim.kind === 'final')
  const jobberPayments = workspace.payments.filter((payment) => payment.source === 'jobber')
  const hasCompleteJobberPaymentEvidence = jobberPayments
    .every((payment) => payment.currentRevision !== null)
  const jobberReceiptEffects = hasCompleteJobberPaymentEvidence
    ? jobberPayments.flatMap((payment) => (
      payment.currentRevision?.status === 'active'
        ? [payment.currentRevision.effectiveReceiptAmount]
        : []
    ))
    : undefined
  const jobberPosition = observation ? calculateJobberInvoicePosition({
    subtotal: observation.invoiceSubtotal,
    taxAmount: observation.invoiceTax,
    total: observation.invoiceTotal,
    invoiceBalance: observation.invoiceBalance,
  }, jobberReceiptEffects) : null
  const jobberBalanceMismatch = jobberPosition?.balanceVarianceIncGst
    ? jobberPosition.balanceVarianceIncGst !== '0.00'
    : false

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
        <div className="pbc-progress-summary-section">
          <h3>PBC progress billing position</h3>
          <p className="pbc-progress-imported-copy">
            Issued claims and actual receipts are tracked separately. Remaining contract to claim does not subtract deposits.
          </p>
          <dl className="pbc-progress-summary-grid">
            {[
              ['PBC adjusted contract Ex GST', summary.adjustedExGst],
              ['PBC contract GST', summary.adjustedGst],
              ['PBC adjusted contract Inc GST', summary.adjustedIncGst],
              ['Issued PBC claims Inc GST', summary.claimedIncGst],
              ['Actual receipts Inc GST', summary.receivedIncGst],
              ['Outstanding issued claims Inc GST', summary.outstandingIncGst],
              ['Unallocated receipts Inc GST', summary.creditBalanceIncGst],
              ['Remaining contract to claim Inc GST', summary.unclaimedIncGst],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{formatMoney(value!)}</dd>
              </div>
            ))}
            <div><dt>Cumulative progress</dt><dd>{summary.cumulativePercentage}%</dd></div>
          </dl>
        </div>
        {jobberPosition ? (
          <div className="pbc-progress-summary-section">
            <h3>Imported Jobber invoice position</h3>
            <p className="pbc-progress-imported-copy">
              Applied amount is derived from invoice total less balance. The PBC ledger amount uses stored active Jobber receipts.
            </p>
            <dl className="pbc-progress-summary-grid">
              {[
                ['Jobber reported subtotal Ex GST', jobberPosition.subtotalExGst],
                ['Difference to net invoice (derived) Ex GST', jobberPosition.derivedSubtotalDifferenceExGst],
                ['Net invoice (derived) Ex GST', jobberPosition.netInvoiceExGst],
                ['Invoice GST', jobberPosition.gst],
                ['Invoice total Inc GST', jobberPosition.totalIncGst],
                ['Deposits / receipts applied (derived) Inc GST', jobberPosition.appliedAgainstInvoiceIncGst],
                ['Net Jobber receipts in PBC ledger Inc GST', jobberPosition.netLedgerReceiptsIncGst],
                ['Invoice balance Inc GST', jobberPosition.balanceIncGst],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value === null ? '—' : formatMoney(value)}</dd>
                </div>
              ))}
            </dl>
            <p className="pbc-alert pbc-alert--warning pbc-progress-money-basis-note">
              Jobber invoice balance is Inc GST. Do not enter it as Base Contract Ex GST.
            </p>
            {jobberBalanceMismatch ? (
              <p className="pbc-alert pbc-alert--warning">
                Imported Jobber payment records do not reconcile to the observed invoice balance. Review the Payment ledger.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="pbc-card pbc-card--pad" aria-labelledby="progress-claims-heading">
        <div className="pbc-progress-section-heading"><h2 id="progress-claims-heading">Progress Invoices</h2>
          {capabilities.canCreateClaim && !hasFinalClaim ? <Link className="pbc-btn pbc-btn--primary pbc-btn--sm" href={`/progress-invoices/${series.id}/claims/new`}>New Claim</Link> : null}
        </div>
        <ClaimTimeline seriesId={series.id} claims={workspace.claims} />
      </section>

      <section className="pbc-card pbc-card--pad" aria-labelledby="progress-availability-heading">
        <h2 id="progress-availability-heading">Availability</h2>
        <p className="pbc-progress-imported-copy">
          These permissions come from the server and control the actions available on this page.
        </p>
        <dl className="pbc-progress-capability-grid">
          <div>
            <dt>Series editing</dt>
            <dd>{capabilities.canEditSeries ? 'Edit controls available' : 'Read-only for this Series'}</dd>
          </div>
          <div>
            <dt>Base contract editing</dt>
            <dd>{capabilities.canEditBaseContract ? 'Available before the first Claim' : 'Locked after a Claim exists'}</dd>
          </div>
          <div>
            <dt>Direct Series Void</dt>
            <dd>{capabilities.canVoidSeriesDirectly ? 'Direct path available' : 'Direct path unavailable'}</dd>
          </div>
          <div>
            <dt>Claim Void workflow</dt>
            <dd>{capabilities.requiresClaimVoidWorkflow ? 'Required' : 'Not required'}</dd>
          </div>
          <div>
            <dt>Claim creation</dt>
            <dd>
              {workspace.invoiceProfileReady
                ? (capabilities.canCreateClaim ? 'Claim creation available' : 'Claim creation unavailable')
                : (
                  <>
                    Invoice Profile is missing or invalid.{' '}
                    <Link href="/settings/invoice">Configure Invoice Profile</Link> before creating a Claim.
                  </>
                )}
            </dd>
          </div>
          <div>
            <dt>Current document metadata</dt>
            <dd>{capabilities.canDownloadCurrent ? 'Ready metadata available' : 'No current metadata available'}</dd>
          </div>
          <div>
            <dt>Historical document metadata</dt>
            <dd>{capabilities.canDownloadHistorical ? 'Historical metadata available' : 'No historical metadata available'}</dd>
          </div>
        </dl>
      </section>

      <section className="pbc-card pbc-card--pad" aria-labelledby="progress-lifecycle-heading">
        <h2 id="progress-lifecycle-heading">Edit Series defaults</h2>
        {series.status === 'void' ? (
          <p className="pbc-alert pbc-alert--warning">This Void Series is read-only. Its history remains available below.</p>
        ) : (
          <>
            {capabilities.canEditSeries ? (
              <SeriesEditForm
                series={series}
                canEditBaseContract={capabilities.canEditBaseContract}
              />
            ) : <p>Series defaults are read-only.</p>}
            <div className="pbc-formgroup">
              <h3>Void Series</h3>
              {hasIssuedClaims || capabilities.requiresClaimVoidWorkflow ? (
                <p className="pbc-alert pbc-alert--warning">
                  Issued Claim blocks direct Series Void. Use the official Claim Void workflow first.
                </p>
              ) : capabilities.canVoidSeriesDirectly ? (
                <SeriesVoidDialog
                  seriesId={series.id}
                  expectedVersion={series.version}
                  expectedCurrentRevisionSetId={workspace.currentRevisionSet?.id ?? null}
                  expectedCurrentManifestHash={workspace.currentRevisionSet?.revisionManifestHash ?? null}
                  hasDraftClaims={hasDraftClaims}
                />
              ) : <p>Direct Series Void is unavailable.</p>}
            </div>
          </>
        )}
      </section>

      <section className="pbc-card pbc-card--pad" aria-labelledby="progress-jobber-heading">
        <h2 id="progress-jobber-heading">Jobber invoice observation</h2>
        {observation ? (
          <>
            <p className="pbc-progress-imported-copy">Imported on {formatDateTime(observation.fetchedAt)}</p>
            <dl className="pbc-progress-detail-dl">
              <div><dt>Invoice number</dt><dd>{observation.observedInvoiceNumber}</dd></div>
              <div><dt>Status</dt><dd>{statusLabel(observation.normalizedStatus)}</dd></div>
              <div><dt>Issued date</dt><dd>{observation.issuedDate ?? '—'}</dd></div>
              <div><dt>Due date</dt><dd>{observation.dueDate ?? '—'}</dd></div>
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
        <AdjustmentRegister
          seriesId={series.id}
          adjustments={workspace.adjustments}
          readOnly={series.status === 'void'}
        />
      </section>

      <section className="pbc-card pbc-card--pad" aria-labelledby="progress-payments-heading">
        <h2 id="progress-payments-heading">Payments</h2>
        <PaymentLedger
          payments={workspace.payments}
          seriesId={series.id}
          expectedSeriesVersion={series.version}
          readOnly={series.status === 'void'}
        />
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
