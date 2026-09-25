import type { JobberQuoteLineItemDraft } from './types'
import { decimalFromInput } from '@/lib/quote-labour'

interface JobberLineSummaryProps {
  line: JobberQuoteLineItemDraft
  isEditing: boolean
  onEdit: () => void
  editorId?: string
}

export function JobberLineSummary({
  line,
  isEditing,
  onEdit,
  editorId,
}: JobberLineSummaryProps) {
  const label = line.name.trim() || (line.kind === 'line_item' ? 'Untitled line item' : 'Untitled text')
  const amount = line.kind === 'line_item'
    ? `$${decimalFromInput(line.quantity).mul(decimalFromInput(line.unitPrice)).toFixed(2)}`
    : null

  return (
    <button
      type="button"
      aria-label={`Edit ${label}`}
      aria-expanded={isEditing}
      aria-controls={editorId}
      data-jobber-summary-id={line.id}
      onClick={onEdit}
      className="pbc-jobber-line-summary w-full rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-left"
    >
      <span className="flex min-w-0 items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="pbc-titletext block break-words">{label}</span>
          {line.description.trim() ? (
            <span className="pbc-listitem__meta mt-1 block line-clamp-2 break-words">
              {line.description}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-right">
          <span className="pbc-listitem__meta block">{line.kind === 'line_item' ? 'Line item' : 'Text'}</span>
          {amount ? <span className="font-mono text-sm font-semibold text-[var(--foreground)]">{amount}</span> : null}
        </span>
      </span>
      <span className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-[var(--muted)]">
        <span>{line.taxable ? 'Taxable' : 'Not taxable'}</span>
        <span aria-hidden="true">·</span>
        <span>{line.clientVisible ? 'Client visible' : 'Hidden from client'}</span>
      </span>
    </button>
  )
}
