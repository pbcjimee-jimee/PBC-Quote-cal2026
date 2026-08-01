import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const forbiddenApplicationPaths = [
  'app/(app)/progress-invoices',
  'app/api/jobber/progress-invoices',
  'components/progress-invoices',
]

const forbiddenRuntimePaths = [
  'lib/actions/progress-invoice-adjustments.ts',
  'lib/actions/progress-invoice-jobber.ts',
  'lib/actions/progress-invoice-series.ts',
  'lib/progress-invoices',
  'lib/jobber/invoice-client.ts',
  'lib/jobber/invoice-contract.ts',
  'lib/jobber/invoice-gateway.ts',
  'lib/jobber/invoice-types.ts',
]

describe('role branch Progress Invoice separation', () => {
  it.each(forbiddenApplicationPaths)('does not ship %s', (path) => {
    expect(existsSync(path)).toBe(false)
  })

  it.each(forbiddenRuntimePaths)('does not ship %s', (path) => {
    expect(existsSync(path)).toBe(false)
  })
})
