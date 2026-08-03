import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

interface PackageJson {
  scripts?: Record<string, string>
}

describe('package scripts', () => {
  it('keeps the verify command as the full local release gate', () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8')
    ) as PackageJson

    expect(packageJson.scripts?.verify).toBe(
      'git diff --check && npm run typecheck && npm run lint && npm run test:run && npm run test:coverage && npm run build && npm run audit:production'
    )
    expect(packageJson.scripts?.['audit:production']).toBe(
      'npm audit --omit=dev --audit-level=high'
    )
  })

  it('keeps the Supabase local RLS integration test directly runnable', () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8')
    ) as PackageJson

    expect(packageJson.scripts?.['test:rls:local']).toBe(
      'vitest run tests/rls-local-integration.test.ts'
    )
  })
})
