import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { decryptTokenValue, encryptTokenValue } from '@/lib/jobber/token-encryption'
import { assertMicrosoftEnabled, type MicrosoftConfig } from './config'
import { refreshMicrosoftToken, type MicrosoftFetcher, type MicrosoftTokenResponse } from './oauth'

function tokenValues(token: MicrosoftTokenResponse) {
  return {
    access_token: encryptTokenValue(token.accessToken), refresh_token: encryptTokenValue(token.refreshToken),
    scope: token.scope, expires_at: new Date(Date.now() + token.expiresIn * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export async function saveMicrosoftToken(supabase: SupabaseClient<Database>, userId: string, accountEmail: string, token: MicrosoftTokenResponse): Promise<void> {
  assertMicrosoftEnabled()
  const { error } = await supabase.from('microsoft_tokens').upsert({
    user_id: userId, account_email: accountEmail, ...tokenValues(token), connected_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw error
}

export async function getMicrosoftConnection(supabase: SupabaseClient<Database>, userId: string): Promise<{ accountEmail: string; connectedAt: string } | null> {
  assertMicrosoftEnabled()
  const { data, error } = await supabase.from('microsoft_tokens').select('account_email, connected_at').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data ? { accountEmail: data.account_email, connectedAt: data.connected_at } : null
}

export async function getUsableMicrosoftAccessToken(supabase: SupabaseClient<Database>, userId: string, config: MicrosoftConfig, fetcher?: MicrosoftFetcher): Promise<
  { ok: true; accessToken: string } | { ok: false; reason: 'not_connected' | 'reconnect_required' }
> {
  assertMicrosoftEnabled()
  const { data, error } = await supabase.from('microsoft_tokens').select('access_token, refresh_token, expires_at').eq('user_id', userId).maybeSingle()
  if (error) throw error
  if (!data) return { ok: false, reason: 'not_connected' }
  try {
    if (data.expires_at && Date.parse(data.expires_at) > Date.now() + 300000) {
      return { ok: true, accessToken: decryptTokenValue(data.access_token) }
    }
    const token = await refreshMicrosoftToken(decryptTokenValue(data.refresh_token), config, fetcher)
    const updated = await supabase.from('microsoft_tokens').update(tokenValues(token)).eq('user_id', userId)
    if (updated.error) throw updated.error
    return { ok: true, accessToken: token.accessToken }
  } catch {
    return { ok: false, reason: 'reconnect_required' }
  }
}

export async function deleteMicrosoftToken(supabase: SupabaseClient<Database>, userId: string): Promise<void> {
  assertMicrosoftEnabled()
  const { error } = await supabase.from('microsoft_tokens').delete().eq('user_id', userId)
  if (error) throw error
}
