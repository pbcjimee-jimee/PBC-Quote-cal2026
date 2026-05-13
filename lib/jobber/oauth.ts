import { JOBBER_TOKEN_URL, type JobberConfig } from './config'

export interface JobberTokenResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number | null
  tokenType: string | null
  scope: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function exchangeAuthorizationCode(
  code: string,
  config: JobberConfig,
  fetcher: (input: string, init: RequestInit) => Promise<Response> = fetch
): Promise<JobberTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
  })

  const response = await fetcher(JOBBER_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!response.ok) {
    throw new Error(`Jobber token exchange failed with status ${response.status}`)
  }

  const payload: unknown = await response.json()
  if (!isRecord(payload) || typeof payload.access_token !== 'string' || typeof payload.refresh_token !== 'string') {
    throw new Error('Invalid Jobber token response')
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: typeof payload.expires_in === 'number' ? payload.expires_in : null,
    tokenType: typeof payload.token_type === 'string' ? payload.token_type : null,
    scope: typeof payload.scope === 'string' ? payload.scope : null,
  }
}
