'use server'

import { isDevNoAuthMode, type ActionResult } from '@/lib/actions/types'
import { requireAiQuoteUser } from '@/lib/ai-quote/access'
import { getMissingJobberTokenStorageConfigKeys } from '@/lib/jobber/token-encryption'
import { getMicrosoftConfig, getMissingMicrosoftConfigKeys, isMicrosoftDisabledInPreview, MICROSOFT_DISABLED_MESSAGE } from '@/lib/microsoft/config'
import { getMicrosoftConnection } from '@/lib/microsoft/tokens'
import { createClient } from '@/lib/supabase/server'

export async function getOneDriveStatus(): Promise<ActionResult<{ configured: boolean; connected: boolean; accountEmail: string | null }>> {
  if (isMicrosoftDisabledInPreview()) return { ok: false, error: MICROSOFT_DISABLED_MESSAGE }
  if (isDevNoAuthMode()) return { ok: false, code: 'AUTH_REQUIRED', error: 'OneDrive requires authentication.' }
  try {
    const auth = await requireAiQuoteUser()
    if (!auth.ok) return auth
    const configured = [...getMissingMicrosoftConfigKeys(getMicrosoftConfig()), ...getMissingJobberTokenStorageConfigKeys()].length === 0
    const connection = configured ? await getMicrosoftConnection(await createClient(), auth.user.id) : null
    return { ok: true, data: { configured, connected: Boolean(connection), accountEmail: connection?.accountEmail ?? null } }
  } catch {
    return { ok: false, error: 'Unable to load OneDrive. Please try again.' }
  }
}
