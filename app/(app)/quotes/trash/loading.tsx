export default function QuoteTrashLoading() {
  return <main className="pbc-page" aria-busy="true">
    <div className="pbc-pagehead"><h1>Trash</h1><p role="status">Loading deleted quotes...</p></div>
    <div className="space-y-3 animate-pulse" aria-hidden="true">
      {[0, 1, 2].map((key) => <div key={key} className="pbc-card pbc-card--pad h-32" />)}
    </div>
  </main>
}
