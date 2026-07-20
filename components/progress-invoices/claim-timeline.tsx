'use client'

import { useRouter } from 'next/navigation'

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
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(year!, month! - 1, day!, 12)))
}

function formatSydneyDate(value: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney',
  }).format(new Date(value))
}

function statusLabel(value: string): string {
  return value.replace(/^./, (letter) => letter.toUpperCase())
}

export function ClaimTimeline({ seriesId, claims }: { seriesId: string; claims: readonly ProgressInvoiceClaimListItemDto[] }) {
  const router = useRouter()
  if (claims.length === 0) return <p className="pbc-progress-empty">No Progress Invoices created.</p>

  return (
    <div className="pbc-progress-table-scroll" tabIndex={0} aria-label="Progress Invoices table">
      <table className="pbc-progress-detail-table pbc-progress-claim-table">
        <caption>Progress Invoices</caption>
        <thead><tr>
          <th scope="col">Tax Invoice number</th><th scope="col">Status</th><th scope="col">Created date</th>
          <th scope="col">Issue date</th><th scope="col">Due date</th><th scope="col">Claim price Inc GST</th>
          <th scope="col">Collected Inc GST</th><th scope="col">Collected date</th>
          <th scope="col">Outstanding Inc GST</th><th scope="col">Cumulative progress</th>
        </tr></thead>
        <tbody>{claims.map((claim) => {
          const revision = claim.currentRevision
          const href = `/progress-invoices/${seriesId}/claims/${claim.id}`
          const navigate = () => router.push(href)
          return <tr key={claim.id} className="pbc-progress-claim-row" role="link" tabIndex={0}
            aria-label={`Open Tax Invoice ${claim.taxInvoiceNumber}`}
            onClick={navigate}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              navigate()
            }}>
            <th scope="row">{claim.taxInvoiceNumber}</th>
            <td><span className={`pbc-badge pbc-badge--${claim.status}`}>{statusLabel(claim.status)}</span></td>
            <td>{formatSydneyDate(claim.createdAt)}</td>
            <td>{revision ? formatDateOnly(revision.issueDate) : '—'}</td>
            <td>{revision ? formatDateOnly(revision.dueDate) : '—'}</td>
            <td>{revision ? formatMoney(revision.currentClaimIncGst) : '—'}</td>
            <td>{claim.collectedIncGst === null ? '—' : formatMoney(claim.collectedIncGst)}</td>
            <td>{claim.collectedDate ? formatDateOnly(claim.collectedDate) : '—'}</td>
            <td>{claim.outstandingIncGst === null ? '—' : formatMoney(claim.outstandingIncGst)}</td>
            <td>{revision ? `${revision.cumulativePercentage}%` : '—'}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
  )
}
