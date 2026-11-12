import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AI_QUOTE_DISABLED_MESSAGES,
  AI_QUOTE_LIMITS,
  AI_QUOTE_MODELS,
  AI_QUOTE_PROMPT_VERSIONS,
  getAiQuoteAvailability,
  isAiQuoteUserAllowed,
} from '@/lib/ai-quote/config'

afterEach(() => vi.unstubAllEnvs())

describe('AI quote availability', () => {
  it('disables AI in Vercel preview before checking authentication or the key', () => {
    expect(getAiQuoteAvailability({ VERCEL_ENV: 'preview', ANTHROPIC_API_KEY: 'k' }, true))
      .toEqual({ enabled: false, reason: 'preview', message: AI_QUOTE_DISABLED_MESSAGES.preview })
  })

  it.each([undefined, ''])('disables AI when the key is %s', key => {
    expect(getAiQuoteAvailability({ VERCEL_ENV: 'production', ANTHROPIC_API_KEY: key }, false))
      .toEqual({ enabled: false, reason: 'missing_key', message: AI_QUOTE_DISABLED_MESSAGES.missing_key })
  })

  it('disables AI in dev no-auth mode before checking the key', () => {
    expect(getAiQuoteAvailability({}, true))
      .toEqual({ enabled: false, reason: 'dev_no_auth', message: AI_QUOTE_DISABLED_MESSAGES.dev_no_auth })
  })

  it.each(['production', 'development', undefined])('enables authenticated AI with a key in %s', environment => {
    expect(getAiQuoteAvailability({ VERCEL_ENV: environment, ANTHROPIC_API_KEY: 'k' }, false))
      .toEqual({ enabled: true })
  })

  it('uses the current environment and existing no-auth detection by default', () => {
    vi.stubEnv('VERCEL_ENV', 'development')
    vi.stubEnv('ANTHROPIC_API_KEY', 'k')
    vi.stubEnv('NEXT_PUBLIC_DEV_NO_AUTH', 'true')
    expect(getAiQuoteAvailability()).toMatchObject({ enabled: false, reason: 'dev_no_auth' })
  })

  it('pins the model id without a date suffix', () => {
    expect(AI_QUOTE_MODELS).toEqual({ analysis: 'claude-opus-5-5', draft: 'claude-sonnet-5-5' })
  })

  it('uses the confirmed limits and prompt versions', () => {
    expect(AI_QUOTE_LIMITS).toEqual({
      draftsPerDay: 20,
      knowledgeBuildsPerDay: 3,
      evalMemosPerDay: 30,
      evalDraftsPerDay: 45,
      evalSetSize: 20,
      memoMaxLength: 8000,
      existingLinesMax: 60,
      draftMaxTokens: 32000,
      knowledgeMaxTokens: 64000,
      evalMemoMaxTokens: 4000,
      monthlyBudgetUsdDefault: 30,
      photoAnalysesPerDay: 20,
      photoMax: 30,
      photoCollectMs: 60000,
      photoConcurrency: 6,
      photoAnalysisMaxTokens: 8000,
      photoAdjustmentDaysFactor: '1.5',
      photoAdjustmentLabourAdd: 2,
      photoAnalysisMaxAgeMs: 3600000,
    })
    expect(AI_QUOTE_PROMPT_VERSIONS).toEqual({
      draft: 'quote-draft-v5', knowledge: 'knowledge-v1', evalMemo: 'eval-memo-v1', photoAnalysis: 'photo-analysis-v1',
    })
  })
})


describe('AI quote allowed account', () => {
  it.each(['jimee@paintbuddyco.com.au', ' JIMEE@PAINTBUDDYCO.COM.AU '])('allows the configured account: %s', email => {
    expect(isAiQuoteUserAllowed(email)).toBe(true)
  })

  it.each([null, undefined, '', '  ', 'other@paintbuddyco.com.au', 'jimee@paintbuddyco.com.au.example'])('rejects other accounts: %s', email => {
    expect(isAiQuoteUserAllowed(email)).toBe(false)
  })
})
