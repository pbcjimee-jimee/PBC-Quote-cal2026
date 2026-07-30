import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('supervisor route security', () => {
  it('guards every admin page family at the server component boundary', () => {
    expect(source('app/(app)/quotes/layout.tsx')).toContain('requireAdminPage()')
    expect(source('app/(app)/progress-invoices/layout.tsx')).toContain('requireAdminPage()')
    expect(source('app/(app)/settings/page.tsx')).toContain('requireAdminPage()')
    expect(source('app/(app)/settings/users/page.tsx')).toContain('requireAdminPage()')
  })

  it('leaves only jobs and inventory on the any-role application boundary', () => {
    expect(source('app/(app)/inventory/page.tsx')).toContain("requireRole('any')")
    expect(source('lib/actions/jobs.ts')).toContain("requireRole('any')")
    expect(source('components/layout/app-header.tsx')).toContain("roles: ['admin', 'supervisor']")
    expect(source('components/layout/app-header.tsx')).toContain("{ href: '/jobs'")
    expect(source('components/layout/app-header.tsx')).toContain("{ href: '/inventory'")
  })

  it('requires admin for Jobber quote and progress-invoice endpoints', () => {
    for (const path of [
      'app/api/jobber/connect/route.ts',
      'app/api/jobber/callback/route.ts',
      'app/api/jobber/quote/[quoteId]/route.ts',
      'app/api/jobber/progress-invoices/invoices/search/route.ts',
      'app/api/jobber/progress-invoices/invoices/[invoiceId]/route.ts',
      'app/api/jobber/progress-invoices/jobs/[jobId]/invoices/route.ts',
    ]) {
      expect(source(path), path).toContain("requireRole('admin')")
    }
  })
})
