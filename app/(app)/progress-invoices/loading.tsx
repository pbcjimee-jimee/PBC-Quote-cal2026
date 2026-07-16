export default function ProgressInvoicesLoading() {
  return (
    <main aria-busy="true" aria-live="polite">
      <header className="pbc-topbar">
        <div className="pbc-crumb"><span>Admin</span><b>Progress Invoices</b></div>
      </header>
      <div className="pbc-page">
        <div className="pbc-pagehead">
          <h1>Progress Invoices</h1>
          <p>Loading progress invoices…</p>
        </div>
        <div className="pbc-stats" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="pbc-stat pbc-progress-skeleton">
              <span className="pbc-progress-skeleton__line" />
              <span className="pbc-progress-skeleton__value" />
            </div>
          ))}
        </div>
        <div className="pbc-card pbc-card--pad pbc-progress-skeleton" aria-hidden="true">
          <span className="pbc-progress-skeleton__line" />
          <span className="pbc-progress-skeleton__block" />
        </div>
        <span className="sr-only">Loading progress invoices</span>
      </div>
    </main>
  )
}
