import type { QuoteFormIssue, QuoteInputSection } from './quote-mobile-state'

export const QUOTE_WORKSPACE_SECTIONS: { id: QuoteInputSection; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'work', label: 'Work & materials' },
  { id: 'public', label: 'Public quote' },
]

interface QuoteWorkspaceNavProps {
  activeSection: QuoteInputSection
  onSectionChange: (section: QuoteInputSection) => void
  issues: readonly QuoteFormIssue[]
}

export function QuoteWorkspaceNav({ activeSection, onSectionChange, issues }: QuoteWorkspaceNavProps) {
  return (
    <nav className="pbc-quote-workspace-nav" aria-label="Quote workspace">
      {QUOTE_WORKSPACE_SECTIONS.map((section) => {
        const count = issues.filter((issue) => issue.section === section.id).length
        return (
          <button
            key={section.id}
            type="button"
            className="pbc-btn pbc-quote-workspace-nav__category"
            aria-pressed={activeSection === section.id}
            aria-controls={`quote-workspace-${section.id}`}
            onClick={() => onSectionChange(section.id)}
          >
            <span>{section.label}</span>
            {count ? <span className="pbc-quote-workspace-nav__issues" aria-label={`${count} issues`}>{count}</span> : null}
          </button>
        )
      })}
    </nav>
  )
}
