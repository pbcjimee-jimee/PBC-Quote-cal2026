import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn(), signOut: vi.fn(), exchange: vi.fn(), me: vi.fn(), save: vi.fn(), remove: vi.fn(), connection: vi.fn() }))
vi.mock('@/lib/ai-quote/access', () => ({ requireAiQuoteUser: mocks.auth }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }))
vi.mock('@/lib/microsoft/oauth', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/microsoft/oauth')>(), exchangeMicrosoftCode: mocks.exchange }))
vi.mock('@/lib/microsoft/graph', () => ({ getMicrosoftMe: mocks.me }))
vi.mock('@/lib/microsoft/tokens', () => ({ saveMicrosoftToken: mocks.save, deleteMicrosoftToken: mocks.remove, getMicrosoftConnection: mocks.connection }))
import { GET as connect } from '@/app/api/microsoft/connect/route'
import { GET as callback } from '@/app/api/microsoft/callback/route'
import { POST as disconnect } from '@/app/api/microsoft/disconnect/route'
import { getOneDriveStatus } from '@/lib/actions/onedrive'
import { AUTHENTICATION_REQUIRED_ERROR } from '@/lib/security/auth-policy'

const client = { auth: { signOut: mocks.signOut } }
function callbackRequest(query = 'code=code&state=state', cookie = 'ms_oauth_state=state; ms_oauth_verifier=verifier') {
  return new NextRequest(`http://localhost:3000/api/microsoft/callback?${query}`, { headers: { cookie, 'sec-fetch-site': 'cross-site' } })
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('VERCEL_ENV', 'development')
  vi.stubEnv('NEXT_PUBLIC_DEV_NO_AUTH', 'false')
  vi.stubEnv('MICROSOFT_TENANT_ID', 'tenant')
  vi.stubEnv('MICROSOFT_CLIENT_ID', 'client')
  vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'secret')
  vi.stubEnv('MICROSOFT_REDIRECT_URI', 'http://localhost:3000/api/microsoft/callback')
  vi.stubEnv('JOBBER_TOKEN_ENCRYPTION_KEY', 'test-key')
  mocks.auth.mockResolvedValue({ ok: true, user: { id: 'user', email: 'jimee@paintbuddyco.com.au' } })
  mocks.client.mockResolvedValue(client)
  mocks.exchange.mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600, scope: 'User.Read Files.Read' })
  mocks.me.mockResolvedValue({ email: 'jimee@paintbuddyco.com.au' })
  mocks.connection.mockResolvedValue(null)
})
afterEach(() => vi.unstubAllEnvs())

describe('Microsoft connection routes', () => {
  it('starts PKCE with secure short-lived cookies from a same-origin link', async () => {
    const response = await connect(new NextRequest('http://localhost:3000/api/microsoft/connect', { headers: { 'sec-fetch-site': 'same-origin' } }))
    expect(response.status).toBe(307)
    const url = new URL(response.headers.get('location')!)
    expect(url.host).toBe('login.microsoftonline.com')
    expect(url.searchParams.get('state')).toBe(response.cookies.get('ms_oauth_state')?.value)
    expect(response.cookies.get('ms_oauth_verifier')?.value).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/i)
    expect(response.headers.get('set-cookie')).toContain('Max-Age=600')
    expect(response.headers.get('set-cookie')).toMatch(/SameSite=lax/i)
  })
  it('rejects cross-origin connect without creating state', async () => {
    const response = await connect(new NextRequest('http://localhost:3000/api/microsoft/connect', { headers: { 'sec-fetch-site': 'cross-site' } }))
    expect(response.status).toBe(403)
    expect(response.cookies.get('ms_oauth_state')).toBeUndefined()
  })
  it('does not sign out a denied account through an untrusted connect GET', async () => {
    mocks.auth.mockResolvedValue({ ok: false, error: 'Account disabled' })
    const response = await connect(new NextRequest('http://localhost:3000/api/microsoft/connect', { headers: { 'sec-fetch-site': 'cross-site' } }))
    expect(response.headers.get('location')).toBe('http://localhost:3000/login/signout')
    expect(mocks.signOut).not.toHaveBeenCalled()
  })
  it('signs out denied accounts from same-origin connect and redirects anonymous accounts to login', async () => {
    mocks.auth.mockResolvedValueOnce({ ok: false, error: 'Account disabled' })
    const request = new NextRequest('http://localhost:3000/api/microsoft/connect', { headers: { 'sec-fetch-site': 'same-origin' } })
    expect((await connect(request)).headers.get('location')).toBe('http://localhost:3000/login')
    expect(mocks.signOut).toHaveBeenCalledOnce()
    mocks.auth.mockResolvedValueOnce({ ok: false, error: AUTHENTICATION_REQUIRED_ERROR })
    expect((await connect(request)).headers.get('location')).toBe('http://localhost:3000/login')
    expect(mocks.signOut).toHaveBeenCalledOnce()
  })
  it('validates callback state before authorization or any token exchange', async () => {
    const response = await callback(callbackRequest('code=code&state=wrong'))
    expect(response.status).toBe(400)
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.auth).not.toHaveBeenCalled()
    expect(response.cookies.get('ms_oauth_state')?.value).toBe('')
    expect(response.cookies.get('ms_oauth_verifier')?.value).toBe('')
  })
  it('rejects missing verifier and code without exchanging a token', async () => {
    expect((await callback(callbackRequest('state=state'))).status).toBe(400)
    expect((await callback(callbackRequest('code=code&state=state', 'ms_oauth_state=state'))).status).toBe(400)
    expect(mocks.exchange).not.toHaveBeenCalled()
  })
  it('does not save credentials for a different Microsoft account', async () => {
    mocks.me.mockResolvedValue({ email: 'other@example.com' })
    const response = await callback(callbackRequest())
    expect(response.headers.get('location')).toBe('http://localhost:3000/settings?tab=ai&onedrive=wrong_account')
    expect(mocks.save).not.toHaveBeenCalled()
    expect(response.cookies.get('ms_oauth_state')?.value).toBe('')
  })
  it('accepts the allowed account case-insensitively and stores through the user session', async () => {
    mocks.me.mockResolvedValue({ email: 'JIMEE@PAINTBUDDYCO.COM.AU' })
    const response = await callback(callbackRequest())
    expect(response.headers.get('location')).toBe('http://localhost:3000/settings?tab=ai&onedrive=connected')
    expect(mocks.save).toHaveBeenCalledWith(client, 'user', 'jimee@paintbuddyco.com.au', expect.objectContaining({ accessToken: 'access' }))
    expect(mocks.exchange).toHaveBeenCalledWith('code', 'verifier', expect.objectContaining({ tenantId: 'tenant' }))
    expect(response.cookies.get('ms_oauth_verifier')?.value).toBe('')
  })
  it('denies callback authorization before code exchange', async () => {
    mocks.auth.mockResolvedValue({ ok: false, error: 'Account disabled' })
    const response = await callback(callbackRequest())
    expect(response.headers.get('location')).toBe('http://localhost:3000/login')
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(mocks.exchange).not.toHaveBeenCalled()
  })
  it('returns a safe callback error and clears cookies after an exchange failure', async () => {
    mocks.exchange.mockRejectedValue(new Error('secret-token'))
    const response = await callback(callbackRequest())
    expect(response.status).toBe(502)
    expect(await response.text()).not.toContain('secret-token')
    expect(response.cookies.get('ms_oauth_verifier')?.value).toBe('')
  })
  it('requires same-origin POST and authorization before disconnecting', async () => {
    expect((await disconnect(new Request('http://localhost:3000/api/microsoft/disconnect', { method: 'POST', headers: { origin: 'https://evil.example' } }))).status).toBe(403)
    expect(mocks.remove).not.toHaveBeenCalled()
    const response = await disconnect(new Request('http://localhost:3000/api/microsoft/disconnect', { method: 'POST', headers: { origin: 'http://localhost:3000' } }))
    expect(await response.json()).toEqual({ ok: true })
    expect(mocks.remove).toHaveBeenCalledWith(client, 'user')
    mocks.auth.mockResolvedValue({ ok: false, error: AUTHENTICATION_REQUIRED_ERROR })
    expect((await disconnect(new Request('http://localhost:3000/api/microsoft/disconnect', { method: 'POST', headers: { origin: 'http://localhost:3000' } }))).status).toBe(401)
  })
  it.each(['preview', 'dev_no_auth'])('blocks all routes in %s', async mode => {
    vi.stubEnv(mode === 'preview' ? 'VERCEL_ENV' : 'NEXT_PUBLIC_DEV_NO_AUTH', mode === 'preview' ? 'preview' : 'true')
    expect((await connect(new NextRequest('http://localhost:3000/api/microsoft/connect'))).status).toBe(503)
    expect((await callback(callbackRequest())).status).toBe(503)
    expect((await disconnect(new Request('http://localhost:3000/api/microsoft/disconnect', { method: 'POST' }))).status).toBe(503)
    expect(mocks.auth).not.toHaveBeenCalled()
  })
  it('fails closed when configuration or the encryption key is missing', async () => {
    vi.stubEnv('MICROSOFT_CLIENT_ID', '')
    expect((await connect(new NextRequest('http://localhost:3000/api/microsoft/connect', { headers: { 'sec-fetch-site': 'same-origin' } }))).status).toBe(503)
    vi.stubEnv('MICROSOFT_CLIENT_ID', 'client')
    vi.stubEnv('JOBBER_TOKEN_ENCRYPTION_KEY', '')
    expect((await callback(callbackRequest())).status).toBe(503)
    expect(mocks.exchange).not.toHaveBeenCalled()
  })
})

describe('OneDrive status action', () => {
  it('returns metadata without tokens and checks access', async () => {
    mocks.connection.mockResolvedValue({ accountEmail: 'jimee@paintbuddyco.com.au', connectedAt: 'today' })
    expect(await getOneDriveStatus()).toEqual({ ok: true, data: { configured: true, connected: true, accountEmail: 'jimee@paintbuddyco.com.au' } })
    expect(mocks.connection).toHaveBeenCalledWith(client, 'user')
    mocks.auth.mockResolvedValue({ ok: false, error: 'Forbidden' })
    expect(await getOneDriveStatus()).toEqual({ ok: false, error: 'Forbidden' })
  })
  it('reports unconfigured without touching stored credentials', async () => {
    vi.stubEnv('MICROSOFT_CLIENT_ID', '')
    expect(await getOneDriveStatus()).toEqual({ ok: true, data: { configured: false, connected: false, accountEmail: null } })
    expect(mocks.connection).not.toHaveBeenCalled()
  })
  it('blocks Preview and dev-no-auth', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect((await getOneDriveStatus()).ok).toBe(false)
    vi.stubEnv('VERCEL_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_DEV_NO_AUTH', 'true')
    expect((await getOneDriveStatus()).ok).toBe(false)
    expect(mocks.connection).not.toHaveBeenCalled()
  })
})
