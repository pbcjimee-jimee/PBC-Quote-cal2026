import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from '@/app/manifest'

describe('deployment performance configuration', () => {
  it('runs Vercel Functions beside the Sydney Supabase database', () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
      regions?: string[]
    }
    expect(config.regions).toEqual(['syd1'])
  })

  it('launches the PWA on a route shared by both app roles', () => {
    expect(manifest().start_url).toBe('/jobs')
  })
})
