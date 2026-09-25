export const JOBBER_DISABLED_MESSAGE = 'Jobber is disabled in this preview environment.'

export function isJobberDisabledInPreview(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.VERCEL_ENV === 'preview'
}

export function assertJobberEnabled(): void {
  if (isJobberDisabledInPreview()) {
    throw new Error(JOBBER_DISABLED_MESSAGE)
  }
}
