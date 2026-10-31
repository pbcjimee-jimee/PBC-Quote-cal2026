import { describe, expect, it } from 'vitest'
import { isSameOriginGet, isSameOriginRequest } from '@/lib/security/request-origin'

const request = (headers: Record<string, string>) => new Request('https://pbc.example/api/ai/knowledge', { headers })

describe('mutation request origin', () => {
  it.each(['same-origin', 'none', 'same-site', 'cross-site', ''])('checks fetch metadata %j before other headers', site => {
    expect(isSameOriginRequest(request({ 'sec-fetch-site': site, origin: 'https://pbc.example' })))
      .toBe(site === 'same-origin')
  })

  it.each([
    [{ origin: 'https://pbc.example' }, true],
    [{ origin: 'https://evil.example', referer: 'https://pbc.example/page' }, false],
    [{ origin: 'null', referer: 'https://pbc.example/page' }, false],
    [{ referer: 'https://pbc.example/page' }, true],
    [{ referer: 'http://pbc.example/page' }, false],
    [{ referer: 'https://pbc.example.evil.test/page' }, false],
    [{ referer: 'invalid' }, false],
    [{}, false],
  ] satisfies Array<[Record<string, string>, boolean]>)('checks fallback headers %j', (headers, expected) => {
    expect(isSameOriginRequest(request(headers))).toBe(expected)
  })

  it('preserves GET acceptance of direct navigation', () => {
    expect(isSameOriginGet(request({ 'sec-fetch-site': 'none' }))).toBe(true)
  })
})
