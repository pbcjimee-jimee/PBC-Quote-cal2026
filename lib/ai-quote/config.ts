import 'server-only'
import { isDevNoAuthMode } from '@/lib/actions/types'

export const AI_QUOTE_ALLOWED_EMAILS = ['jimee@paintbuddyco.com.au'] as const

export function isAiQuoteUserAllowed(email: string | null | undefined): boolean {
  return AI_QUOTE_ALLOWED_EMAILS.some(allowed => allowed === email?.trim().toLowerCase())
}

export const AI_QUOTE_MODELS = { analysis: 'claude-opus-5-5', draft: 'claude-sonnet-5-5' } as const

export const AI_QUOTE_PROMPT_VERSIONS = {
  draft: 'quote-draft-v4',
  knowledge: 'knowledge-v1',
  evalMemo: 'eval-memo-v1',
  photoAnalysis: 'photo-analysis-v1',
} as const

export const AI_QUOTE_LIMITS = {
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
} as const

export type AiQuoteAvailability =
  | { enabled: true }
  | { enabled: false; reason: 'preview' | 'dev_no_auth' | 'missing_key' | 'not_allowed'; message: string }

export const AI_QUOTE_DISABLED_MESSAGES: Record<'preview' | 'dev_no_auth' | 'missing_key' | 'not_allowed', string> = {
  not_allowed: 'AI quoting is not enabled for your account.',
  preview: 'AI quoting is unavailable in Preview.',
  dev_no_auth: 'AI quoting requires authentication.',
  missing_key: 'AI quoting is not configured. Contact an administrator.',
}

export function getAiQuoteAvailability(
  env: Record<string, string | undefined> = process.env,
  devNoAuth: boolean = isDevNoAuthMode(),
): AiQuoteAvailability {
  const reason = env.VERCEL_ENV === 'preview' ? 'preview'
    : devNoAuth ? 'dev_no_auth'
    : !env.ANTHROPIC_API_KEY ? 'missing_key'
    : null

  return reason ? { enabled: false, reason, message: AI_QUOTE_DISABLED_MESSAGES[reason] } : { enabled: true }
}
