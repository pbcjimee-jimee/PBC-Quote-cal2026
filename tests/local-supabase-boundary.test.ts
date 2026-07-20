import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const wrapperPath = path.join(projectRoot, 'scripts', 'run-local-supabase.ps1')

function runWrapper(args: string[]) {
  return spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      wrapperPath,
      ...args,
    ],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: process.env,
      timeout: 30_000,
      windowsHide: true,
    },
  )
}

function outputOf(result: ReturnType<typeof runWrapper>) {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
}

describe('local Supabase execution boundary', () => {
  const labelledStack = spawnSync(
    'docker.exe',
    [
      'ps',
      '--filter',
      'label=com.supabase.cli.project=progress-invoice-series',
      '--format',
      '{{.Names}}',
    ],
    { encoding: 'utf8', windowsHide: true },
  )
  const localStatusTest =
    labelledStack.status === 0 &&
    labelledStack.stdout.includes('supabase_db_progress-invoice-series')
      ? it
      : it.skip

  it('pins the generated CLI configuration to the existing local Docker stack', () => {
    const config = readFileSync(
      path.join(projectRoot, 'supabase', 'config.toml'),
      'utf8',
    )

    expect(config).toMatch(/^project_id = "progress-invoice-series"$/m)
    expect(config).toMatch(/\[api\][\s\S]*?^port = 54321$/m)
    expect(config).toMatch(/\[db\][\s\S]*?^port = 54322$/m)
    expect(config).toMatch(/^major_version = 17$/m)
    expect(config).toMatch(/\[studio\][\s\S]*?^port = 54323$/m)
    expect(config).toMatch(/\[local_smtp\][\s\S]*?^port = 54324$/m)
    expect(config).toMatch(/\[analytics\][\s\S]*?^port = 54327$/m)
    expect(config).toContain('[auth]')
    expect(config).toContain('[storage]')
    expect(config).toContain('[edge_runtime]')
  })

  it('keeps the isolated CLI home out of version control', () => {
    const gitignore = readFileSync(path.join(projectRoot, '.gitignore'), 'utf8')

    expect(gitignore).toMatch(/^\/\.supabase-cli-home\/$/m)
  })

  it.each([
    ['link'],
    ['unlink'],
    ['stop'],
    ['db', 'push'],
    ['migration', 'up'],
    ['migration', 'up', '--linked'],
    ['migration', 'up', '--local', '--linked'],
    ['migration', 'up', '--local', '--db-url', 'postgresql://remote.invalid/db'],
    ['secrets', 'list'],
    ['functions', 'deploy', 'unsafe'],
    ['db', 'reset', '--linked'],
    ['db', 'reset', '--local', '--db-url', 'postgresql://remote.invalid/db'],
    ['db', 'reset', '--local', '--version', '20260719225145'],
    ['db', 'reset', '--local', '--version', '20260719225144', '--linked'],
    ['db', 'reset', '--local', '--version', '20260719225144', '--db-url', 'postgresql://remote.invalid/db'],
    ['test', 'db', '--linked'],
    ['test', 'db', '--local', 'package.json'],
    ['gen', 'types', '--project-id', 'remote-project'],
    ['status', '--profile', 'production'],
    ['start', '--workdir', 'elsewhere'],
  ])('rejects unsafe command %j without echoing its arguments', (...args) => {
    const result = runWrapper(args)

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toBe('LOCAL_REFUSED')
  })

  it.each([
    ['migration', 'new'],
    ['migration', 'new', 'Bad-Name'],
    ['db', 'reset'],
    ['test', 'db'],
    ['gen', 'types'],
  ])('fails closed for incomplete local command %j', (...args) => {
    const result = runWrapper(args)

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toBe('LOCAL_REFUSED')
  })

  it('uses an isolated profile, clears inherited remote selectors, and filters Docker by the exact project label', () => {
    const script = readFileSync(wrapperPath, 'utf8')

    expect(script).toContain('SUPABASE_HOME')
    expect(script).toContain('.supabase-cli-home')
    expect(script).toContain('SUPABASE_ACCESS_TOKEN')
    expect(script).toContain('SUPABASE_DB_PASSWORD')
    expect(script).toContain('SUPABASE_PROFILE')
    expect(script).toContain("'env\\(([A-Z][A-Z0-9_]*)\\)'")
    expect(script).toContain('com.supabase.cli.project=progress-invoice-series')
    expect(script).toContain('node_modules\\.bin\\supabase.cmd')
  })

  it('allows only the pinned local lifecycle upgrade command shapes', () => {
    const script = readFileSync(wrapperPath, 'utf8')

    expect(script).toContain("@('db', 'reset', '--local', '--version', '20260719225144')")
    expect(script).toContain("@('migration', 'up', '--local')")
  })

  it('limits the environment guard to a non-secret success or refusal token', () => {
    const result = runWrapper(['env', 'guard'])
    const output = outputOf(result)

    expect(['LOCAL_OK', 'LOCAL_REFUSED']).toContain(output)
    expect(output).not.toMatch(/https?:\/\//i)
    expect(output).not.toMatch(/postgres(?:ql)?:\/\//i)
    expect(output).not.toMatch(/(?:anon|service|publishable|secret)[_-]?key/i)
    expect(result.status === 0).toBe(output === 'LOCAL_OK')
  })

  localStatusTest('reports a labelled running stack without exposing status secrets', () => {
    const result = runWrapper(['status'])

    expect(result.status).toBe(0)
    expect(outputOf(result)).toBe('LOCAL_OK')
  })
})
