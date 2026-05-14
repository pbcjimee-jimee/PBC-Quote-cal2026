import { createServiceClient } from '@/lib/supabase/server'
import type { JobberConfig } from './config'
import { getTokenExpiresAt, refreshAccessToken } from './oauth'

export interface StoredJobberToken {
  ownerUserId?: string
  accessToken: string
  refreshToken: string
  expiresAt: string | null
}

const REFRESH_SKEW_MS = 5 * 60 * 1000

function shouldRefresh(expiresAt: string | null, now = new Date()): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() <= now.getTime() + REFRESH_SKEW_MS
}

function isRefreshUnauthorizedError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('status 401')
}

export async function getStoredJobberToken(userId: string): Promise<StoredJobberToken | null> {
  void userId
  const service = await createServiceClient()
  const { data, error } = await service
    .from('jobber_tokens')
    .select('user_id, access_token, refresh_token, expires_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error('Unable to read Jobber connection')
  }

  if (!data) return null

  return {
    ownerUserId: data.user_id,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  }
}

export async function refreshStoredJobberToken(
  userId: string,
  currentRefreshToken: string,
  config: JobberConfig,
  tokenOwnerUserId = userId
): Promise<StoredJobberToken> {
  let token
  try {
    token = await refreshAccessToken(currentRefreshToken, config)
  } catch (error) {
    if (isRefreshUnauthorizedError(error)) {
      const latestToken = await getStoredJobberToken(userId)
      if (latestToken && latestToken.refreshToken !== currentRefreshToken && !shouldRefresh(latestToken.expiresAt)) {
        return latestToken
      }
    }
    throw error
  }
  const expiresAt = getTokenExpiresAt(token)
  const service = await createServiceClient()
  const { error } = await service
    .from('jobber_tokens')
    .update({
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      token_type: token.tokenType,
      scope: token.scope,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', tokenOwnerUserId)

  if (error) {
    throw new Error('Unable to save refreshed Jobber token')
  }

  return {
    ownerUserId: tokenOwnerUserId,
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

  return refreshStoredJobberToken(userId, token.refreshToken, config, token.ownerUserId ?? userId)
}
