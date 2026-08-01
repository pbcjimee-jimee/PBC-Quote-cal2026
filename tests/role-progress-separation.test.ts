import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const forbiddenApplicationPaths = [
  'app/(app)/progress-invoices',
  'app/api/jobber/progress-invoices',
  'components/progress-invoices',
]

describe('role branch Progress Invoice separation', () => {
  it.each(forbiddenApplicationPaths)('does not ship %s', (path) => {
    expect(existsSync(path)).toBe(false)
  })
})
