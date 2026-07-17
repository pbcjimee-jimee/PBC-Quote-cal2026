'use client'

import dynamic from 'next/dynamic'

// Code-split seam for the quote form's heaviest Jobber panels. They are not
// needed for first paint or typing, so deferring them keeps their code out of
// the /quotes/new and /quotes/[id]/edit initial bundles. Tests mock this module
// to render the underlying components synchronously.
export const JobberProductServiceEditor = dynamic(
  () => import('./jobber-product-service-editor').then((mod) => mod.JobberProductServiceEditor),
  {
    ssr: false,
    loading: () => (
      <section className="pbc-card pbc-card--pad animate-pulse" aria-busy="true">
        <span className="sr-only">Loading Product &amp; Service editor...</span>
        <div className="h-5 w-48 rounded-md bg-[var(--border-soft)]" />
        <div className="mt-5 h-11 w-full rounded-md bg-[var(--border-soft)]" />
        <div className="mt-3 h-11 w-full rounded-md bg-[var(--border-soft)]" />
      </section>
    ),
  }
)

export const JobberOptionImport = dynamic(
  () => import('./jobber-option-import').then((mod) => mod.JobberOptionImport),
  { ssr: false }
)
