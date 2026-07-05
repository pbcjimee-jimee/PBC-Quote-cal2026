const MAX_FAILED_LOGIN_ATTEMPTS = 5
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const LOGIN_LOCK_MS = 15 * 60 * 1000

type LoginAttemptState = {
  failedAttempts: number
  resetAt: number
  lockedUntil: number
}

type LoginRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

const loginAttempts = new Map<string, LoginAttemptState>()

export const LOGIN_LOCKED_ERROR = 'Too many login attempts. Try again later.'
export const AUTHENTICATION_REQUIRED_ERROR = 'Authentication required'
export const USER_NOT_ALLOWED_ERROR = 'User is not allowed to access this app'

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isLoginEmailAllowed(
  email: string,
  allowedEmails = process.env.ALLOWED_LOGIN_EMAILS,
  nodeEnv = process.env.NODE_ENV
): boolean {
  const configuredEmails = (allowedEmails ?? '')
    .split(/[,\s]+/)
    .map(normalizeLoginEmail)
    .filter(Boolean)

  if (configuredEmails.length === 0) return nodeEnv !== 'production'

  return configuredEmails.includes(normalizeLoginEmail(email))
}

export function isAuthenticatedUserAllowed(
  user: { email?: string | null },
  allowedEmails = process.env.ALLOWED_LOGIN_EMAILS,
  nodeEnv = process.env.NODE_ENV
): boolean {
  if (!(allowedEmails ?? '').trim()) return nodeEnv !== 'production'
  return typeof user.email === 'string' && isLoginEmailAllowed(user.email, allowedEmails, nodeEnv)
}

export function createLoginRateLimitKey(email: string, requestFingerprint: string): string {
  const fingerprint = requestFingerprint.trim() || 'unknown'
  return `${normalizeLoginEmail(email)}:${fingerprint}`
}

export function checkLoginRateLimit(key: string, now = Date.now()): LoginRateLimitResult {
  const state = loginAttempts.get(key)
  if (!state) return { allowed: true }

  if (state.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((state.lockedUntil - now) / 1000)),
    }
  }

  if (state.resetAt <= now) {
    loginAttempts.delete(key)
  }

  return { allowed: true }
}

export function recordFailedLogin(key: string, now = Date.now()): LoginRateLimitResult {
  const currentStatus = checkLoginRateLimit(key, now)
  if (!currentStatus.allowed) return currentStatus

  const existing = loginAttempts.get(key)
  const state = existing && existing.resetAt > now
    ? existing
    : {
        failedAttempts: 0,
        resetAt: now + LOGIN_ATTEMPT_WINDOW_MS,
        lockedUntil: 0,
      }

  state.failedAttempts += 1

  if (state.failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
    state.lockedUntil = now + LOGIN_LOCK_MS
  }

  loginAttempts.set(key, state)
  return checkLoginRateLimit(key, now)
}

export function clearLoginRateLimit(key: string): void {
  loginAttempts.delete(key)
}

export function resetLoginRateLimitsForTests(): void {
  loginAttempts.clear()
}
