import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAllowedUser: vi.fn(),
  createDraft: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/security/require-allowed-user', () => ({ requireAllowedUser: mocks.requireAllowedUser }))
vi.mock('@/lib/progress-invoices/claim-service', () => ({
  createProgressClaimDraft: mocks.createDraft,
  getProgressClaimDefaults: vi.fn(),
  getProgressClaimEditor: vi.fn(),
  saveProgressClaimDraft: vi.fn(),
}))

import { createProgressClaimDraft } from '@/lib/actions/progress-invoice-claims'

describe('progress Claim actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('checks authorization before validation or service access', async () => {
    mocks.requireAllowedUser.mockResolvedValue({ ok: false, error: 'AUTH_REQUIRED', code: 'AUTH' })

    await expect(createProgressClaimDraft({ malformed: true }))
      .resolves.toEqual({ ok: false, error: 'AUTH_REQUIRED', code: 'AUTH' })
    expect(mocks.requireAllowedUser).toHaveBeenCalledOnce()
    expect(mocks.createDraft).not.toHaveBeenCalled()
  })
})
