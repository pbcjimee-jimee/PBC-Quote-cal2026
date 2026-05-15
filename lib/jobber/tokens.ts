import { createServiceClient } from '@/lib/supabase/server'
import type { JobberConfig } from './config'
import { getTokenExpiresAt, refreshAccessToken } from './oauth'
import { decryptTokenValue, encryptTokenValue } from './token-encryption'

export interface StoredJobberToken {
  accessToken: string
  refreshToken: string
  expiresAt: string | null
}

const REFRESH_SKEW_MS = 5 * 60 * 1000

function shouldRefresh(expiresAt: string | null, now = new Date()): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() <= now.getTime() + REFRESH_SKEW_MS
}

export async function getStoredJobberToken(userId: string): Promise<StoredJobberToken | null> {
  const service = await createServiceClient()
  const { data, error } = await service
    .from('jobber_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error('Unable to read Jobber connection')
  }

  if (!data) return null

  return {
    accessToken: decryptTokenValue(data.access_token),
    refreshToken: decryptTokenValue(data.refresh_token),
    expiresAt: data.expires_at,
  }
}

export async function refreshStoredJobberToken(
  userId: string,
  currentRefreshToken: string,
  config: JobberConfig
): Promise<StoredJobberToken> {
  const token = await refreshAccessToken(currentRefreshToken, config)
  const expiresAt = getTokenExpiresAt(token)
  const service = await createServiceClient()
  const { error } = await service
    .from('jobber_tokens')
    .update({
      access_token: encryptTokenValue(token.accessToken),
      refresh_token: encryptTokenValue(token.refreshToken),
      token_type: token.tokenType,
      scope: token.scope,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (error) {
    throw new Error('Unable to save refreshed Jobber token')
  }

  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt,
  }
}

export async function getUsableJobberToken(
  userId: string,
  config: JobberConfig
): Promise<StoredJobberToken | null> {
  const token = await getStoredJobberToken(userId)
  if (!token) return null

  if (!shouldRefresh(token.expiresAt)) return token

  return refreshStoredJobberToken(userId, token.refreshToken, config)
}
