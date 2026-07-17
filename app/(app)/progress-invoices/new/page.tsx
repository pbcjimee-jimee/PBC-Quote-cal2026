import { IntentLink } from '@/components/navigation/intent-link'
import { ProgressInvoiceCreateWorkspace } from '@/components/progress-invoices/progress-invoice-create-workspace'
import { Icons } from '@/components/ui/icons'

export default function NewProgressInvoicePage() {
  return (
    <main>
      <header className="pbc-topbar">
        <div className="pbc-crumb">
          <IntentLink href="/progress-invoices">Progress Invoices</IntentLink>
          {Icons.arrowDown({ size: 14 })}
          <b>New series</b>
        </div>
      </header>

      <div className="pbc-page">
        <div className="pbc-pagehead">
          <h1>Start a Progress Invoice series</h1>
          <p>Create a Progress Invoice series from an existing Jobber invoice or enter the series manually.</p>
        </div>

        <div className="pbc-alert pbc-alert--warning">
          Jobber imports read Jobber once when you save. Every new series is then managed in PBC.
        </div>

        <div className="pbc-progress-create-grid pbc-progress-create-grid--workspace">
          <ProgressInvoiceCreateWorkspace />
        </div>

        <div className="pbc-progress-create-actions">
          <IntentLink href="/progress-invoices" className="pbc-btn pbc-btn--ghost">
            Back to Progress Invoices
          </IntentLink>
        </div>
      </div>
    </main>
  )
}
