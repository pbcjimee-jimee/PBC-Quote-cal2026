export default function AppLoading() {
  return (
    <main className="pbc-startup" role="status" aria-live="polite" aria-label="Opening PBC Quote">
      <section className="pbc-startup__card">
        <div className="pbc-startup__brand">
          <span className="pbc-brand__mark" aria-hidden="true">P</span>
          <span className="pbc-brand__text"><b>PBC Quote</b><i>Business workspace</i></span>
        </div>
        <div className="pbc-startup__copy">
          <h1>Opening your workspace</h1>
          <p>Loading the latest jobs and account access…</p>
        </div>
        <div className="pbc-startup__progress" aria-hidden="true"><span /></div>
        <div className="pbc-startup__preview" aria-hidden="true">
          <span className="pbc-loadingbar" />
          <span className="pbc-loadingbar" />
          <span className="pbc-loadingbar" />
        </div>
      </section>
    </main>
  )
}
