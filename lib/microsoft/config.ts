import 'server-only'

export const ONEDRIVE_PHOTO_ROOT = '/Paint Buddy & Co/Quote Photos'
export const MICROSOFT_SCOPES = 'offline_access User.Read Files.Read'
export const MICROSOFT_DISABLED_MESSAGE = 'OneDrive is disabled in this preview environment.'

export interface MicrosoftConfig {
  tenantId: string
  clientId: string
  clientSecret: string
  redirectUri: string
}

export function isMicrosoftDisabledInPreview(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === 'preview'
}

export function assertMicrosoftEnabled(): void {
  if (isMicrosoftDisabledInPreview()) throw new Error(MICROSOFT_DISABLED_MESSAGE)
}

export function getMicrosoftConfig(env: Record<string, string | undefined> = process.env): MicrosoftConfig {
  if (isMicrosoftDisabledInPreview(env)) throw new Error(MICROSOFT_DISABLED_MESSAGE)
  return {
    tenantId: env.MICROSOFT_TENANT_ID?.trim() ?? '',
    clientId: env.MICROSOFT_CLIENT_ID?.trim() ?? '',
    clientSecret: env.MICROSOFT_CLIENT_SECRET?.trim() ?? '',
    redirectUri: env.MICROSOFT_REDIRECT_URI?.trim() ?? '',
  }
}

export function getMissingMicrosoftConfigKeys(config: MicrosoftConfig): string[] {
  const missing: string[] = []
  if (!config.tenantId) missing.push('MICROSOFT_TENANT_ID')
  if (!config.clientId) missing.push('MICROSOFT_CLIENT_ID')
  if (!config.clientSecret) missing.push('MICROSOFT_CLIENT_SECRET')
  if (!config.redirectUri) missing.push('MICROSOFT_REDIRECT_URI')
  return missing
}
