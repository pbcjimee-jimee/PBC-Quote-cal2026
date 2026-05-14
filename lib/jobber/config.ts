export const JOBBER_AUTHORIZATION_URL = 'https://api.getjobber.com/api/oauth/authorize'
export const JOBBER_TOKEN_URL = 'https://api.getjobber.com/api/oauth/token'
export const JOBBER_GRAPHQL_URL = 'https://api.getjobber.com/api/graphql'

export interface JobberConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  graphqlVersion: string
  accessToken: string
}

type Env = Record<string, string | undefined>

function envValue(env: Env, key: string): string {
  return env[key]?.trim() ?? ''
}

export function getJobberConfig(env: Env = process.env): JobberConfig {
  return {
    clientId: envValue(env, 'JOBBER_CLIENT_ID'),
    clientSecret: envValue(env, 'JOBBER_CLIENT_SECRET'),
    redirectUri: envValue(env, 'JOBBER_REDIRECT_URI') || envValue(env, 'JOBBER_CALLBACK_URL'),
    graphqlVersion: envValue(env, 'JOBBER_GRAPHQL_VERSION'),
    accessToken: envValue(env, 'JOBBER_ACCESS_TOKEN'),
  }
}

export function getMissingOAuthConfigKeys(config: JobberConfig): string[] {
  const missing: string[] = []
  if (!config.clientId) missing.push('JOBBER_CLIENT_ID')
  if (!config.clientSecret) missing.push('JOBBER_CLIENT_SECRET')
  if (!config.redirectUri) missing.push('JOBBER_REDIRECT_URI')
  return missing
}

export function getMissingGraphqlConfigKeys(config: JobberConfig): string[] {
  const missing: string[] = []
  if (!config.graphqlVersion) missing.push('JOBBER_GRAPHQL_VERSION')
  return missing
}

export function buildJobberAuthorizationUrl(config: JobberConfig, state: string): URL {
  const url = new URL(JOBBER_AUTHORIZATION_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('state', state)
  return url
}
