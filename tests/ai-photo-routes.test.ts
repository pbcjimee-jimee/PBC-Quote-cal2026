import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTHENTICATION_REQUIRED_ERROR } from '@/lib/security/auth-policy'
import { MicrosoftAuthError } from '@/lib/microsoft/graph'

const mocks = vi.hoisted(() => ({
  budget: vi.fn(), availability: vi.fn(), requireRole: vi.fn(), createClient: vi.fn(), count: vi.fn(), analyze: vi.fn(),
  token: vi.fn(), folders: vi.fn(), images: vi.fn(),
}))
vi.mock('@/lib/ai-quote/budget', () => ({ getAiMonthlyBudgetStatus: mocks.budget }))
vi.mock('@/lib/ai-quote/config', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/ai-quote/config')>(), getAiQuoteAvailability: mocks.availability,
}))
vi.mock('@/lib/security/require-app-user', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/ai-quote/runs', () => ({ countRecentRuns: mocks.count }))
vi.mock('@/lib/ai-quote/photo-analysis-service', () => ({ analyzeQuotePhotos: mocks.analyze }))
vi.mock('@/lib/microsoft/tokens', () => ({ getUsableMicrosoftAccessToken: mocks.token }))
vi.mock('@/lib/microsoft/graph', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/microsoft/graph')>(), listQuotePhotoFolders: mocks.folders, listFolderImages: mocks.images,
}))

import { POST as folders } from '@/app/api/ai/photos/folders/route'
import { POST as analyze, maxDuration } from '@/app/api/ai/photos/analyze/route'

const supabase = { client: 'session' }
const analysis = { runId: 'run-1', findings: [], photoCount: 1, skippedCount: 0, photoLabels: [{ ref: 1, name: 'site.png' }] }
const folder = { id: 'folder-1', name: 'quote 3000 - 15 Kingsway' }
const folderInput = { quoteNumber: '3000', address: '15 Kingsway, Dee Why NSW 2099' }
const analyzeInput = { folderId: 'folder-1', memo: 'Paint Stairwell', jobberContext: null }
function request(body: unknown, site = 'same-origin') {
  return new Request('https://pbc.example/api/ai/photos', {
    method: 'POST', headers: { 'sec-fetch-site': site, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  for (const name of ['MICROSOFT_TENANT_ID', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_REDIRECT_URI']) vi.stubEnv(name, 'set')
  mocks.availability.mockReturnValue({ enabled: true })
  mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'admin-1', email: 'jimee@paintbuddyco.com.au' },
    profile: { email: 'jimee@paintbuddyco.com.au', role: 'admin' } })
  mocks.createClient.mockResolvedValue(supabase)
  mocks.budget.mockResolvedValue({ budgetUsd: '30.00', spentUsd: '1.00', remainingUsd: '29.00', reached: false })
  mocks.count.mockResolvedValue(0)
  mocks.analyze.mockResolvedValue({ ok: true, ...analysis })
  mocks.token.mockResolvedValue({ ok: true, accessToken: 'token' })
  mocks.folders.mockResolvedValue([folder])
  mocks.images.mockResolvedValue([{ id: 'image-1', name: 'site.png' }])
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe.each([
  ['folders', folders, folderInput], ['analyze', analyze, analyzeInput],
] as const)('photo %s request guards', (_label, handler, body) => {
  it('rejects disabled environments before reading user data', async () => {
    mocks.availability.mockReturnValue({ enabled: false, message: 'AI quoting is unavailable in Preview.' })
    expect((await handler(request(body))).status).toBe(503)
    expect(mocks.requireRole).not.toHaveBeenCalled()
  })

  it.each([[AUTHENTICATION_REQUIRED_ERROR, 401], ['Forbidden', 403]] as const)('maps %s to %s', async (error, status) => {
    mocks.requireRole.mockResolvedValue({ ok: false, error })
    expect((await handler(request(body))).status).toBe(status)
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('rejects other admins using the AI allowlist', async () => {
    mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'other', email: 'other@example.com' }, profile: { role: 'admin' } })
    expect((await handler(request(body))).status).toBe(403)
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('requires the same origin', async () => {
    expect((await handler(request(body, 'cross-site'))).status).toBe(403)
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON', async () => {
    expect((await handler(new Request('https://pbc.example/api/ai/photos', {
      method: 'POST', headers: { 'sec-fetch-site': 'same-origin' }, body: '{',
    }))).status).toBe(400)
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
})

describe('photo folders route', () => {
  it('reports not connected without reading tokens while OneDrive is not configured', async () => {
    vi.stubEnv('MICROSOFT_CLIENT_ID', '')
    const response = await folders(request(folderInput))
    expect(await response.json()).toEqual({ ok: true, data: { connected: false, selected: null, candidates: [], photoCount: null } })
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.token).not.toHaveBeenCalled()
  })

  it('counts images only for a uniquely selected folder', async () => {
    const response = await folders(request(folderInput))
    expect(await response.json()).toEqual({ ok: true, data: { connected: true, selected: folder, candidates: [], photoCount: 1 } })
    expect(mocks.images).toHaveBeenCalledExactlyOnceWith('token', 'folder-1')
  })

  it('returns zero when the selected folder has no images', async () => {
    mocks.images.mockResolvedValue([])
    expect(await (await folders(request(folderInput))).json()).toMatchObject({ ok: true, data: { photoCount: 0 } })
  })

  it('returns candidates without counting images when the quote number is duplicated', async () => {
    mocks.folders.mockResolvedValue([folder, { id: 'duplicate', name: 'quote 3000 - other' }])
    const response = await folders(request(folderInput))
    expect(await response.json()).toMatchObject({ ok: true, data: {
      connected: true, selected: null, candidates: [{ id: 'folder-1' }, { id: 'duplicate' }], photoCount: null,
    } })
    expect(mocks.images).not.toHaveBeenCalled()
  })

  it('treats a missing connection as a successful disconnected response', async () => {
    mocks.token.mockResolvedValue({ ok: false, reason: 'not_connected' })
    expect(await (await folders(request(folderInput))).json()).toEqual({ ok: true, data: {
      connected: false, selected: null, candidates: [], photoCount: null,
    } })
    expect(mocks.folders).not.toHaveBeenCalled()
  })

  it.each(['token', 'folders'] as const)('asks to reconnect after %s auth failure', async stage => {
    if (stage === 'token') mocks.token.mockResolvedValue({ ok: false, reason: 'reconnect_required' })
    else mocks.folders.mockRejectedValue(new MicrosoftAuthError())
    const response = await folders(request(folderInput))
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ ok: false, error: expect.stringContaining('Reconnect OneDrive in Settings > AI') })
  })

  it.each([{ ...folderInput, quoteNumber: 'x'.repeat(201) }, { ...folderInput, address: 'x'.repeat(201) }, {}])
    ('rejects invalid lookup fields', async body => {
      expect((await folders(request(body))).status).toBe(400)
      expect(mocks.token).not.toHaveBeenCalled()
    })

  it('does not expose provider errors or customer details', async () => {
    mocks.folders.mockRejectedValue(new Error('private@example.com 15 Secret Street'))
    const response = await folders(request(folderInput))
    expect(response.status).toBe(502)
    expect(JSON.stringify(await response.json())).not.toMatch(/private@example|15 Secret/)
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/private@example|15 Secret/)
  })
})

describe('photo analyze route', () => {
  it('returns analysis data and forwards the authenticated user and request abort signal', async () => {
    const req = request(analyzeInput)
    expect(await (await analyze(req)).json()).toEqual({ ok: true, data: analysis })
    expect(mocks.analyze).toHaveBeenCalledExactlyOnceWith(supabase, { ...analyzeInput, userId: 'admin-1', signal: req.signal })
    expect(mocks.count).toHaveBeenCalledWith(supabase, 'admin-1', 'photo_analysis', expect.any(Date))
    expect(mocks.count.mock.invocationCallOrder[0]).toBeLessThan(mocks.budget.mock.invocationCallOrder[0])
    expect(mocks.budget.mock.invocationCallOrder[0]).toBeLessThan(mocks.analyze.mock.invocationCallOrder[0])
  })

  it('enforces a separate daily photo analysis limit of 20', async () => {
    mocks.count.mockResolvedValue(20)
    expect((await analyze(request(analyzeInput))).status).toBe(429)
    expect(mocks.budget).not.toHaveBeenCalled()
    expect(mocks.analyze).not.toHaveBeenCalled()
  })

  it('stops before analysis when the monthly budget is reached', async () => {
    mocks.budget.mockResolvedValue({ reached: true, spentUsd: '30.01', budgetUsd: '30.00' })
    const response = await analyze(request(analyzeInput))
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ ok: false, error: expect.stringContaining('Monthly AI budget reached ($30.01 of $30.00)') })
    expect(mocks.analyze).not.toHaveBeenCalled()
  })

  it.each([
    ['not_connected', 409], ['reconnect_required', 409], ['no_photos', 422], ['no_knowledge', 409],
    ['refusal', 422], ['rate_limited', 429], ['timeout', 504], ['max_tokens', 502], ['invalid_output', 502], ['api_error', 502],
  ])('maps %s to %s', async (errorCode, status) => {
    mocks.analyze.mockResolvedValue({ ok: false, runId: null, errorCode })
    expect((await analyze(request(analyzeInput))).status).toBe(status)
  })

  it.each([
    { ...analyzeInput, folderId: '' }, { ...analyzeInput, folderId: 'x'.repeat(201) },
    { ...analyzeInput, memo: 'x'.repeat(8001) }, { ...analyzeInput, jobberContext: { workType: 'Interior' } },
  ])('rejects invalid analysis fields', async body => {
    expect((await analyze(request(body))).status).toBe(400)
    expect(mocks.analyze).not.toHaveBeenCalled()
  })

  it('accepts empty notes for photo-only analysis and strips untrusted extra context', async () => {
    const response = await analyze(request({ ...analyzeInput, memo: '', photoFindings: ['forged'], address: '15 Secret Street' }))
    expect(response.status).toBe(200)
    expect(mocks.analyze.mock.calls[0][1]).not.toHaveProperty('address')
    expect(mocks.analyze.mock.calls[0][1]).not.toHaveProperty('photoFindings')
  })

  it('returns safe errors for thrown dependencies', async () => {
    mocks.analyze.mockRejectedValue(new Error('private@example.com'))
    const response = await analyze(request(analyzeInput))
    expect(response.status).toBe(502)
    expect(JSON.stringify(await response.json())).not.toContain('private@example.com')
  })

  it('allows 300 seconds for the separate photo analysis request', () => expect(maxDuration).toBe(300))
})
