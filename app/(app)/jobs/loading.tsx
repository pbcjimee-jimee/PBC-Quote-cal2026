import { JobsLoadingShell } from '@/components/jobs/jobs-loading-shell'

export default function JobsLoading() {
  return (
    <main>
      <header className="pbc-topbar" aria-hidden="true">
        <span className="pbc-loadingbar pbc-loading-topbar__title" />
        <span className="pbc-loadingbox" />
      </header>
      <div className="pbc-page">
        <div className="pbc-pagehead" aria-hidden="true">
          <span className="pbc-loadingbar pbc-loading-pagehead__title" />
          <span className="pbc-loadingbar pbc-loading-pagehead__copy" />
        </div>
        <JobsLoadingShell />
      </div>
    </main>
  )
}
