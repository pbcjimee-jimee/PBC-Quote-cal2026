import 'server-only'
import { isDevNoAuthMode } from '@/lib/actions/types'

export const AI_QUOTE_MODEL = 'claude-opus-5-5'

export const AI_QUOTE_PROMPT_VERSIONS = {
  draft: 'quote-draft-v3',
  knowledge: 'knowledge-v1',
  evalMemo: 'eval-memo-v1',
} as const

export const AI_QUOTE_LIMITS = {
  draftsPerDay: 20,
  knowledgeBuildsPerDay: 3,
  evalMemosPerDay: 30,
  evalDraftsPerDay: 30,
  evalSetSize: 20,
  memoMaxLength: 8000,
  existingLinesMax: 60,
  draftMaxTokens: 32000,
  knowledgeMaxTokens: 64000,
  evalMemoMaxTokens: 4000,
  monthlyBudgetUsdDefault: 30,
} as const

export type AiQuoteAvailability =
  | { enabled: true }
  | { enabled: false; reason: 'preview' | 'dev_no_auth' | 'missing_key'; message: string }

export const AI_QUOTE_DISABLED_MESSAGES: Record<'preview' | 'dev_no_auth' | 'missing_key', string> = {
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
