import Decimal from 'decimal.js'
import {
  isJobberOptionCandidateAlreadyImported,
  type JobberOptionImportCandidate,
} from './jobber-option-mapping'
import type { QuoteOptionItem } from './types'

interface JobberOptionImportProps {
  candidates: JobberOptionImportCandidate[]
  existingOptions: QuoteOptionItem[]
  onImportCandidate: (candidate: JobberOptionImportCandidate) => void
}

export function JobberOptionImport({
  candidates,
  existingOptions,
  onImportCandidate,
}: JobberOptionImportProps) {
  const visibleCandidates = candidates.filter((candidate) => candidate.lines.length > 0)
  if (visibleCandidates.length === 0) return null

  return (
    <section className="mt-6 space-y-3 border-t border-[var(--border-soft)] pt-6">
      <div className="pbc-panelhead">
        <div className="pbc-panelhead__copy">
          <h2 className="pbc-paneltitle">Jobber option import</h2>
          <p className="pbc-panelsub">Review detected Jobber option lines before adding them to PBC options.</p>
        </div>
      </div>
      <div className="space-y-2">
        {visibleCandidates.map((candidate) => {
          const alreadyImported = isJobberOptionCandidateAlreadyImported(candidate, existingOptions)

          return (
            <div key={candidate.id} className="pbc-softpanel flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="pbc-titletext">{candidate.title}</p>
                <p className="pbc-listitem__meta">
                  {candidate.lines.length} Jobber lines | ${new Decimal(candidate.total).toFixed(2)}
                </p>
              </div>
              {alreadyImported ? (
                <span className="pbc-chip pbc-chip--muted border">Imported</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onImportCandidate(candidate)}
                  className="pbc-btn pbc-btn--soft pbc-btn--sm"
                >
                  Import as option
                </button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
