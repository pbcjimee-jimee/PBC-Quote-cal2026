import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const projectRoot = process.cwd()
const sourceRoots = ['app', 'lib']

function getSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) return getSourceFiles(fullPath)
    if (!/\.(ts|tsx)$/.test(entry)) return []
    return [fullPath]
  })
}

function normalizePath(filePath: string): string {
  return relative(projectRoot, filePath).split(sep).join('/')
}

describe('Jobber read-only regression guard', () => {
  it('keeps Jobber API endpoint literals centralized in config', () => {
    const directJobberApiReferences = sourceRoots
      .flatMap((root) => getSourceFiles(join(projectRoot, root)))
      .map((filePath) => ({
        file: normalizePath(filePath),
        source: readFileSync(filePath, 'utf8'),
      }))
      .filter(({ source }) => source.includes('https://api.getjobber.com'))
      .map(({ file }) => file)

    expect(directJobberApiReferences).toEqual([
      'lib/jobber/config.ts',
    ])
  })

  it('keeps Jobber GraphQL network access centralized behind the read-only client guard', () => {
    const directGraphqlReferences = sourceRoots
      .flatMap((root) => getSourceFiles(join(projectRoot, root)))
      .map((filePath) => ({
        file: normalizePath(filePath),
        source: readFileSync(filePath, 'utf8'),
      }))
      .filter(({ source }) => source.includes('JOBBER_GRAPHQL_URL'))
      .map(({ file }) => file)

    expect(directGraphqlReferences).toEqual([
      'lib/jobber/client.ts',
      'lib/jobber/config.ts',
      'lib/jobber/invoice-client.ts',
    ])
  })

  it('keeps application Jobber GraphQL documents query-only', () => {
    const jobberSources = sourceRoots
      .flatMap((root) => getSourceFiles(join(projectRoot, root)))
      .filter((filePath) => normalizePath(filePath).includes('/jobber/'))
      .map((filePath) => ({
        file: normalizePath(filePath),
        source: readFileSync(filePath, 'utf8')
          .split('\n')
          .map((line) => line.replace(/#.*/, '').trim())
          .filter(Boolean)
          .join(' '),
      }))

    const mutationDocuments = jobberSources
      .filter(({ file, source }) => file !== 'lib/jobber/client.ts' && /\bmutation\b/i.test(source))
      .map(({ file }) => file)

    expect(mutationDocuments).toEqual([])
  })

  it('keeps Progress Invoice Jobber code isolated from Quote modules and mutation documents', () => {
    const progressJobberFiles = [
      'lib/jobber/invoice-client.ts',
      'lib/jobber/invoice-gateway.ts',
      'app/api/jobber/progress-invoices/invoices/search/route.ts',
    ]

    for (const file of progressJobberFiles) {
      const source = readFileSync(join(projectRoot, file), 'utf8')
      expect(source).not.toMatch(/@\/lib\/jobber\/(client|mapper|quote-lookup|quote-line-payload)/)
      expect(source).not.toMatch(/@\/lib\/actions\/quotes/)
      expect(source).not.toMatch(/\bmutation\b/i)
    }
  })

  it('marks both dedicated Progress Invoice Jobber modules as server-only', () => {
    for (const file of ['lib/jobber/invoice-client.ts', 'lib/jobber/invoice-gateway.ts']) {
      const source = readFileSync(join(projectRoot, file), 'utf8')
      expect(source).toMatch(/^import 'server-only'\r?\n/)
    }
  })
})
