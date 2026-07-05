import { createServiceClient } from '@/lib/supabase/server'
import { assertJobberReadOnlyScopes, type JobberConfig } from './config'
import { getTokenExpiresAt, refreshAccessToken } from './oauth'
import { assertJobberTokenStorageConfigured, decryptTokenValue, encryptTokenValue } from './token-encryption'

export interface StoredJobberToken {
  ownerUserId?: string
  accessToken: string
  refreshToken: string
  scope?: string | null
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

export function requireSharedJobberConnectionOwnerId(token: StoredJobberToken): string {
  if (!token.ownerUserId) {
    throw new Error('Unable to identify Jobber connection owner')
  }

  return token.ownerUserId
}

export async function getSharedJobberConnectionToken(): Promise<StoredJobberToken | null> {
  const service = await createServiceClient()
  const { data, error } = await service
    .from('jobber_tokens')
    .select('user_id, access_token, refresh_token, scope, expires_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error('Unable to read Jobber connection')
  }

  if (!data) return null
  assertJobberReadOnlyScopes(data.scope)

  return {
    ownerUserId: data.user_id,
    accessToken: decryptTokenValue(data.access_token),
    refreshToken: decryptTokenValue(data.refresh_token),
    expiresAt: data.expires_at,
  }
}

export async function refreshSharedJobberConnectionToken(
  currentRefreshToken: string,
  config: JobberConfig,
  ownerUserId: string
): Promise<StoredJobberToken> {
  assertJobberTokenStorageConfigured()

  let token
  try {
    token = await refreshAccessToken(currentRefreshToken, config)
  } catch (error) {
    if (isRefreshUnauthorizedError(error)) {
      const latestToken = await getSharedJobberConnectionToken()
      if (latestToken && latestToken.refreshToken !== currentRefreshToken && !shouldRefresh(latestToken.expiresAt)) {
        return latestToken
      }

      throw new Error('Jobber connection expired. Reconnect Jobber from Settings.')
    }
    throw error
  }
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
    .eq('user_id', ownerUserId)

  if (error) {
    throw new Error('Unable to save refreshed Jobber token')
  }

  return {
    ownerUserId,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt,
  }
}

export async function getUsableSharedJobberConnectionToken(
  config: JobberConfig
): Promise<StoredJobberToken | null> {
  const token = await getSharedJobberConnectionToken()
  if (!token) return null

  if (!shouldRefresh(token.expiresAt)) return token

  return refreshSharedJobberConnectionToken(token.refreshToken, config, requireSharedJobberConnectionOwnerId(token))
}
