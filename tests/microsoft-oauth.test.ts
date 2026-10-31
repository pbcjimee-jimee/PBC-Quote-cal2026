import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMicrosoftConfig, getMissingMicrosoftConfigKeys, MICROSOFT_SCOPES } from '@/lib/microsoft/config'
import { buildMicrosoftAuthorizationUrl, createPkcePair, exchangeMicrosoftCode, refreshMicrosoftToken } from '@/lib/microsoft/oauth'
import { deleteMicrosoftToken, getMicrosoftConnection, getUsableMicrosoftAccessToken, saveMicrosoftToken } from '@/lib/microsoft/tokens'
import { decryptTokenValue, encryptTokenValue } from '@/lib/jobber/token-encryption'
import type { Database } from '@/lib/supabase/types'

const config = { tenantId: 'tenant-id', clientId: 'client-id', clientSecret: 'secret', redirectUri: 'http://localhost:3000/api/microsoft/callback' }
const token = { accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600, scope: MICROSOFT_SCOPES }
function database(row: Record<string, unknown> | null, error: unknown = null) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), upsert: vi.fn(), update: vi.fn(), delete: vi.fn() }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.maybeSingle.mockResolvedValue({ data: row, error })
  query.upsert.mockResolvedValue({ error })
  query.update.mockReturnValue(query)
  query.delete.mockReturnValue(query)
  const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>
  return { client, query }
}
beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', 'development')
  vi.stubEnv('JOBBER_TOKEN_ENCRYPTION_KEY', 'test-encryption-key')
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })

describe('Microsoft OAuth', () => {
  it('reads trimmed server configuration and reports missing keys', () => {
    expect(getMicrosoftConfig({ MICROSOFT_CLIENT_ID: ' id ' })).toEqual({ tenantId: '', clientId: 'id', clientSecret: '', redirectUri: '' })
    expect(getMissingMicrosoftConfigKeys(getMicrosoftConfig({}))).toEqual(['MICROSOFT_TENANT_ID', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_REDIRECT_URI'])
    expect(() => getMicrosoftConfig({ VERCEL_ENV: 'preview' })).toThrow(/Preview|preview/)
  })
  it('creates random RFC 7636 S256 verifier/challenge pairs', () => {
    const pair = createPkcePair()
    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
    expect(pair.challenge).toBe(createHash('sha256').update(pair.verifier).digest('base64url'))
    expect(createPkcePair().verifier).not.toBe(pair.verifier)
  })
  it('builds a tenant-specific authorization URL with PKCE and only read scopes', () => {
    const url = new URL(buildMicrosoftAuthorizationUrl(config, 'state', 'challenge'))
    expect(url.origin + url.pathname).toBe('https://login.microsoftonline.com/tenant-id/oauth2/v2.0/authorize')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ client_id: 'client-id', response_type: 'code', redirect_uri: config.redirectUri, state: 'state', code_challenge: 'challenge', code_challenge_method: 'S256', scope: 'offline_access User.Read Files.Read' })
    expect(url.searchParams.has('client_secret')).toBe(false)
  })
  it('exchanges a code with its verifier and rotates refresh tokens', async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600, scope: MICROSOFT_SCOPES }))
    expect(await exchangeMicrosoftCode('code', 'verifier', config, fetcher)).toEqual(token)
    expect(String(fetcher.mock.calls[0][1].body)).toContain('code_verifier=verifier')
    expect(fetcher.mock.calls[0][0]).toBe('https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token')
    expect(await refreshMicrosoftToken('old-refresh', config, fetcher)).toEqual(token)
    expect(String(fetcher.mock.calls[1][1].body)).toContain('grant_type=refresh_token')
    expect(String(fetcher.mock.calls[1][1].body)).toContain('refresh_token=old-refresh')
  })
  it('keeps an existing refresh token when the refresh response omits it', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ access_token: 'new', expires_in: 3600 }))
    expect(await refreshMicrosoftToken('old', config, fetcher)).toMatchObject({ accessToken: 'new', refreshToken: 'old' })
  })
  it('rejects failed and malformed token responses without exposing their contents', async () => {
    await expect(exchangeMicrosoftCode('code', 'verifier', config, async () => new Response('secret', { status: 400 }))).rejects.toThrow('Microsoft token request failed with status 400')
    await expect(exchangeMicrosoftCode('code', 'verifier', config, async () => Response.json({ access_token: 'secret' }))).rejects.toThrow('Invalid Microsoft token response')
  })
})

describe('Microsoft token storage', () => {
  it('encrypts both tokens and limits connection reads to public metadata', async () => {
    const { client, query } = database({ account_email: 'jimee@paintbuddyco.com.au', connected_at: '2026-10-31T00:00:00Z' })
    await saveMicrosoftToken(client, 'user', 'jimee@paintbuddyco.com.au', token)
    const saved = query.upsert.mock.calls[0][0]
    expect(saved.user_id).toBe('user')
    expect(saved.access_token).toMatch(/^enc:v1:/)
    expect(decryptTokenValue(saved.access_token)).toBe('access')
    expect(decryptTokenValue(saved.refresh_token)).toBe('refresh')
    expect(await getMicrosoftConnection(client, 'user')).toEqual({ accountEmail: 'jimee@paintbuddyco.com.au', connectedAt: '2026-10-31T00:00:00Z' })
    expect(query.select).toHaveBeenLastCalledWith('account_email, connected_at')
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user')
  })
  it('returns not_connected without requesting tokens', async () => {
    const { client } = database(null)
    const fetcher = vi.fn()
    expect(await getUsableMicrosoftAccessToken(client, 'user', config, fetcher)).toEqual({ ok: false, reason: 'not_connected' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('uses a valid encrypted token without refreshing', async () => {
    const { client } = database({ access_token: encryptTokenValue('access'), refresh_token: encryptTokenValue('refresh'), expires_at: new Date(Date.now() + 3600000).toISOString() })
    const fetcher = vi.fn()
    expect(await getUsableMicrosoftAccessToken(client, 'user', config, fetcher)).toEqual({ ok: true, accessToken: 'access' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('refreshes five minutes before expiry and persists the rotated encrypted tokens', async () => {
    const { client, query } = database({ access_token: encryptTokenValue('old'), refresh_token: encryptTokenValue('old-refresh'), expires_at: new Date(Date.now() + 299000).toISOString() })
    query.eq.mockImplementation(() => query)
    const fetcher = vi.fn().mockResolvedValue(Response.json({ access_token: 'new', refresh_token: 'rotated', expires_in: 3600 }))
    expect(await getUsableMicrosoftAccessToken(client, 'user', config, fetcher)).toEqual({ ok: true, accessToken: 'new' })
    const saved = query.update.mock.calls[0][0]
    expect(decryptTokenValue(saved.access_token)).toBe('new')
    expect(decryptTokenValue(saved.refresh_token)).toBe('rotated')
    expect(saved).not.toHaveProperty('connected_at')
  })
  it('returns reconnect_required when a refresh is revoked or stored ciphertext is corrupt', async () => {
    const { client } = database({ access_token: encryptTokenValue('old'), refresh_token: encryptTokenValue('refresh'), expires_at: null })
    expect(await getUsableMicrosoftAccessToken(client, 'user', config, async () => new Response(null, { status: 400 }))).toEqual({ ok: false, reason: 'reconnect_required' })
    const corrupt = database({ access_token: 'enc:v1:broken', refresh_token: 'enc:v1:broken', expires_at: null })
    expect(await getUsableMicrosoftAccessToken(corrupt.client, 'user', config, vi.fn())).toEqual({ ok: false, reason: 'reconnect_required' })
  })
  it('deletes only the current user connection', async () => {
    const { client, query } = database(null)
    await deleteMicrosoftToken(client, 'user')
    expect(query.delete).toHaveBeenCalledOnce()
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user')
  })
})
