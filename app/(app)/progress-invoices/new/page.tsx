import { IntentLink } from '@/components/navigation/intent-link'
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
          <p>Choose the source now. The full save-and-link form will open here as the next workspace step.</p>
        </div>

        <div className="pbc-alert pbc-alert--warning">
          This guided landing page is read-only. It does not create, link or update Jobber data.
        </div>

        <div className="pbc-progress-create-grid">
          <section className="pbc-card pbc-card--pad">
            <div className="pbc-seclabel">
              <span className="pbc-seclabel__title">
                <span className="pbc-seclabel__icon">{Icons.quote({ size: 16 })}</span>
                Existing PBC Quote
              </span>
            </div>
            <p className="pbc-progress-create-copy">
              Start from an existing PBC quote so the customer, site and contract values can be reviewed before they are snapshotted.
            </p>
            <IntentLink href="/quotes" className="pbc-btn pbc-btn--primary">
              Browse PBC Quotes
            </IntentLink>
          </section>

          <section className="pbc-card pbc-card--pad">
            <div className="pbc-seclabel">
              <span className="pbc-seclabel__title">
                <span className="pbc-seclabel__icon">{Icons.progressInvoice({ size: 16 })}</span>
                Standalone
              </span>
            </div>
            <p className="pbc-progress-create-copy">
              Create without a PBC quote, then review the builder, site, contract Ex GST and optional Jobber invoice link.
            </p>
            <span className="pbc-progress-guided-note">Standalone entry form is the next implementation step.</span>
          </section>
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
