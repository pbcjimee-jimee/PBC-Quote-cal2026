import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const pagePaths = [
  'app/(app)/progress-invoices/[seriesId]/claims/new/page.tsx',
  'app/(app)/progress-invoices/[seriesId]/claims/[claimId]/page.tsx',
]
const helperPath = 'lib/progress-invoices/claim-editor-key.ts'

describe('Progress Claim editor server boundary', () => {
  it('keeps the editor remount key outside the Client Component module', () => {
    for (const pagePath of pagePaths) {
      const source = readFileSync(join(projectRoot, pagePath), 'utf8')

      expect(source).not.toMatch(
        /import\s*\{[^}]*progressClaimEditorKey[^}]*\}\s*from\s*['"]@\/components\/progress-invoices\/claim-editor['"]/,
      )
      expect(source).toMatch(
        /import\s*\{[^}]*progressClaimEditorKey[^}]*\}\s*from\s*['"]@\/lib\/progress-invoices\/claim-editor-key['"]/,
      )
    }

    expect(existsSync(join(projectRoot, helperPath))).toBe(true)
    const helperSource = readFileSync(join(projectRoot, helperPath), 'utf8')
    expect(helperSource).not.toMatch(/^['"]use client['"]/)
  })
})
