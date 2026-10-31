import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { assertMicrosoftEnabled, MICROSOFT_SCOPES, type MicrosoftConfig } from './config'

export interface MicrosoftTokenResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
  scope: string | null
}

export type MicrosoftFetcher = (input: string, init: RequestInit) => Promise<Response>

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().finite().positive(),
  scope: z.string().optional(),
})

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

export function buildMicrosoftAuthorizationUrl(config: MicrosoftConfig, state: string, challenge: string): string {
  assertMicrosoftEnabled()
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/authorize`)
  url.search = new URLSearchParams({
    client_id: config.clientId, response_type: 'code', redirect_uri: config.redirectUri,
    response_mode: 'query', scope: MICROSOFT_SCOPES, state,
    code_challenge: challenge, code_challenge_method: 'S256',
  }).toString()
  return url.toString()
}

async function requestToken(config: MicrosoftConfig, parameters: Record<string, string>, fetcher: MicrosoftFetcher, previousRefreshToken?: string): Promise<MicrosoftTokenResponse> {
  assertMicrosoftEnabled()
  const response = await fetcher(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, scope: MICROSOFT_SCOPES, ...parameters }),
  })
  if (!response.ok) throw new Error(`Microsoft token request failed with status ${response.status}`)
  const parsed = tokenSchema.safeParse(await response.json())
  if (!parsed.success || !(parsed.data.refresh_token ?? previousRefreshToken)) throw new Error('Invalid Microsoft token response')
  return {
    accessToken: parsed.data.access_token, refreshToken: parsed.data.refresh_token ?? previousRefreshToken!,
    expiresIn: parsed.data.expires_in, scope: parsed.data.scope ?? null,
  }
}

export async function exchangeMicrosoftCode(code: string, verifier: string, config: MicrosoftConfig, fetcher: MicrosoftFetcher = fetch): Promise<MicrosoftTokenResponse> {
  return requestToken(config, { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: config.redirectUri }, fetcher)
}

export async function refreshMicrosoftToken(refreshToken: string, config: MicrosoftConfig, fetcher: MicrosoftFetcher = fetch): Promise<MicrosoftTokenResponse> {
  return requestToken(config, { grant_type: 'refresh_token', refresh_token: refreshToken }, fetcher, refreshToken)
}
