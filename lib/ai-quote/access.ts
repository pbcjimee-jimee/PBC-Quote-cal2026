import 'server-only'
import { AI_QUOTE_DISABLED_MESSAGES, getAiQuoteAvailability, isAiQuoteUserAllowed, type AiQuoteAvailability } from '@/lib/ai-quote/config'
import { requireRole, type RequireAppUserResult } from '@/lib/security/require-app-user'

export async function requireAiQuoteUser(): Promise<RequireAppUserResult> {
  const auth = await requireRole('admin')
  if (!auth.ok) return auth
  if (!isAiQuoteUserAllowed(auth.user.email ?? auth.profile.email)) {
    return { ok: false, error: AI_QUOTE_DISABLED_MESSAGES.not_allowed }
  }
  return auth
}

export function getAiQuoteAvailabilityForUser(email: string | null | undefined): AiQuoteAvailability {
  const availability = getAiQuoteAvailability()
  if (!availability.enabled) return availability
  return isAiQuoteUserAllowed(email) ? availability
    : { enabled: false, reason: 'not_allowed', message: AI_QUOTE_DISABLED_MESSAGES.not_allowed }
}
