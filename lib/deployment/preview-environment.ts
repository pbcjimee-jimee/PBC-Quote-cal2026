export const PREVIEW_SUPABASE_PROJECT_REF = 'wzntbkdkessgbgoyekir'
export const PREVIEW_SUPABASE_URL = `https://${PREVIEW_SUPABASE_PROJECT_REF}.supabase.co`

function isMatchingKey(key: string | undefined, role: 'anon' | 'service_role'): boolean {
  if (!key) return false
  if (key.startsWith(role === 'anon' ? 'sb_publishable_' : 'sb_secret_')) return true
  try {
    const payload: unknown = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload === 'object' && payload !== null &&
      'ref' in payload && payload.ref === PREVIEW_SUPABASE_PROJECT_REF &&
      'role' in payload && payload.role === role
  } catch {
    return false
  }
}

export function assertPreviewEnvironment(env: Record<string, string | undefined> = process.env): void {
  if (env.VERCEL_ENV !== 'preview') return

  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const publicKeys = [env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, env.NEXT_PUBLIC_SUPABASE_ANON_KEY]
  if (
    (url !== PREVIEW_SUPABASE_URL && url !== `${PREVIEW_SUPABASE_URL}/`) ||
    !publicKeys.some(Boolean) ||
    publicKeys.some(key => key !== undefined && !isMatchingKey(key, 'anon')) ||
    !isMatchingKey(env.SUPABASE_SERVICE_ROLE_KEY, 'service_role')
  ) {
    throw new Error('Preview requires the isolated test Supabase project and matching test API keys.')
  }

  if (env.NEXT_PUBLIC_DEV_NO_AUTH !== 'false') {
    throw new Error('Preview requires authentication. Set NEXT_PUBLIC_DEV_NO_AUTH=false.')
  }

  if ([
    'JOBBER_CLIENT_ID', 'JOBBER_CLIENT_SECRET', 'JOBBER_REDIRECT_URI',
    'JOBBER_CALLBACK_URL', 'JOBBER_TOKEN_ENCRYPTION_KEY', 'JOBBER_ACCESS_TOKEN',
  ].some(key => Boolean(env[key]))) {
    throw new Error('Preview must not contain Jobber credentials or callback configuration.')
  }
}
