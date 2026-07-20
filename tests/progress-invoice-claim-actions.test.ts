import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAllowedUser: vi.fn(),
  createDraft: vi.fn(),
  voidDraft: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/security/require-allowed-user', () => ({ requireAllowedUser: mocks.requireAllowedUser }))
vi.mock('@/lib/progress-invoices/claim-service', () => ({
  createProgressClaimDraft: mocks.createDraft,
  getProgressClaimDefaults: vi.fn(),
  getProgressClaimEditor: vi.fn(),
  saveProgressClaimDraft: vi.fn(),
  voidProgressClaimDraft: mocks.voidDraft,
}))

import { createProgressClaimDraft, voidProgressClaimDraft } from '@/lib/actions/progress-invoice-claims'

describe('progress Claim actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('checks authorization before validation or service access', async () => {
    mocks.requireAllowedUser.mockResolvedValue({ ok: false, error: 'AUTH_REQUIRED', code: 'AUTH' })

    await expect(createProgressClaimDraft({ malformed: true }))
      .resolves.toEqual({ ok: false, error: 'AUTH_REQUIRED', code: 'AUTH' })
    expect(mocks.requireAllowedUser).toHaveBeenCalledOnce()
    expect(mocks.createDraft).not.toHaveBeenCalled()
  })

  it('validates and delegates Draft Void before redirecting to the owning Series', async () => {
    mocks.requireAllowedUser.mockResolvedValue({ ok: true, data: true })
    mocks.voidDraft.mockResolvedValue({
      ok: true,
      data: {
        seriesId: '61000000-0000-4000-8000-000000000001',
        claimId: '61000000-0000-4000-8000-000000000002',
        seriesVersion: 8,
        claimVersion: 2,
        status: 'void',
      },
    })
    const input = {
      seriesId: '61000000-0000-4000-8000-000000000001',
      claimId: '61000000-0000-4000-8000-000000000002',
      expectedSeriesVersion: 7,
      expectedClaimVersion: 1,
      expectedCurrentRevisionSetId: null,
      expectedCurrentManifestHash: null,
      reason: 'Created in error',
      correlationKey: '61000000-0000-4000-8000-000000000003',
    }

    await expect(voidProgressClaimDraft(input)).resolves.toMatchObject({ ok: true })
    expect(mocks.voidDraft).toHaveBeenCalledWith(input)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/progress-invoices/61000000-0000-4000-8000-000000000001')
  })

  it('rejects an empty Draft Void reason without calling the service', async () => {
    mocks.requireAllowedUser.mockResolvedValue({ ok: true, data: true })
    const result = await voidProgressClaimDraft({
      seriesId: '61000000-0000-4000-8000-000000000001',
      claimId: '61000000-0000-4000-8000-000000000002',
      expectedSeriesVersion: 7,
      expectedClaimVersion: 1,
      expectedCurrentRevisionSetId: null,
      expectedCurrentManifestHash: null,
      reason: ' ',
      correlationKey: '61000000-0000-4000-8000-000000000003',
    })
    expect(result).toEqual({ ok: false, error: 'PROGRESS_VALIDATION_FAILED', code: 'VALIDATION' })
    expect(mocks.voidDraft).not.toHaveBeenCalled()
  })
})
