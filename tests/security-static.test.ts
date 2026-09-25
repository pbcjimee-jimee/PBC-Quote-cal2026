import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const projectRoot = process.cwd()
const sourceRoots = ['app', 'components', 'lib']

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) return sourceFiles(fullPath)
    if (!/\.(ts|tsx)$/.test(entry)) return []
    return [fullPath]
  })
}

function normalize(filePath: string): string {
  return relative(projectRoot, filePath).split(sep).join('/')
}

describe('static security guardrails', () => {
  it('keeps local secret files ignored by git', () => {
    const gitignore = readFileSync(join(projectRoot, '.gitignore'), 'utf8')

    expect(gitignore).toMatch(/^\.env$/m)
    expect(gitignore).toMatch(/^\.env\.\*$/m)
    expect(gitignore).toMatch(/^!\.env\.example$/m)
    expect(gitignore).toMatch(/^\.jobber\.local\.json$/m)
  })

  it('does not use browser XSS bypass rendering or debug logging in source files', () => {
    const violations = sourceRoots
      .flatMap((root) => sourceFiles(join(projectRoot, root)))
      .flatMap((filePath) => {
        const source = readFileSync(filePath, 'utf8')
        const matches = source.match(/dangerouslySetInnerHTML|console\.log/g) ?? []
        return matches.map((match) => `${normalize(filePath)}: ${match}`)
      })

    expect(violations).toEqual([])
  })

  it('keeps the Supabase service role key in server client and deployment validation boundaries', () => {
    const references = sourceRoots
      .flatMap((root) => sourceFiles(join(projectRoot, root)))
      .flatMap((filePath) => {
        const source = readFileSync(filePath, 'utf8')
        if (!source.includes('SUPABASE_SERVICE_ROLE_KEY')) return []
        return [normalize(filePath)]
      })

    expect(references.sort()).toEqual([
      'lib/deployment/preview-environment.ts',
      'lib/supabase/server.ts',
    ])
  })
})
